import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "ap-southeast-1";
// DDB_ENDPOINT lets tests point the SDK at DynamoDB Local without code changes.
const ENDPOINT = process.env.DDB_ENDPOINT;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: REGION,
    ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

export const TABLE = process.env.TABLE_NAME ?? "codetype";
export const GSI1 = "GSI1";
export const GSI2 = "GSI2"; // sparse: per-language snippet listing (spec 009)
