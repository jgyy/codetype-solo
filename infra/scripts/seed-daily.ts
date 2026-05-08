#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { resolveTableName } from "./_stack";

const REGION = process.env.AWS_REGION ?? "ap-southeast-1";
const TABLE = resolveTableName();
const DATA_DIR = join(import.meta.dir, "..", "..", "data", "snippets");
const DAYS = 30;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

type Raw = { id: string; title: string; code: string; difficulty: number };

function hashDate(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

async function main() {
  const pool: { id: string; language: string }[] = [];
  for (const f of readdirSync(DATA_DIR).filter((x) => x.endsWith(".json"))) {
    const lang = f.replace(/\.json$/, "");
    const rows = JSON.parse(readFileSync(join(DATA_DIR, f), "utf8")) as Raw[];
    for (const r of rows) pool.push({ id: r.id, language: lang });
  }
  if (pool.length === 0) throw new Error("no snippets in data dir");

  const today = new Date();
  const items: Record<string, unknown>[] = [];
  for (let d = 0; d < DAYS; d++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d));
    const date = day.toISOString().slice(0, 10);
    const chosen = pool[hashDate(date) % pool.length]!;
    items.push({
      PK: "DAILY",
      SK: `DATE#${date}`,
      entity: "DAILY",
      snippet_id: chosen.id,
      language: chosen.language,
    });
  }

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: chunk } }));
  }
  console.log(`seeded ${items.length} daily seeds`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
