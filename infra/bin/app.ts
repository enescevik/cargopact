import * as cdk from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";
import { AgentsStack } from "../lib/agents-stack";
import { GatewayStack } from "../lib/gateway-stack";
import { ApiStack } from "../lib/api-stack";
import { WebStack } from "../lib/web-stack";

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };
const p = "CargoPact";

const auth = new AuthStack(app, `${p}-Auth`, { env });
const data = new DataStack(app, `${p}-Data`, { env });
const gateway = new GatewayStack(app, `${p}-Gateway`, {
  env,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.webClient.userPoolClientId,
  apiUrl: app.node.tryGetContext("apiUrl") ?? "https://765h182ijf.execute-api.us-east-1.amazonaws.com",
});
const agents = new AgentsStack(app, `${p}-Agents`, {
  env,
  dsqlClusterArn: data.cluster.attrResourceArn,
  // İkinci aşama: `cdk deploy -c agentImageTag=<tag>` ile runtime oluşturulur.
  gatewayUrl: gateway.gatewayUrl,
  agentImageTag: app.node.tryGetContext("agentImageTag"),
});
new ApiStack(app, `${p}-Api`, {
  env,
  userPool: auth.userPool,
  userPoolClient: auth.webClient,
  agentRuntimeArn: agents.runtimeArn,
  agentRuntimeArnPattern: agents.runtimeArnPattern,
  uploadsBucket: data.uploads,
  dsqlClusterArn: data.cluster.attrResourceArn,
  dsqlIdentifier: data.cluster.attrIdentifier,
});
new WebStack(app, `${p}-Web`, { env });
