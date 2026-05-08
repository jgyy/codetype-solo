// Resolve stack outputs lazily so seed/backfill scripts work after the CDK
// stack auto-names the DynamoDB table. Env-set TABLE_NAME always wins.
import { spawnSync } from "node:child_process";

const STACK = process.env.STACK_NAME ?? "codetype-solo";
const PROFILE = process.env.AWS_PROFILE_NAME ?? process.env.AWS_PROFILE;

function awsArgs(args: string[]): string[] {
  return PROFILE ? [...args, "--profile", PROFILE] : args;
}

export function describeOutput(key: string): string {
  const r = spawnSync(
    "aws",
    awsArgs([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      STACK,
      "--query",
      `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`,
      "--output",
      "text",
    ]),
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  const v = r.stdout.trim();
  if (!v) throw new Error(`stack output ${key} missing`);
  return v;
}

export function resolveTableName(): string {
  return process.env.TABLE_NAME ?? describeOutput("TableName");
}
