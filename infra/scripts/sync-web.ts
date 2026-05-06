#!/usr/bin/env bun
import { spawnSync } from "node:child_process";

const PROFILE = process.env.AWS_PROFILE_NAME ?? "jgyy";
const STACK = process.env.STACK_NAME ?? "codetype-solo";

function aws(args: string[]): string {
  const r = spawnSync("aws", [...args, "--profile", PROFILE], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

function describeOutput(key: string): string {
  const out = aws([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    STACK,
    "--query",
    `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`,
    "--output",
    "text",
  ]).trim();
  if (!out) throw new Error(`stack output ${key} missing`);
  return out;
}

const bucket = describeOutput("WebBucketName");
console.log(`syncing web/out → s3://${bucket}/`);

// Cache hashed Next.js assets aggressively, but never the HTML entrypoints.
spawnSync(
  "aws",
  [
    "s3",
    "sync",
    "../web/out",
    `s3://${bucket}/`,
    "--profile",
    PROFILE,
    "--delete",
    "--cache-control",
    "public, max-age=31536000, immutable",
    "--exclude",
    "*.html",
    "--exclude",
    "*.txt",
  ],
  { stdio: "inherit" },
);

spawnSync(
  "aws",
  [
    "s3",
    "sync",
    "../web/out",
    `s3://${bucket}/`,
    "--profile",
    PROFILE,
    "--cache-control",
    "public, max-age=0, must-revalidate",
    "--exclude",
    "*",
    "--include",
    "*.html",
    "--include",
    "*.txt",
  ],
  { stdio: "inherit" },
);

console.log("sync complete");
