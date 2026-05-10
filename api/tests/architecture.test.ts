import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CORE_ROOT = join(import.meta.dir, "..", "src", "core");
const HANDLERS_ROOT = join(import.meta.dir, "..", "src", "handlers");

// events.ts is the DDB Streams handler (spec 011). It owns its own repo
// composition because it runs outside the API request pipeline and there's
// no Ctx to thread `repos` through. Allowed list, not a blanket exception.
const HANDLER_REPO_EXEMPT = new Set(["events.ts"]);

const HANDLER_BANNED: RegExp[] = [
    /from\s+["']@aws-sdk\//,
    /from\s+["']aws-sdk["']/,
    /from\s+["'][^"']*\/repos["']/,
    /from\s+["'][^"']*\/repos\//,
    /from\s+["'][^"']*\/adapters\//,
];

const BANNED_PATTERNS: RegExp[] = [
    /from\s+["']@aws-sdk\//,
    /from\s+["']aws-sdk["']/,
    /from\s+["']aws-jwt-verify["']/,
    /from\s+["']jsonwebtoken["']/,
    /from\s+["'][^"']*\/adapters\//,
    /from\s+["'][^"']*\/repos\//,
    /from\s+["']aws-lambda["']/,
];

function* walk(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (p.endsWith(".ts")) yield p;
    }
}

function scan(file: string, isPortsIndex: boolean) {
    const patterns = isPortsIndex
        ? BANNED_PATTERNS.filter((p) => !p.source.includes("repos"))
        : BANNED_PATTERNS;
    const violations: string[] = [];
    readFileSync(file, "utf8")
        .split("\n")
        .forEach((line) => {
            for (const pat of patterns) if (pat.test(line)) violations.push(line.trim());
        });
    return violations;
}

describe("architecture: core/** purity", () => {
    test("the banned-import patterns actually catch a known-bad line", () => {
        const fakes = [
            'import { DynamoDBClient } from "@aws-sdk/client-dynamodb";',
            'import { systemClock } from "../../adapters/clock/system";',
            'import type { APIGatewayEvent } from "aws-lambda";',
        ];
        for (const line of fakes) {
            const hit = BANNED_PATTERNS.some((p) => p.test(line));
            expect(hit).toBe(true);
        }
    });

    test("no banned imports inside core/**", () => {
        const violations: { file: string; line: number; text: string }[] = [];
        for (const file of walk(CORE_ROOT)) {
            const isPortsIndex = file.endsWith(join("core", "ports", "index.ts"));
            for (const text of scan(file, isPortsIndex)) {
                violations.push({ file, line: 0, text });
            }
        }
        if (violations.length) {
            const msg = violations
                .map((v) => `${v.file}:${v.line}  ${v.text}`)
                .join("\n");
            throw new Error(`core/** purity violations:\n${msg}`);
        }
        expect(violations).toEqual([]);
    });

    test("handlers/** must reach repos/adapters only via composition.ts", () => {
        const violations: { file: string; text: string }[] = [];
        for (const file of walk(HANDLERS_ROOT)) {
            const base = file.split("/").pop() ?? file;
            if (HANDLER_REPO_EXEMPT.has(base)) continue;
            const lines = readFileSync(file, "utf8").split("\n");
            for (const line of lines) {
                for (const pat of HANDLER_BANNED) {
                    if (pat.test(line)) violations.push({ file, text: line.trim() });
                }
            }
        }
        if (violations.length) {
            const msg = violations.map((v) => `${v.file}  ${v.text}`).join("\n");
            throw new Error(`handlers/** violations (use composition.ts):\n${msg}`);
        }
        expect(violations).toEqual([]);
    });
});
