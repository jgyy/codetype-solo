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
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Queue } from "aws-cdk-lib/aws-sqs";
import {
  DynamoEventSource,
  SqsDlq,
} from "aws-cdk-lib/aws-lambda-event-sources";
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
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
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, AaaaRecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import {
  Architecture,
  Code,
  Function as LambdaFn,
  Runtime,
  StartingPosition,
} from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
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

const MOD_GROUP = "mods";

export interface CodetypeStackProps extends StackProps {
  domainName: string;
  zoneName: string;
  certificate: ICertificate;
}

export class CodetypeStack extends Stack {
  constructor(scope: Construct, id: string, props: CodetypeStackProps) {
    super(scope, id, props);
    const { domainName, zoneName, certificate } = props;

    const table = new Table(this, "Table", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
      // Spec 011: enables the domain-event projector pipeline.
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
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
      TABLE_NAME: table.tableName,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      NODE_OPTIONS: "--enable-source-maps",
    };

    const fns: Partial<Record<keyof typeof ENDPOINTS, LambdaFn>> = {};
    for (const [opId] of Object.entries(ENDPOINTS) as [
      keyof typeof ENDPOINTS,
      EndpointDef,
    ][]) {
      const file = HANDLER_FILE[opId];
      const fnId = `Fn${opId[0]!.toUpperCase()}${opId.slice(1)}`;
      const logGroup = new LogGroup(this, `${fnId}Logs`, {
        retention: RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const fn = new LambdaFn(this, fnId, {
        runtime: Runtime.NODEJS_20_X,
        architecture: Architecture.ARM_64,
        handler: `${file}.handler`,
        code: apiAsset,
        memorySize: 512,
        timeout: Duration.seconds(10),
        environment: sharedEnv,
        logGroup,
      });
      table.grantReadWriteData(fn);
      fns[opId] = fn;
    }

    // Spec 011: events Lambda — single consumer of the table's DDB stream,
    // fans out to projectors in-process. Failed batches retry up to 5 times
    // (Lambda built-in) before draining to the SQS DLQ for inspection.
    const eventsDlq = new Queue(this, "EventsDlq", {
      retentionPeriod: Duration.days(14),
    });
    const eventsLogGroup = new LogGroup(this, "FnEventsLogs", {
      retention: RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const eventsFn = new LambdaFn(this, "FnEvents", {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: "events.handler",
      code: apiAsset,
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: sharedEnv,
      logGroup: eventsLogGroup,
    });
    table.grantReadWriteData(eventsFn);
    eventsFn.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 25,
        retryAttempts: 5,
        bisectBatchOnError: true,
        onFailure: new SqsDlq(eventsDlq),
      }),
    );
    // Spec 011 risk register: persistent projector failures must be visible.
    // Any message landing in the DLQ across a 5-minute window trips the alarm.
    new Alarm(this, "EventsDlqAlarm", {
      metric: eventsDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: "Maximum",
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: "DDB-stream events Lambda has messages in DLQ",
    });

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
      domainNames: [domainName],
      certificate,
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

    const zone = HostedZone.fromLookup(this, "Zone", { domainName: zoneName });
    const aliasTarget = RecordTarget.fromAlias(new CloudFrontTarget(distribution));
    new ARecord(this, "AliasA", { zone, recordName: domainName, target: aliasTarget });
    new AaaaRecord(this, "AliasAAAA", { zone, recordName: domainName, target: aliasTarget });

    new CfnOutput(this, "SiteUrl", { value: `https://${domainName}` });
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
    new CfnOutput(this, "EventsDlqUrl", { value: eventsDlq.queueUrl });
  }
}
