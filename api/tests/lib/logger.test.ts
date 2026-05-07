import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeLogger } from "../../src/lib/logger";

type Captured = { level: "log" | "warn" | "error"; line: string };

let captured: Captured[];
let originals: { log: typeof console.log; warn: typeof console.warn; error: typeof console.error };

beforeEach(() => {
    captured = [];
    originals = { log: console.log, warn: console.warn, error: console.error };
    console.log = (line: string) => captured.push({ level: "log", line });
    console.warn = (line: string) => captured.push({ level: "warn", line });
    console.error = (line: string) => captured.push({ level: "error", line });
});

afterEach(() => {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
});

describe("makeLogger", () => {
    const base = { requestId: "r-1", route: "GET /attempts" };

    test("emits one JSON line per call with required fields", () => {
        const log = makeLogger(base);
        log.info("attempt_received", { sub: "u-1" });
        expect(captured.length).toBe(1);
        const obj = JSON.parse(captured[0]!.line);
        expect(obj).toMatchObject({
            level: "info",
            msg: "attempt_received",
            requestId: "r-1",
            route: "GET /attempts",
            sub: "u-1",
        });
        expect(typeof obj.ts).toBe("string");
    });

    test("error() drops .stack and serialises Error name+message", () => {
        const log = makeLogger(base);
        const e = new Error("internal-detail");
        e.stack = "STACK_SHOULD_NOT_LEAK";
        log.error("unhandled", e);
        const obj = JSON.parse(captured[0]!.line);
        expect(obj.err).toEqual({ name: "Error", message: "internal-detail" });
        expect(captured[0]!.line).not.toContain("STACK_SHOULD_NOT_LEAK");
    });

    test("redacts sensitive top-level field names", () => {
        const log = makeLogger(base);
        log.info("auth_attempt", {
            password: "p",
            token: "t",
            cookie: "c",
            authorization: "a",
            secret: "s",
            api_key: "k",
            user: "ok",
        });
        const obj = JSON.parse(captured[0]!.line);
        expect(obj.password).toBe("[REDACTED]");
        expect(obj.token).toBe("[REDACTED]");
        expect(obj.cookie).toBe("[REDACTED]");
        expect(obj.authorization).toBe("[REDACTED]");
        expect(obj.secret).toBe("[REDACTED]");
        expect(obj.api_key).toBe("[REDACTED]");
        expect(obj.user).toBe("ok");
    });

    test("warn and error use console.warn/console.error respectively", () => {
        const log = makeLogger(base);
        log.warn("slow_request");
        log.error("boom", undefined);
        expect(captured[0]!.level).toBe("warn");
        expect(captured[1]!.level).toBe("error");
    });
});
