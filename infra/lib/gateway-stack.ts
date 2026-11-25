import * as fs from "fs";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import { Construct } from "constructs";

export interface GatewayStackProps extends cdk.StackProps {
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
}

/**
 * AgentCore Gateway (MCP). Inbound: Cognito JWT (kullanıcının ID token'ı). Hedef: salt okunur araç Lambda'sı.
 * Kullanıcı token'ı X-User-Token başlığıyla Lambda'ya iletilir (araç argümanı değildir); yetkiyi backend zorlar.
 * Araç şemaları: packages/contracts/mcp-tools.json
 */
export class GatewayStack extends cdk.Stack {
  readonly gatewayUrl: string;
  constructor(scope: Construct, id: string, props: GatewayStackProps) {
    super(scope, id, props);
    const spec = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../packages/contracts/mcp-tools.json"), "utf8"),
    ) as { tools: { name: string; description: string; inputSchema: any }[] };

    const fn = new lambda.Function(this, "ToolsFn", {
      functionName: "cargopact-mcp-tools",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../services/mcp-tools")),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: { API_URL: props.apiUrl },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const role = new iam.Role(this, "GatewayRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    });
    fn.grantInvoke(role);

    const gw = new agentcore.CfnGateway(this, "Gateway", {
      name: "cargopact-gateway",
      description: "CargoPact salt okunur MCP araçları",
      roleArn: role.roleArn,
      protocolType: "MCP",
      authorizerType: "CUSTOM_JWT",
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: `https://cognito-idp.${this.region}.amazonaws.com/${props.userPoolId}/.well-known/openid-configuration`,
          // Cognito ID token'ında client_id yok, aud var.
          allowedAudience: [props.userPoolClientId],
        },
      },
    });

    const target = new agentcore.CfnGatewayTarget(this, "Target", {
      name: "cargopact-mcp-tools",
      gatewayIdentifier: gw.attrGatewayIdentifier,
      credentialProviderConfigurations: [{ credentialProviderType: "GATEWAY_IAM_ROLE" }],
      metadataConfiguration: { allowedRequestHeaders: ["X-User-Token", "x-correlation-id", "x-agent-session"] },
      targetConfiguration: {
        mcp: {
          lambda: {
            lambdaArn: fn.functionArn,
            toolSchema: {
              inlinePayload: spec.tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              })),
            },
          },
        },
      },
    });
    target.addDependency(gw);
    target.node.addDependency(role);

    this.gatewayUrl = gw.attrGatewayUrl;
    new cdk.CfnOutput(this, "GatewayUrl", { value: gw.attrGatewayUrl });
    new cdk.CfnOutput(this, "GatewayId", { value: gw.attrGatewayIdentifier });
  }
}
