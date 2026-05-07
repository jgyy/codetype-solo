// Structured JSON logger for Lambdas.
// One line per call. Always includes ts, level, msg, requestId, route.
// Sensitive field names are redacted (case-insensitive) at the top level.

export type Logger = {
    info(msg: string, fields?: Record<string, unknown>): void;
    warn(msg: string, fields?: Record<string, unknown>): void;
    error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
};

export type LoggerBase = {
    requestId: string;
    route: string;
};

const SENSITIVE_KEY = /^(password|token|cookie|authorization|secret|api_-?key|access_-?token|refresh_-?token)$/i;

function redact(fields: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : v;
    }
    return out;
}

function serializeError(err: unknown): { name: string; message: string } {
    if (err instanceof Error) return { name: err.name, message: err.message };
    return { name: "NonError", message: String(err) };
}

function emit(
    level: "info" | "warn" | "error",
    base: LoggerBase,
    msg: string,
    fields?: Record<string, unknown>,
): void {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        requestId: base.requestId,
        route: base.route,
        ...(fields ? redact(fields) : {}),
    });
    if (level === "error") {
        // eslint-disable-next-line no-console
        console.error(line);
    } else if (level === "warn") {
        // eslint-disable-next-line no-console
        console.warn(line);
    } else {
        // eslint-disable-next-line no-console
        console.log(line);
    }
}

export function makeLogger(base: LoggerBase): Logger {
    return {
        info: (msg, fields) => emit("info", base, msg, fields),
        warn: (msg, fields) => emit("warn", base, msg, fields),
        error: (msg, err, fields) =>
            emit("error", base, msg, {
                ...(err !== undefined ? { err: serializeError(err) } : {}),
                ...(fields ?? {}),
            }),
    };
}

export const SENSITIVE_KEY_RE_FOR_TEST = SENSITIVE_KEY;
