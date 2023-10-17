import {
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
  waitUntilServicesStable,
  type CreateServiceCommandOutput,
  type UpdateServiceCommandOutput,
  type RegisterTaskDefinitionCommandInput,
} from '@aws-sdk/client-ecs';
import type { ServiceDefinition } from '../models/serviceDefinition';
import { getECSClient } from './getECSClient';
import { debug, setFailed, setOutput } from '@actions/core';
import { getCluster, getServiceName } from '../utils';
import { getSubnetsForNetworkConfiguration } from './getSubnetsForNetworkConfiguration';

async function createService(
  project: ServiceDefinition['projects'][number],
  taskDefinitionArn: string,
) {
  const ecsClient = getECSClient();
  return ecsClient.send(
    new CreateServiceCommand({
      cluster: getCluster(project),
      serviceName: getServiceName(project),
      taskDefinition: taskDefinitionArn,
      capacityProviderStrategy: project.customCapacityProviderStrategy,
      networkConfiguration:
        project.customNetworkConfiguration ||
        (await getSubnetsForNetworkConfiguration(project)),
      enableECSManagedTags: true,
      loadBalancers: project.loadBalancers,
      desiredCount: project.desiredCount,
      propagateTags: 'SERVICE',
      tags: [
        {
          key: 'name',
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
  taskDefinitionArn: string,
  forceNewDeploy: boolean,
) {
  const ecsClient = getECSClient();
  return ecsClient.send(
    new UpdateServiceCommand({
      cluster: getCluster(project),
      service: getServiceName(project),
      taskDefinition: taskDefinitionArn,
      capacityProviderStrategy: project.customCapacityProviderStrategy,
      networkConfiguration:
        project.customNetworkConfiguration ||
        (await getSubnetsForNetworkConfiguration(project)),
      loadBalancers: project.loadBalancers,
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
  try {
    const ecsClient = getECSClient();
    const registerResponse = await ecsClient.send(
      new RegisterTaskDefinitionCommand(taskDefinition),
    );
    const taskDefArn = registerResponse?.taskDefinition?.taskDefinitionArn;
    if (!taskDefArn) {
      throw new Error('No ARN returned from ECS');
    }
    setOutput('task-definition-arn', taskDefArn);
    let res: CreateServiceCommandOutput | UpdateServiceCommandOutput;
    if (project.alreadyExists) {
      res = await updateService(project, taskDefArn, forceNewDeploy);
    } else {
      res = await createService(project, taskDefArn);
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
    setFailed(
      `Failed to register task definition in ECS: ${(error as Error).message}`,
    );
    debug('Task definition contents:');
    debug(JSON.stringify(taskDefinition, undefined, 4));
    throw error;
  }
}
