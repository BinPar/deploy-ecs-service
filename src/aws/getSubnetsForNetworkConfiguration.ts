import { getInput } from '@actions/core';
import {
  DescribeSubnetsCommand,
  EC2Client,
  type Subnet,
} from '@aws-sdk/client-ec2';
import type { ServiceDefinition } from '../models/serviceDefinition';
import { type NetworkConfiguration } from '@aws-sdk/client-ecs';

function groupSubnetsByVpcId(subnets: Subnet[]) {
  const subnetMap = new Map<string, Subnet[]>();
  for (let i = 0, l = subnets.length; i < l; i++) {
    const subnet = subnets[i];
    if (subnet?.VpcId) {
      const subnetsForVpc = subnetMap.get(subnet.VpcId) || [];
      subnetsForVpc.push(subnet);
      subnetMap.set(subnet.VpcId, subnetsForVpc);
    }
  }
  return subnetMap;
}

async function getAllValidSubnets(
  project: ServiceDefinition['projects'][number],
) {
  const client = project.client;
  const region = getInput('region', { required: false }) || 'eu-west-1';
  const ec2Client = new EC2Client({
    region,
  });
  const filters = project.taskVpcSubnetsFilters?.length
    ? project.taskVpcSubnetsFilters
    : [
        {
          Name: 'tag:Name',
          Values: ['*public*'],
        },
      ];
  const subnetsCommand = new DescribeSubnetsCommand({
    Filters: filters,
  });
  const subnetsRes = await ec2Client.send(subnetsCommand);
  if (!subnetsRes.Subnets || subnetsRes.Subnets.length === 0) {
    throw new Error('No subnets returned');
  }
  let subnets = subnetsRes.Subnets;
  if (client && !project.taskVpcSubnetsFilters?.length) {
    const filteredSubnets = subnets.filter((subnet) => {
      return (
        subnet.Tags &&
        subnet.Tags.some((tag) => tag.Key === 'client' && tag.Value === client)
      );
    });
    if (filteredSubnets.length > 0) {
      subnets = filteredSubnets;
    }
  }
  return groupSubnetsByVpcId(subnets);
}

export async function getSubnetsForNetworkConfiguration(
  project: ServiceDefinition['projects'][number],
): Promise<NetworkConfiguration> {
  const groupedSubnets = await getAllValidSubnets(project);
  if (!groupedSubnets || groupedSubnets.size === 0) {
    throw new Error('No subnets returned');
  }
  const subnets = Array.from(groupedSubnets.values())[0];
  if (!subnets || subnets.length === 0) {
    throw new Error('No subnets returned');
  }
  return {
    awsvpcConfiguration: {
      subnets: subnets.map((subnet) => subnet.SubnetId || '').filter(Boolean),
      assignPublicIp: 'ENABLED',
    },
  };
}
