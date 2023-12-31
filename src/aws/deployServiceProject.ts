import {
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
  waitUntilServicesStable,
  type CreateServiceCommandOutput,
  type UpdateServiceCommandOutput,
  type RegisterTaskDefinitionCommandInput,
  type TaskDefinition,
  type LoadBalancer,
} from '@aws-sdk/client-ecs';
import type { ServiceDefinition } from '../models/serviceDefinition';
import { getECSClient } from './getECSClient';
import { debug, setOutput } from '@actions/core';
import { getCluster, getServiceName } from '../utils';
import { getSubnetsForNetworkConfiguration } from './getSubnetsForNetworkConfiguration';
import { createOrUpdateTargetsGroups } from './createTargetGroup';

async function createService(
  project: ServiceDefinition['projects'][number],
  taskDefinition: TaskDefinition,
  loadBalancerConfigs: LoadBalancer[] | undefined,
) {
  const ecsClient = getECSClient();
  return ecsClient.send(
    new CreateServiceCommand({
      cluster: getCluster(project),
      serviceName: getServiceName(project),
      taskDefinition: taskDefinition.taskDefinitionArn,
      capacityProviderStrategy: project.customCapacityProviderStrategy,
      networkConfiguration:
        project.customNetworkConfiguration ||
        (await getSubnetsForNetworkConfiguration(project)),
      enableECSManagedTags: true,
      enableExecuteCommand: true,
      loadBalancers: project.autoCreateTargetGroups
        ? loadBalancerConfigs
        : project.loadBalancers,
      desiredCount: project.desiredCount,
      propagateTags: 'SERVICE',
      tags: [
        {
          key: 'project-name',
          value: project.name,
        },
        {
          key: 'client',
          value: project.client,
        },
        {
          key: 'environment',
          value: project.environment,
        },
      ],
    }),
  );
}

async function updateService(
  project: ServiceDefinition['projects'][number],
  taskDefinition: TaskDefinition,
  loadBalancerConfigs: LoadBalancer[] | undefined,
  forceNewDeploy: boolean,
) {
  const ecsClient = getECSClient();
  return ecsClient.send(
    new UpdateServiceCommand({
      cluster: getCluster(project),
      service: getServiceName(project),
      taskDefinition: taskDefinition.taskDefinitionArn,
      capacityProviderStrategy: project.customCapacityProviderStrategy,
      networkConfiguration:
        project.customNetworkConfiguration ||
        (await getSubnetsForNetworkConfiguration(project)),
      enableExecuteCommand: true,
      loadBalancers: project.autoCreateTargetGroups
        ? loadBalancerConfigs
        : project.loadBalancers,
      desiredCount: project.desiredCount,
      forceNewDeployment: forceNewDeploy,
    }),
  );
}

export async function deployServiceProject(
  project: ServiceDefinition['projects'][number],
  taskDefinition: RegisterTaskDefinitionCommandInput,
  waitForServiceStability: boolean,
  waitForServiceStabilityTimeout: number,
  forceNewDeploy: boolean,
) {
  const projectTaskDefinition = { ...taskDefinition };
  try {
    const ecsClient = getECSClient();
    projectTaskDefinition.family = `${project.client}-${project.name}-${project.environment}`;
    if (project.secrets?.length) {
      projectTaskDefinition.containerDefinitions?.forEach((container) => {
        if (!container.secrets) {
          container.secrets = [];
        }
        container.secrets.push(...project.secrets!);
      });
    }
    const registerResponse = await ecsClient.send(
      new RegisterTaskDefinitionCommand(projectTaskDefinition),
    );
    const taskDefResponse = registerResponse?.taskDefinition;
    if (!taskDefResponse) {
      throw new Error('No task definition returned from ECS');
    }
    if (!taskDefResponse.taskDefinitionArn) {
      throw new Error('No ARN returned from ECS');
    }
    setOutput('task-definition-arn', taskDefResponse.taskDefinitionArn);
    let loadBalancerConfigs: LoadBalancer[] | undefined;
    if (project.autoCreateTargetGroups) {
      loadBalancerConfigs = await createOrUpdateTargetsGroups(
        project,
        taskDefResponse,
      );
    }
    let res: CreateServiceCommandOutput | UpdateServiceCommandOutput;
    if (project.alreadyExists) {
      res = await updateService(
        project,
        taskDefResponse,
        loadBalancerConfigs,
        forceNewDeploy,
      );
    } else {
      res = await createService(project, taskDefResponse, loadBalancerConfigs);
    }
    if (waitForServiceStability) {
      await waitUntilServicesStable(
        {
          client: ecsClient,
          maxWaitTime: waitForServiceStabilityTimeout * 60,
        },
        { services: [getServiceName(project)], cluster: getCluster(project) },
      );
    }
    return res;
  } catch (error) {
    debug('Task definition contents:');
    debug(JSON.stringify(projectTaskDefinition, undefined, 4));
    throw error;
  }
}
