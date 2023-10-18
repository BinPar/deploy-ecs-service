import { getInput } from '@actions/core';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';

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
