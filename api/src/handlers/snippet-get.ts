import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  GetSnippetParams,
  apiError,
  err,
  isErr,
  ok,
  type ApiError,
  type Result,
} from "@codetype/shared";
import { ddb, TABLE } from "../lib/dynamo";
import { httpAdapter, parseWith, type HandlerCtx } from "../lib/http";

async function getSnippet(
  ctx: HandlerCtx,
): Promise<Result<Record<string, unknown>, ApiError>> {
  const p = parseWith(GetSnippetParams, ctx.event.pathParameters ?? {});
  if (isErr(p)) return p;
  const { lang, id } = p.value;

  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `SNIPPET#${lang}`, SK: `SNIPPET#${id}` } }),
  );
  if (!r.Item) return err(apiError("not_found", "snippet not found"));
  return ok(r.Item as Record<string, unknown>);
}

export const handler = httpAdapter(getSnippet, { successStatus: 200 });
