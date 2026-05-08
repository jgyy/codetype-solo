#!/usr/bin/env bun
import { spawnSync } from "node:child_process";

const PROFILE = process.env.AWS_PROFILE_NAME ?? process.env.AWS_PROFILE;
const STACK = process.env.STACK_NAME ?? "codetype-solo";

function withProfile(args: string[]): string[] {
  return PROFILE ? [...args, "--profile", PROFILE] : args;
}

function aws(args: string[]): string {
  const r = spawnSync("aws", withProfile(args), { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

const distId = aws([
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  STACK,
  "--query",
  "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue",
  "--output",
  "text",
]).trim();

if (!distId) {
  console.error("CloudFrontDistributionId not found in stack outputs");
  process.exit(1);
}

console.log(`invalidating ${distId} (/index.html, /_next/*)`);
spawnSync(
  "aws",
  withProfile([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distId,
    "--paths",
    "/index.html",
    "/_next/*",
  ]),
  { stdio: "inherit" },
);
