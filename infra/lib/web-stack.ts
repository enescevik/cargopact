import * as cdk from "aws-cdk-lib";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as fs from "node:fs";
import * as path from "node:path";
import { Construct } from "constructs";

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "Site", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const dist = new cf.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      // SPA yönlendirmesi
      errorResponses: [403, 404].map((s) => ({
        httpStatus: s,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
      })),
    });

    const webDist = path.join(__dirname, "../../apps/web/dist");
    const mobileDist = path.join(__dirname, "../../apps/mobile/dist");
    if (fs.existsSync(webDist)) {
      new s3deploy.BucketDeployment(this, "Deploy", {
        sources: [s3deploy.Source.asset(webDist)],
        destinationBucket: bucket,
        distribution: dist,
        distributionPaths: ["/*"],
        prune: false,
      });
    }
    if (fs.existsSync(mobileDist)) {
      // Expo web çıktısı (baseUrl /m) -> s3://<bucket>/m/
      new s3deploy.BucketDeployment(this, "DeployMobile", {
        sources: [s3deploy.Source.asset(mobileDist)],
        destinationBucket: bucket,
        destinationKeyPrefix: "m/",
        distribution: dist,
        distributionPaths: ["/m/*"],
        prune: false,
      });
    }

    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${dist.distributionDomainName}` });
  }
}
