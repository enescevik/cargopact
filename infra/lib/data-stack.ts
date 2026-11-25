import * as cdk from "aws-cdk-lib";
import * as dsql from "aws-cdk-lib/aws-dsql";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class DataStack extends cdk.Stack {
  readonly cluster: dsql.CfnCluster;
  readonly uploads: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // İlişkisel veri: Aurora DSQL (PostgreSQL uyumlu, sunucusuz).
    this.cluster = new dsql.CfnCluster(this, "Db", { deletionProtectionEnabled: true });
    this.cluster.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // Dosyalar: özel S3 bucket.
    this.uploads = new s3.Bucket(this, "Uploads", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ["*"], // Web domain belli olunca daraltın.
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    new cdk.CfnOutput(this, "DsqlEndpoint", {
      value: `${this.cluster.attrIdentifier}.dsql.${this.region}.on.aws`,
    });
    new cdk.CfnOutput(this, "UploadsBucket", { value: this.uploads.bucketName });
  }
}
