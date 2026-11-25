import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as path from "node:path";
import { Construct } from "constructs";

export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  agentRuntimeArn?: string;
  agentRuntimeArnPattern: string;
  uploadsBucket: s3.IBucket;
  dsqlClusterArn: string;
  dsqlIdentifier: string;
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
        actions: ["bedrock-agentcore:InvokeAgentRuntime", "bedrock-agentcore:InvokeAgentRuntimeForUser"],
        resources: [props.agentRuntimeArnPattern, `${props.agentRuntimeArnPattern}/*`],
      }),
    );

    // İş API'si: sabit rol adı, böylece DSQL'de `AWS IAM GRANT cargopact_app TO <rol ARN>` önceden bilinir.
    const apiRole = new iam.Role(this, "BusinessApiRole", {
      roleName: "cargopact-api-lambda",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
    });
    apiRole.addToPolicy(new iam.PolicyStatement({ actions: ["dsql:DbConnect"], resources: [props.dsqlClusterArn] }));
    // grant*() DataStack'ten yeni bir ARN export'u ister; ad zaten export'lu, ARN'yi addan kuruyoruz.
    apiRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:PutObject", "s3:GetObject"], resources: [`arn:aws:s3:::${props.uploadsBucket.bucketName}/pod/*`] }));
    const business = new nodejs.NodejsFunction(this, "BusinessApi", {
      entry: path.join(__dirname, "../../services/api/src/handler.ts"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      role: apiRole,
      environment: {
        DSQL_ENDPOINT: `${props.dsqlIdentifier}.dsql.${this.region}.on.aws`,
        DSQL_USER: "cargopact_app",
        UPLOADS_BUCKET: props.uploadsBucket.bucketName,
        ...(process.env.PICKUP_CODE_SECRET ? { PICKUP_CODE_SECRET: process.env.PICKUP_CODE_SECRET } : {}),
        STAGE: this.node.tryGetContext("stage") ?? "dev",
      },
      bundling: { minify: true, sourceMap: true, target: "node22", externalModules: ["pg-native"] },
    });

    // --- Olay ve evrak: EventBridge veri yolu + WMS/ERP abone yedeği (SQS) ---
    const bus = new events.EventBus(this, "EventBus", { eventBusName: "cargopact-events" });
    const subscriberDlq = new sqs.Queue(this, "SubscriberDlq", { queueName: "cargopact-wms-erp-subscriber-dlq", retentionPeriod: cdk.Duration.days(4) });
    const subscriber = new sqs.Queue(this, "SubscriberQueue", {
      queueName: "cargopact-wms-erp-subscriber", retentionPeriod: cdk.Duration.days(1), visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: subscriberDlq, maxReceiveCount: 5 },
    });
    new events.Rule(this, "DomainEventsToSubscriber", {
      eventBus: bus, ruleName: "cargopact-domain-events-to-subscriber",
      eventPattern: { source: ["cargopact.api"] },
      targets: [new targets.SqsQueue(subscriber, { deadLetterQueue: subscriberDlq })],
    });
    apiRole.addToPolicy(new iam.PolicyStatement({ actions: ["events:PutEvents"], resources: [bus.eventBusArn] }));
    const worker = new nodejs.NodejsFunction(this, "IntegrationsWorker", {
      entry: path.join(__dirname, "../../services/api/src/integrations-worker.ts"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(55),
      role: apiRole,
      environment: { DSQL_ENDPOINT: `${props.dsqlIdentifier}.dsql.${this.region}.on.aws`, DSQL_USER: "cargopact_app", EVENT_BUS_NAME: bus.eventBusName },
      bundling: { minify: true, sourceMap: true, target: "node22", externalModules: ["pg-native"] },
    });
    new events.Rule(this, "IntegrationsSchedule", {
      ruleName: "cargopact-integrations-flush", schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(worker)],
    });
    new cdk.CfnOutput(this, "EventBusName", { value: bus.eventBusName });
    new cdk.CfnOutput(this, "SubscriberQueueUrl", { value: subscriber.queueUrl });

    const api = new apigw.HttpApi(this, "Api", {
      corsPreflight: {
        allowOrigins: ["*"], // Web domain belli olunca daraltın.
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.PUT, apigw.CorsHttpMethod.PATCH],
        allowHeaders: ["authorization", "content-type", "idempotency-key", "if-match", "x-tenant-id", "x-correlation-id"],
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

    api.addRoutes({
      path: "/{proxy+}",
      // ANY kullanılmaz: OPTIONS (CORS ön kontrolü) JWT yetkilendiricisine düşer ve 401 alır.
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST, apigw.HttpMethod.PUT, apigw.HttpMethod.PATCH, apigw.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration("BusinessInt", business),
      authorizer,
    });
    api.addRoutes({
      path: "/me",
      methods: [apigw.HttpMethod.GET],
      integration: new HttpLambdaIntegration("MeInt", business),
      authorizer,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
  }
}
