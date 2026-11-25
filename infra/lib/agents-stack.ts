import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import { Construct } from "constructs";

export interface AgentsStackProps extends cdk.StackProps {
  dsqlClusterArn: string;
  agentImageTag?: string;
  gatewayUrl?: string;
}

/**
 * AgentCore Runtime (Strands çoklu ajan) + Memory + ECR.
 * Aşama 1: ECR + Memory + rol. Aşama 2 (imaj push edildikten sonra): Runtime.
 */
export class AgentsStack extends cdk.Stack {
  readonly runtimeArn?: string;
  readonly runtimeArnPattern: string;

  constructor(scope: Construct, id: string, props: AgentsStackProps) {
    super(scope, id, props);

    const repo = new ecr.Repository(this, "AgentRepo", {
      repositoryName: "cargopact-agents",
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const memory = new agentcore.CfnMemory(this, "Memory", {
      name: "cargopact_memory",
      eventExpiryDuration: 30, // gün
      description: "CargoPact sohbet oturum belleği",
    });

    const role = new iam.Role(this, "RuntimeRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    });
    repo.grantPull(role);
    role.addToPolicy(new iam.PolicyStatement({ actions: ["ecr:GetAuthorizationToken"], resources: ["*"] }));
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "cloudwatch:PutMetricData"],
        resources: ["*"],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock-agentcore:*Memory*", "bedrock-agentcore:*Event*"],
        resources: [memory.attrMemoryArn],
      }),
    );
    // DB erişimi: yalnızca bağlanma yetkisi; şema yetkileri DSQL içinde verilir.
    role.addToPolicy(new iam.PolicyStatement({ actions: ["dsql:DbConnect"], resources: [props.dsqlClusterArn] }));

    // Taşıyıcı bilgi tabanı (Bedrock KB + S3 Vectors; CLI ile kuruldu, bkz. docs/kb/README.md)
    const kbId = this.node.tryGetContext("kbId") ?? "ATCPKGCFWE";
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:Retrieve"],
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${kbId}`],
      }),
    );

    this.runtimeArnPattern = `arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*`;

    if (props.agentImageTag) {
      const runtime = new agentcore.CfnRuntime(this, "Runtime", {
        agentRuntimeName: "cargopact_orchestrator",
        roleArn: role.roleArn,
        agentRuntimeArtifact: {
          containerConfiguration: { containerUri: `${repo.repositoryUri}:${props.agentImageTag}` },
        },
        networkConfiguration: { networkMode: "PUBLIC" },
        environmentVariables: {
          AWS_REGION: this.region,
          MEMORY_ID: memory.attrMemoryId,
          DSQL_CLUSTER_ARN: props.dsqlClusterArn,
          MODEL_ID: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
          SPECIALIST_MODEL_ID: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
          KB_ID: kbId,
          GATEWAY_URL: props.gatewayUrl ?? "",
          USE_GATEWAY: props.gatewayUrl ? "1" : "0",
          API_URL: this.node.tryGetContext("apiUrl") ?? "https://765h182ijf.execute-api.us-east-1.amazonaws.com",
        },
      });
      this.runtimeArn = runtime.attrAgentRuntimeArn;
      new cdk.CfnOutput(this, "RuntimeArn", { value: runtime.attrAgentRuntimeArn });
    }

    new cdk.CfnOutput(this, "AgentRepoUri", { value: repo.repositoryUri });
    new cdk.CfnOutput(this, "MemoryId", { value: memory.attrMemoryId });
  }
}
