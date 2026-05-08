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

function syncPass(args: { include?: string[]; exclude?: string[]; cacheControl: string; delete?: boolean }, bucket: string) {
    const out = withProfile(["s3", "sync", "../web/out", `s3://${bucket}/`]);
    if (args.delete) out.push("--delete");
    out.push("--cache-control", args.cacheControl);
    if (args.exclude || args.include) {
        if (args.exclude) {
            for (const e of args.exclude) {
                out.push("--exclude", e);
            }
        } else {
            out.push("--exclude", "*");
        }
        if (args.include) {
            for (const i of args.include) {
                out.push("--include", i);
            }
        }
    }
    spawnSync("aws", out, { stdio: "inherit" });
}

const bucket = describeOutput("WebBucketName");
console.log(`syncing web/out → s3://${bucket}/`);

syncPass(
    {
        delete: true,
        cacheControl: "public, max-age=31536000, immutable",
        exclude: ["*.html", "*.txt", "*.ico", "*.svg", "*.png", "*.webp"],
    },
    bucket,
);

syncPass(
    {
        cacheControl: "public, max-age=86400",
        include: ["*.ico", "*.svg", "*.png", "*.webp"],
    },
    bucket,
);

syncPass(
    {
        cacheControl: "public, max-age=0, must-revalidate",
        include: ["*.html", "*.txt"],
    },
    bucket,
);

console.log("sync complete");
