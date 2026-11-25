import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly webClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: { minLength: 10, requireDigits: true, requireLowercase: true, requireUppercase: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    // Web ve mobil için aynı public client (secret yok).
    this.webClient = this.userPool.addClient("AppClient", {
      authFlows: { userSrp: true, userPassword: true }, // userPassword: seed/smoke testleri için
      generateSecret: false,
      preventUserExistenceErrors: true,
    });
    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: this.webClient.userPoolClientId });
  }
}
