import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Result } from "@codetype/shared";
import { ddb, TABLE } from "../lib/dynamo";
import { httpAdapter, type HandlerCtx } from "../lib/http";

const LANGS = new Set(["js", "py", "c", "go"]);

async function getSnippet(
  ctx: HandlerCtx,
): Promise<Result<Record<string, unknown>, ApiError>> {
  const lang = ctx.event.pathParameters?.lang;
  const id = ctx.event.pathParameters?.id;
  if (!lang || !id) return err(apiError("bad_request", "lang and id required"));
  if (!LANGS.has(lang)) return err(apiError("bad_request", "invalid language"));

  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `SNIPPET#${lang}`, SK: `SNIPPET#${id}` } }),
  );
  if (!r.Item) return err(apiError("not_found", "snippet not found"));
  return ok(r.Item as Record<string, unknown>);
}

export const handler = httpAdapter(getSnippet, { successStatus: 200 });
