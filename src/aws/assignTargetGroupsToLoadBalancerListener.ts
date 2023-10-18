import {
  CreateRuleCommand,
  DescribeRulesCommand,
  ModifyRuleCommand,
  SetRulePrioritiesCommand,
  type Rule,
  DeleteRuleCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { getELBV2Client } from './getELBV2Client';
import type { ServiceDefinition } from '../models/serviceDefinition';

async function createRule(
  project: ServiceDefinition['projects'][number],
  targetGroupARN: string,
) {
  const elbv2Client = getELBV2Client();
  const rulesResponse = await elbv2Client.send(
    new CreateRuleCommand({
      ListenerArn:
        project.autoCreateTargetGroupsOptions?.loadBalancerListenerARN,
      Priority: project.autoCreateTargetGroupsOptions?.rulePriority,
      Conditions: project.autoCreateTargetGroupsOptions?.ruleConditions ?? [],
      Actions: [
        {
          TargetGroupArn: targetGroupARN,
          Type: 'forward',
        },
      ],
    }),
  );
  return rulesResponse.Rules?.[0];
}

async function updateRule(
  project: ServiceDefinition['projects'][number],
  targetGroupARN: string,
  rule: Rule,
) {
  const elbv2Client = getELBV2Client();
  if (rule.Priority !== project.autoCreateTargetGroupsOptions?.rulePriority) {
    await elbv2Client.send(
      new SetRulePrioritiesCommand({
        RulePriorities: [
          {
            RuleArn: rule.RuleArn,
            Priority: project.autoCreateTargetGroupsOptions?.rulePriority,
          },
        ],
      }),
    );
  }
  const rulesResponse = await elbv2Client.send(
    new ModifyRuleCommand({
      RuleArn: rule.RuleArn,
      Conditions: project.autoCreateTargetGroupsOptions?.ruleConditions ?? [],
      Actions: [
        {
          TargetGroupArn: targetGroupARN,
          Type: 'forward',
        },
      ],
    }),
  );
  return rulesResponse.Rules?.[0];
}

export async function getRulesByListenerARN(listenerARN?: string) {
  const elbv2Client = getELBV2Client();
  const rulesResponse = await elbv2Client.send(
    new DescribeRulesCommand({
      ListenerArn: listenerARN,
    }),
  );
  return rulesResponse.Rules;
}

export async function deleteRuleByTargetGroupARN(
  project: ServiceDefinition['projects'][number],
  targetGroupARN: string,
) {
  const elbv2Client = getELBV2Client();
  const rules = await getRulesByListenerARN(
    project.autoCreateTargetGroupsOptions?.loadBalancerListenerARN,
  );
  const rule = rules?.find((rule) => {
    return rule.Actions?.some(
      (action) => action.TargetGroupArn === targetGroupARN,
    );
  });
  if (rule) {
    await elbv2Client.send(
      new DeleteRuleCommand({
        RuleArn: rule.RuleArn,
      }),
    );
  }
}

export type TargetGroupARNAction = {
  delete?: string;
  create: string;
};

export async function assignTargetGroupsToLoadBalancerListener(
  project: ServiceDefinition['projects'][number],
  targetGroupActions: TargetGroupARNAction[],
) {
  const rules = await getRulesByListenerARN(
    project.autoCreateTargetGroupsOptions?.loadBalancerListenerARN,
  );
  for (const targetGroupARNAction of targetGroupActions) {
    const rule = rules?.find((rule) => {
      return rule.Actions?.some(
        (action) => action.TargetGroupArn === targetGroupARNAction.delete,
      );
    });
    if (rule) {
      await updateRule(project, targetGroupARNAction.create, rule);
    } else {
      await createRule(project, targetGroupARNAction.create);
    }
  }
}
