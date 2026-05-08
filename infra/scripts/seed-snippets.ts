#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { LanguageSchema, SnippetSeedRow } from "@codetype/shared";
import { resolveTableName } from "./_stack";

const REGION = process.env.AWS_REGION ?? "ap-southeast-1";
const TABLE = resolveTableName();
const DATA_DIR = join(import.meta.dir, "..", "..", "data", "snippets");
const MAX_LEN = 400;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const items: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const file of files) {
    const lang = LanguageSchema.parse(file.replace(/\.json$/, ""));
    const rows = JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as unknown[];
    for (const raw of rows) {
      const r = SnippetSeedRow.parse(raw);
      if (r.code.length > MAX_LEN) {
        console.warn(`skip ${r.id}: code length ${r.code.length} > ${MAX_LEN}`);
        skipped++;
        continue;
      }
      items.push({
        PK: `SNIPPET#${lang}`,
        SK: `SNIPPET#${r.id}`,
        GSI2PK: `LANG#${lang}`,
        GSI2SK: `SNIPPET#${r.id}`,
        entity: "SNIPPET",
        id: r.id,
        title: r.title,
        code: r.code,
        difficulty: r.difficulty,
        language: lang,
      });
    }
  }

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await batchWrite(chunk);
  }
  console.log(`seeded ${items.length} snippets (skipped ${skipped})`);
}

async function batchWrite(chunk: Record<string, unknown>[]) {
  let req = chunk.map((Item) => ({ PutRequest: { Item } }));
  let attempt = 0;
  while (req.length > 0) {
    const r = await ddb.send(
      new BatchWriteCommand({ RequestItems: { [TABLE]: req } }),
    );
    const unproc = r.UnprocessedItems?.[TABLE] ?? [];
    if (unproc.length === 0) return;
    if (++attempt > 6) throw new Error("batch write retries exhausted");
    await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    req = unproc as typeof req;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
