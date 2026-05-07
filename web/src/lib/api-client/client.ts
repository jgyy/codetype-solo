"use client";

// Typed client driven by the shared ENDPOINTS registry. Endpoint names,
// paths, methods, and request/response shapes are all derived from
// shared/src/schemas/endpoints.ts — the same source the OpenAPI YAML uses.
//
// Adding a new endpoint: declare it in shared/src/schemas/endpoints.ts, then
// `bun --filter @codetype/shared build:openapi` and you're done. No
// hand-typed URLs, no hand-written response interfaces.

import { z } from "zod";
import { ENDPOINTS, type EndpointName } from "@codetype/shared";
import { CONFIG } from "../config";
import { currentSession } from "../auth";

type Endpoints = typeof ENDPOINTS;
type Def<N extends EndpointName> = Endpoints[N];

type ZTo<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

// Empty-object branches act as the identity element for intersection — using
// Record<string, never> would collapse the whole intersection to `never`.
// eslint-disable-next-line @typescript-eslint/ban-types
type Empty = {};
export type RequestArgs<N extends EndpointName> =
    (Def<N> extends { body: z.ZodTypeAny } ? { body: ZTo<Def<N>["body"]> } : Empty) &
        (Def<N> extends { query: z.ZodTypeAny } ? { query: ZTo<Def<N>["query"]> } : Empty) &
        (Def<N> extends { params: z.ZodTypeAny } ? { params: ZTo<Def<N>["params"]> } : Empty);

export type ResponseFor<N extends EndpointName> = ZTo<Def<N>["response"]>;

type Envelope<T> =
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status: number,
        public details?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function authHeaders(): Promise<HeadersInit> {
    const s = await currentSession();
    return s ? { authorization: `Bearer ${s.idToken}` } : {};
}

function fillPath(template: string, params: Record<string, string | number>): string {
    return template.replace(/\{([^}]+)\}/g, (_, k) => {
        const v = params[k];
        if (v === undefined || v === null) {
            throw new Error(`missing path parameter ${k} for ${template}`);
        }
        return encodeURIComponent(String(v));
    });
}

function buildQuery(query: Record<string, unknown> | undefined): string {
    if (!query) return "";
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        u.set(k, String(v));
    }
    const s = u.toString();
    return s ? `?${s}` : "";
}

export async function call<N extends EndpointName>(
    name: N,
    args: RequestArgs<N>,
): Promise<ResponseFor<N>> {
    const def = ENDPOINTS[name] as {
        method: string;
        path: string;
        body?: z.ZodTypeAny;
        query?: z.ZodTypeAny;
        params?: z.ZodTypeAny;
        response: z.ZodTypeAny;
    };
    const { body, query, params } = args as {
        body?: unknown;
        query?: Record<string, unknown>;
        params?: Record<string, string | number>;
    };

    // Pre-flight client validation (mirrors withSchema on the server).
    if (def.body) {
        const r = def.body.safeParse(body);
        if (!r.success) {
            throw new ApiError("bad_request", "validation_failed", 0, r.error.issues);
        }
    }

    const url = `${CONFIG.apiUrl}${fillPath(def.path, params ?? {})}${buildQuery(query)}`;
    const res = await fetch(url, {
        method: def.method,
        headers: {
            "content-type": "application/json",
            ...(await authHeaders()),
        },
        body: def.body ? JSON.stringify(body ?? {}) : undefined,
    });

    let raw: unknown;
    try {
        raw = await res.json();
    } catch {
        throw new ApiError("internal", `${res.status} ${res.statusText} on ${def.path}`, res.status);
    }
    if (!raw || typeof raw !== "object" || !("ok" in raw)) {
        throw new ApiError("internal", `malformed response on ${def.path}`, res.status);
    }
    const env = raw as Envelope<unknown>;
    if (!env.ok) {
        throw new ApiError(env.error.code, env.error.message, res.status, env.error.details);
    }
    return env.data as ResponseFor<N>;
}
