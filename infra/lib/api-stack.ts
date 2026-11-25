import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as path from "node:path";
import { Construct } from "constructs";

export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  agentRuntimeArn?: string;
  agentRuntimeArnPattern: string;
  uploadsBucket: s3.IBucket;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const fn = (name: string, entry: string, env: Record<string, string> = {}) =>
      new nodejs.NodejsFunction(this, name, {
        entry: path.join(__dirname, "../../services/api/src", entry),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: cdk.Duration.seconds(29),
        environment: env,
        bundling: { minify: true, sourceMap: true, target: "node22" },
      });

    const health = fn("Health", "health.ts");
    const chat = fn("Chat", "chat.ts", { AGENT_RUNTIME_ARN: props.agentRuntimeArn ?? "" });
    chat.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock-agentcore:InvokeAgentRuntime"],
        resources: [props.agentRuntimeArnPattern, `${props.agentRuntimeArnPattern}/*`],
      }),
    );

    const api = new apigw.HttpApi(this, "Api", {
      corsPreflight: {
        allowOrigins: ["*"], // Web domain belli olunca daraltın.
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type"],
      },
    });
    const authorizer = new HttpJwtAuthorizer(
      "Jwt",
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );
    api.addRoutes({
      path: "/health",
      methods: [apigw.HttpMethod.GET],
      integration: new HttpLambdaIntegration("HealthInt", health),
    });
    api.addRoutes({
      path: "/chat",
      methods: [apigw.HttpMethod.POST],
      integration: new HttpLambdaIntegration("ChatInt", chat),
      authorizer,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
  }
}
