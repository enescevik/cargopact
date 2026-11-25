import * as cdk from "aws-cdk-lib";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as fs from "node:fs";
import * as path from "node:path";
import { Construct } from "constructs";

export interface WebStackProps extends cdk.StackProps {
  /** API Gateway uç noktası (https://<id>.execute-api...); CloudFront /api/* bu kökene yönlenir. */
  apiEndpoint?: string;
}

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: WebStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "Site", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // SPA yönlendirmesi fonksiyonda yapılır (dağıtım düzeyi 403/404 → index.html kuralı /api yanıtlarını da bozardı):
    // uzantısız yollar /index.html'e, /m altındakiler /m/index.html'e gider.
    const rewrite = new cf.Function(this, "DirIndex", {
      runtime: cf.FunctionRuntime.JS_2_0,
      code: cf.FunctionCode.fromInline(
        "function handler(event){var r=event.request;var u=r.uri;if(u==='/m'||u.indexOf('/m/')===0){if(u==='/m'||u==='/m/'||u.split('/').pop().indexOf('.')<0){r.uri='/m/index.html';}}else if(u.split('/').pop().indexOf('.')<0){r.uri='/index.html';}return r;}",
      ),
    });
    // /api/* → API Gateway (aynı alan adı: CORS ön kontrolü yok, TLS kullanıcıya yakın edge'de sonlanır).
    const stripApi = new cf.Function(this, "StripApiPrefix", {
      runtime: cf.FunctionRuntime.JS_2_0,
      code: cf.FunctionCode.fromInline(
        "function handler(event){var r=event.request;r.uri=r.uri.replace(/^\\/api(?=\\/|$)/,'')||'/';return r;}",
      ),
    });
    const additionalBehaviors: Record<string, cf.BehaviorOptions> = {};
    if (props?.apiEndpoint) {
      const apiDomain = cdk.Fn.select(2, cdk.Fn.split("/", props.apiEndpoint));
      additionalBehaviors["/api/*"] = {
        origin: new origins.HttpOrigin(apiDomain, { protocolPolicy: cf.OriginProtocolPolicy.HTTPS_ONLY, readTimeout: cdk.Duration.seconds(30) }),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [{ function: stripApi, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
        compress: true,
      };
    }
    const dist = new cf.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: rewrite, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
        compress: true,
      },
      additionalBehaviors,
      httpVersion: cf.HttpVersion.HTTP2_AND_3,
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
