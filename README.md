<!-- start title -->
# GitHub Action: BinPar Deploy ECS Service Action for GitHub Actions
<!-- end title -->
<!-- start description -->
Registers an Amazon ECS task definition, and deploys it to a service, but with more options.
<!-- end description -->
<!-- start contents -->

<!-- end contents -->
<!-- start usage -->
```yaml

- uses: BinPar/deploy-ecs-service@v1.1.0
  with:
  task-definition: ''

  services-definition: ''

  region: ''

  # Default: false

  wait-for-service-stability: ''

  # Default: 10

  wait-for-minutes: ''

  # Default: true

  force-new-deploy: ''

```
<!-- end usage -->
<!-- start inputs -->
| ****Input**** | ****Description**** | ****Default**** | ****Required**** |
|---|---|---|---|
| `**task-definition**` | The path to the ECS task definition file to register. |  | **true** |
| `**services-definition**` | The path to the YAML with the services definition. |  | **true** |
| `**region**` | The AWS region to use. |  | __false__ |
| `**wait-for-service-stability**` | Wait for the service to be stable before continuing. |  | __false__ |
| `**wait-for-minutes**` | The number of minutes to wait for the service to be stable. | `10` | __false__ |
| `**force-new-deploy**` | Force a new deployment of the service. | `true` | __false__ |
<!-- end inputs -->
<!-- start outputs -->
| ****Output**** | ****Description**** |
|---|---|
| `**task-definition-arn**` | The ARN of the task definition. |
<!-- end outputs -->
<!-- start [.github/ghadocs/examples/] -->

<!-- end [.github/ghadocs/examples/] -->
```
