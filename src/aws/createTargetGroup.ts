import {
  CreateTargetGroupCommand,
  DescribeTargetGroupsCommand,
  ModifyTargetGroupCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import type { ServiceDefinition } from '../models/serviceDefinition';
import { getTargetGroupName, nonNullable } from '../utils';
import {
  type ContainerDefinition,
  type LoadBalancer,
  type TaskDefinition,
} from '@aws-sdk/client-ecs';
import { getELBV2Client } from './getELBV2Client';
import { assignTargetGroupsToLoadBalancerListener } from './assignTargetGroupsToLoadBalancerListener';

async function getTargetGroupByName(targetGroupName: string) {
  const elbv2Client = getELBV2Client();
  try {
    const res = await elbv2Client.send(
      new DescribeTargetGroupsCommand({
        Names: [targetGroupName],
      }),
    );
    return res.TargetGroups?.[0];
  } catch (err) {
    if ((err as Error).name === 'TargetGroupNotFoundException') {
      return undefined;
    }
    throw err;
  }
}

async function createTargetGroup(
  project: ServiceDefinition['projects'][number],
  container: ContainerDefinition,
  port: number,
) {
  const targetGroupName = getTargetGroupName(project, `${port}`);
  const elbv2Client = getELBV2Client();
  const res = await elbv2Client.send(
    new CreateTargetGroupCommand({
      Name: targetGroupName,
      VpcId: project.targetGroupsVPCId,
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: container.healthCheck?.interval ?? 60,
      HealthCheckPath: project.healthCheckPath,
      HealthCheckPort: `${port}`,
      HealthCheckProtocol: project.healthCheckProtocol,
      HealthCheckTimeoutSeconds: container.healthCheck?.timeout ?? 5,
      HealthyThresholdCount: container.healthCheck?.retries ?? 2,
      UnhealthyThresholdCount: (container.healthCheck?.retries ?? 2) + 1,
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
  return res.TargetGroups?.[0]?.TargetGroupArn;
}

async function updateTargetGroup(
  project: ServiceDefinition['projects'][number],
  container: ContainerDefinition,
  port: number,
  targetGroupArn: string,
) {
  const elbv2Client = getELBV2Client();
  const res = await elbv2Client.send(
    new ModifyTargetGroupCommand({
      TargetGroupArn: targetGroupArn,
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: container.healthCheck?.interval ?? 60,
      HealthCheckPath: project.healthCheckPath,
      HealthCheckPort: `${port}`,
      HealthCheckProtocol: project.healthCheckProtocol,
      HealthCheckTimeoutSeconds: container.healthCheck?.timeout ?? 5,
      HealthyThresholdCount: container.healthCheck?.retries ?? 2,
      UnhealthyThresholdCount: (container.healthCheck?.retries ?? 2) + 1,
    }),
  );
  return res.TargetGroups?.[0]?.TargetGroupArn;
}

export async function createOrUpdateTargetsGroups(
  project: ServiceDefinition['projects'][number],
  taskDefinition: TaskDefinition,
) {
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
    let loadBalancerTargetGroupARN: string | undefined;
    if (existingTargetGroup?.TargetGroupArn) {
      loadBalancerTargetGroupARN = await updateTargetGroup(
        project,
        container,
        port,
        existingTargetGroup.TargetGroupArn,
      );
    } else {
      loadBalancerTargetGroupARN = await createTargetGroup(
        project,
        container,
        port,
      );
    }
    if (loadBalancerTargetGroupARN) {
      loadBalancers.push({
        targetGroupArn: loadBalancerTargetGroupARN,
      });
    }
  }
  await assignTargetGroupsToLoadBalancerListener(
    project,
    loadBalancers.map((lb) => lb.targetGroupArn).filter(nonNullable),
  );
  return loadBalancers;
}
