import { z } from 'zod';

export const defaultCapacityProviderStrategy = [
  {
    capacityProvider: 'FARGATE',
    weight: 1,
    base: 1,
  },
];

const projectSchema = z.object({
  name: z.string(),
  environment: z.enum(['test', 'release']),
  client: z.string().default('default'),
  serviceName: z.string().optional(),
  cluster: z.string().optional(),
  alreadyExists: z.boolean().optional(),
  desiredCount: z.number().default(1),
  targetGroupsVPCId: z.string(),
  taskVpcSubnetsFilters: z
    .array(
      z.object({
        Name: z.string(),
        Values: z.array(z.string()),
      }),
    )
    .optional(),
  customCapacityProviderStrategy: z
    .array(
      z.object({
        capacityProvider: z.string(),
        weight: z.number(),
        base: z.number().optional(),
      }),
    )
    .default(defaultCapacityProviderStrategy),
  customNetworkConfiguration: z
    .object({
      awsvpcConfiguration: z.object({
        subnets: z.array(z.string()),
        securityGroups: z.array(z.string()).optional(),
        assignPublicIp: z.enum(['ENABLED', 'DISABLED']),
      }),
    })
    .optional(),
  loadBalancers: z
    .array(
      z.object({
        targetGroupArn: z.string().optional(),
        loadBalancerName: z.string().optional(),
        containerName: z.string().optional(),
        containerPort: z.number().optional(),
      }),
    )
    .optional(),
  autoCreateTargetGroups: z.boolean().default(true),
  autoCreateTargetGroupsOptions: z
    .object({
      loadBalancerListenerARN: z.string(),
      ruleConditions: z
        .array(
          z.object({
            Field: z.enum([
              'http-header',
              'host-header',
              'path-pattern',
              'http-request-method',
              'query-string',
              'source-ip',
            ]),
            Values: z.array(z.string()).optional(),
            HostHeaderConfig: z
              .object({
                Values: z.array(z.string()),
              })
              .optional(),
            PathPatternConfig: z
              .object({
                Values: z.array(z.string()),
              })
              .optional(),
            HttpHeaderConfig: z
              .object({
                HttpHeaderName: z.string(),
                Values: z.array(z.string()),
              })
              .optional(),
            QueryStringConfig: z
              .object({
                Values: z.array(
                  z.object({ Key: z.string(), Value: z.string() }),
                ),
              })
              .optional(),
            HttpRequestMethodConfig: z
              .object({
                Values: z.array(z.string()),
              })
              .optional(),
            SourceIpConfig: z
              .object({
                Values: z.array(z.string()),
              })
              .optional(),
          }),
        )
        .optional(),
      rulePriority: z.number(),
    })
    .optional(),
  healthCheckPath: z.string().default('/'),
  healthCheckProtocol: z
    .enum(['GENEVE', 'HTTP', 'HTTPS', 'TCP', 'TCP_UDP', 'TLS', 'UDP'])
    .default('HTTP'),
  secrets: z
    .array(
      z.object({
        name: z.string(),
        valueFrom: z.string(),
      }),
    )
    .optional(),
});

export const serviceDefinitionSchema = z.object({
  projects: z.array(projectSchema),
});

export type ServiceDefinition = z.infer<typeof serviceDefinitionSchema>;
