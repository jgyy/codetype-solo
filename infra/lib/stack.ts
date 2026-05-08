import { join } from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpRoute,
  HttpRouteKey,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  AccountRecovery,
  CfnUserPoolGroup,
  OAuthScope,
  UserPool,
  UserPoolClient,
} from "aws-cdk-lib/aws-cognito";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFn,
  FunctionCode,
  FunctionEventType,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  Architecture,
  Code,
  Function as LambdaFn,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { ENDPOINTS, type EndpointDef } from "@codetype/shared";

const HANDLER_FILE: Record<keyof typeof ENDPOINTS, string> = {
  postAttempt: "attempts-post",
  listAttempts: "attempts-list",
  getDaily: "daily-get",
  getSnippet: "snippet-get",
  upsertProfile: "profile-upsert",
  getLeaderboard: "leaderboard-get",
  submitSnippet: "submissions-post",
  listSubmissions: "submissions-list",
  approveSubmission: "submissions-approve",
  rejectSubmission: "submissions-reject",
  retractSnippet: "snippet-retract",
};

const TABLE_NAME = "codetype";
const MOD_GROUP = "mods";

export class CodetypeStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "Table", {
      tableName: TABLE_NAME,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "GSI2PK", type: AttributeType.STRING },
      sortKey: { name: "GSI2SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const userPool = new UserPool(this, "UserPool", {
      userPoolName: "codetype-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new CfnUserPoolGroup(this, "ModsGroup", {
      userPoolId: userPool.userPoolId,
      groupName: MOD_GROUP,
      description: "Moderators — approve/reject submissions and retract snippets.",
    });
    const userPoolClient = new UserPoolClient(this, "UserPoolClient", {
      userPool,
      authFlows: { userSrp: true, userPassword: true },
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
      },
    });

    const apiAsset = Code.fromAsset(join(__dirname, "..", "..", "api", "dist"));
    const sharedEnv = {
      TABLE_NAME,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      NODE_OPTIONS: "--enable-source-maps",
    };

    const fns: Partial<Record<keyof typeof ENDPOINTS, LambdaFn>> = {};
    for (const [opId] of Object.entries(ENDPOINTS) as [
      keyof typeof ENDPOINTS,
      EndpointDef,
    ][]) {
      const file = HANDLER_FILE[opId];
      const fn = new LambdaFn(this, `Fn${opId[0]!.toUpperCase()}${opId.slice(1)}`, {
        runtime: Runtime.NODEJS_20_X,
        architecture: Architecture.ARM_64,
        handler: `${file}.handler`,
        code: apiAsset,
        memorySize: 512,
        timeout: Duration.seconds(10),
        environment: sharedEnv,
        logRetention: RetentionDays.TWO_WEEKS,
      });
      table.grantReadWriteData(fn);
      fns[opId] = fn;
    }

    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: "codetype-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["authorization", "content-type"],
        maxAge: Duration.hours(1),
      },
      createDefaultStage: true,
    });

    const jwtAuthorizer = new HttpJwtAuthorizer(
      "JwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
        identitySource: ["$request.header.Authorization"],
      },
    );

    for (const [opId, def] of Object.entries(ENDPOINTS) as [
      keyof typeof ENDPOINTS,
      EndpointDef,
    ][]) {
      const fn = fns[opId]!;
      const integration = new HttpLambdaIntegration(`Int${opId}`, fn);
      new HttpRoute(this, `Route${opId}`, {
        httpApi,
        routeKey: HttpRouteKey.with(def.path, def.method as HttpMethod),
        integration,
        ...(def.auth === "public" ? {} : { authorizer: jwtAuthorizer }),
      });
    }

    const webBucket = new Bucket(this, "WebBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const urlRewrite = new CloudFrontFn(this, "UrlRewrite", {
      code: FunctionCode.fromInline(
        [
          "function handler(event) {",
          "  var req = event.request;",
          "  var uri = req.uri;",
          '  if (uri.endsWith("/")) {',
          '    req.uri = uri + "index.html";',
          '  } else if (!uri.includes(".")) {',
          '    req.uri = uri + ".html";',
          "  }",
          "  return req;",
          "}",
        ].join("\n"),
      ),
    });

    const distribution = new Distribution(this, "WebDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: urlRewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, "WebBucketName", { value: webBucket.bucketName });
    new CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
    });
    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.domainName}`,
    });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
