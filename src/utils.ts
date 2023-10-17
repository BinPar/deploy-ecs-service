import { warning } from '@actions/core';
import { type RegisterTaskDefinitionCommandInput } from '@aws-sdk/client-ecs';
import type { ServiceDefinition } from './models/serviceDefinition';

const IGNORED_TASK_DEFINITION_ATTRIBUTES = [
  'compatibilities',
  'taskDefinitionArn',
  'requiresAttributes',
  'revision',
  'status',
  'registeredAt',
  'deregisteredAt',
  'registeredBy',
] as const;

export function isEmptyValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    for (const element of value) {
      if (!isEmptyValue(element)) {
        // the array has at least one non-empty element
        return false;
      }
    }
    // the array has no non-empty elements
    return true;
  }

  if (typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      if (!isEmptyValue(childValue)) {
        // the object has at least one non-empty property
        return false;
      }
    }
    // the object has no non-empty property
    return true;
  }

  return false;
}

export function emptyValueReplacer<T>(_: unknown, value: T | T[]) {
  if (isEmptyValue(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.filter((e) => !isEmptyValue(e));
  }

  return value;
}

export function cleanNullKeys<T>(obj: T) {
  return JSON.parse(JSON.stringify(obj, emptyValueReplacer)) as T;
}

export function removeIgnoredAttributes<T>(taskDef: T) {
  for (const attribute of IGNORED_TASK_DEFINITION_ATTRIBUTES) {
    if (taskDef[attribute as keyof T]) {
      warning(
        `Ignoring property '${attribute}' in the task definition file. ` +
          'This property is returned by the Amazon ECS DescribeTaskDefinition API and may be shown in the ECS console, ' +
          'but it is not a valid field when registering a new task definition. ' +
          'This field can be safely removed from your task definition file.',
      );
      delete taskDef[attribute as keyof T];
    }
  }

  return taskDef;
}

function validateProxyConfigurations(
  taskDef: RegisterTaskDefinitionCommandInput,
) {
  return (
    'proxyConfiguration' in taskDef &&
    taskDef?.proxyConfiguration?.type &&
    taskDef.proxyConfiguration.type == 'APPMESH' &&
    taskDef.proxyConfiguration.properties &&
    taskDef.proxyConfiguration.properties.length > 0
  );
}

export function maintainValidObjects(
  taskDef: RegisterTaskDefinitionCommandInput,
) {
  if (validateProxyConfigurations(taskDef)) {
    taskDef?.proxyConfiguration?.properties?.forEach((property, index, arr) => {
      if (!('value' in property)) {
        arr[index]!.value = '';
      }
      if (!('name' in property)) {
        arr[index]!.name = '';
      }
    });
  }

  if (taskDef && taskDef.containerDefinitions) {
    taskDef.containerDefinitions.forEach((container) => {
      if (container.environment) {
        container.environment.forEach((property, index, arr) => {
          if (!('value' in property)) {
            arr[index]!.value = '';
          }
        });
      }
    });
  }
  return taskDef;
}

export function getServiceName(project: ServiceDefinition['projects'][number]) {
  return project.serviceName ?? `${project.name}-${project.environment}`;
}

export function getCluster(project: ServiceDefinition['projects'][number]) {
  return project.cluster ?? `${project.client}-${project.environment}`;
}

export function getTargetGroupName(
  project: ServiceDefinition['projects'][number],
  port: string,
) {
  return `${project.client}-${project.name}-${port}-${project.environment}`;
}

export function groupProjectsByClusterName(
  projects: ServiceDefinition['projects'],
) {
  const servicesByClusterName = new Map<
    string,
    ServiceDefinition['projects']
  >();
  for (const project of projects) {
    const clusterName = getCluster(project);
    const services = servicesByClusterName.get(clusterName) ?? [];
    services.push(project);
    servicesByClusterName.set(clusterName, services);
  }
  return servicesByClusterName;
}
