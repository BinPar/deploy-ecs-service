import { getInput } from '@actions/core';
import {
  CreateTargetGroupCommand,
  DeleteTargetGroupCommand,
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import type { ServiceDefinition } from '../models/serviceDefinition';
import { getTargetGroupName } from '../utils';
import { type LoadBalancer, type TaskDefinition } from '@aws-sdk/client-ecs';

let elbv2Client: ElasticLoadBalancingV2Client;

export function getELBV2Client() {
  if (!elbv2Client) {
    const region = getInput('region', { required: false }) || 'eu-west-1';
    elbv2Client = new ElasticLoadBalancingV2Client({
      region,
      customUserAgent: 'aws-ecs-deploy-service-github-action',
    });
  }
  return elbv2Client;
}

async function getTargetGroupByName(targetGroupName: string) {
  const elbv2Client = getELBV2Client();
  const res = await elbv2Client.send(
    new DescribeTargetGroupsCommand({
      Names: [targetGroupName],
    }),
  );
  return res.TargetGroups?.[0];
}

async function deleteTargetGroup(targetGroupArn: string) {
  const elbv2Client = getELBV2Client();
  const res = await elbv2Client.send(
    new DeleteTargetGroupCommand({
      TargetGroupArn: targetGroupArn,
    }),
  );
  return res.$metadata.httpStatusCode === 200;
}

export async function createOrUpdateTargetsGroups(
  project: ServiceDefinition['projects'][number],
  taskDefinition: TaskDefinition,
) {
  const elbv2Client = getELBV2Client();
  const essentialContainersWithPorts =
    taskDefinition.containerDefinitions?.filter(
      (container) => !!container.portMappings?.length && !!container.essential,
    );
  if (!essentialContainersWithPorts?.length) {
    return;
  }
  const loadBalancers: LoadBalancer[] = [];
  for (const container of essentialContainersWithPorts) {
    const portMapping = container.portMappings?.[0];
    const port = portMapping?.containerPort || 80;
    const targetGroupName = getTargetGroupName(project, `${port}`);
    const existingTargetGroup = await getTargetGroupByName(targetGroupName);
    if (existingTargetGroup?.TargetGroupArn) {
      if (!(await deleteTargetGroup(existingTargetGroup.TargetGroupArn))) {
        throw new Error(
          `Failed to delete existing target group ${targetGroupName}`,
        );
      }
    }
    const res = await elbv2Client.send(
      new CreateTargetGroupCommand({
        Name: targetGroupName,
        HealthCheckEnabled: true,
        HealthCheckIntervalSeconds: container.healthCheck?.interval ?? 60,
        HealthCheckPath: project.healthCheckPath,
        HealthCheckPort: `${port}`,
        HealthCheckProtocol: project.healthCheckProtocol,
        HealthCheckTimeoutSeconds: container.healthCheck?.timeout ?? 5,
        HealthyThresholdCount: container.healthCheck?.retries ?? 2,
        Port: port,
        Protocol: project.healthCheckProtocol,
        TargetType: 'ip',
        Tags: [
          {
            Key: 'project-name',
            Value: project.name,
          },
          {
            Key: 'client',
            Value: project.client,
          },
          {
            Key: 'environment',
            Value: project.environment,
          },
          {
            Key: 'port',
            Value: `${port}`,
          },
        ],
      }),
    );
    if (res.TargetGroups?.[0]?.TargetGroupArn) {
      loadBalancers.push({
        targetGroupArn: res.TargetGroups[0].TargetGroupArn,
        containerName: container.name,
        containerPort: port,
      });
    }
  }
  return loadBalancers;
}
