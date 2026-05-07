#!/usr/bin/env bun
// Generate docs/api/openapi.yaml from the shared Zod schemas and endpoint
// registry. CI runs this and fails if the committed YAML drifts.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stringify } from "yaml";
import {
    OpenAPIRegistry,
    OpenApiGeneratorV31,
    extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { ENDPOINTS, type EndpointDef } from "../src/schemas/endpoints";
import type { ErrorCode } from "../src/api-error";

const ERROR_CODES: ErrorCode[] = [
    "unauthorized",
    "bad_request",
    "not_found",
    "conflict",
    "rate_limited",
    "internal",
];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
    unauthorized: 401,
    bad_request: 400,
    not_found: 404,
    conflict: 409,
    rate_limited: 429,
    internal: 500,
};

const registry = new OpenAPIRegistry();

const ApiErrorSchema = registry.register(
    "ApiError",
    z.object({
        code: z.enum(ERROR_CODES as [ErrorCode, ...ErrorCode[]]),
        message: z.string(),
        details: z.unknown().optional(),
    }),
);

function envelope(dataSchema: z.ZodTypeAny) {
    return z.object({ ok: z.literal(true), data: dataSchema });
}

const ErrorEnvelope = registry.register(
    "ErrorEnvelope",
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
);

function security(auth: EndpointDef["auth"]) {
    return auth === "public" ? [] : [{ bearerAuth: [] }];
}

// Derive the parameters block (path + query) for a single endpoint.
function parametersFor(def: EndpointDef): {
    name: string;
    in: "path" | "query";
    required: boolean;
    schema: { type: string };
}[] | undefined {
    const out: ReturnType<typeof parametersFor> = [];
    if (def.params) {
        const shape = (def.params as z.ZodObject<z.ZodRawShape>).shape;
        for (const [name] of Object.entries(shape)) {
            out!.push({ name, in: "path", required: true, schema: { type: "string" } });
        }
    }
    if (def.query) {
        const obj = def.query as z.ZodObject<z.ZodRawShape>;
        const shape = obj.shape;
        for (const [name, member] of Object.entries(shape)) {
            const optional = member.isOptional?.() ?? false;
            out!.push({ name, in: "query", required: !optional, schema: { type: "string" } });
        }
    }
    return out!.length ? out : undefined;
}

for (const def of Object.values(ENDPOINTS) as EndpointDef[]) {
    const responses: Record<string, unknown> = {
        "200": {
            description: "OK",
            content: {
                "application/json": { schema: envelope(def.response) },
            },
        },
    };
    // POST defaults to 201 in our adapter unless overridden — we list both
    // so generated clients accept either status as success.
    if (def.method === "POST") {
        responses["201"] = {
            description: "Created",
            content: { "application/json": { schema: envelope(def.response) } },
        };
    }
    for (const code of ERROR_CODES) {
        responses[String(STATUS_BY_CODE[code])] = {
            description: code,
            content: { "application/json": { schema: ErrorEnvelope } },
        };
    }

    registry.registerPath({
        method: def.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete",
        path: def.path,
        operationId: def.operationId,
        description: def.description,
        tags: [def.auth === "mod" ? "moderation" : def.auth === "user" ? "user" : "public"],
        security: security(def.auth),
        ...(def.body
            ? {
                  request: {
                      body: {
                          content: {
                              "application/json": { schema: def.body },
                          },
                      },
                      ...(parametersFor(def) ? { params: def.params, query: def.query } : {}),
                  },
              }
            : parametersFor(def)
              ? { request: { params: def.params, query: def.query } }
              : {}),
        responses,
    });
}

registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
});

const generator = new OpenApiGeneratorV31(registry.definitions);
const doc = generator.generateDocument({
    openapi: "3.1.0",
    info: {
        title: "CodeType Solo API",
        version: "0.1.0",
        description:
            "Generated from shared Zod schemas. Edit shared/src/schemas/* and run `bun --filter @codetype/shared build:openapi` to regenerate.",
    },
});

const outPath = resolve(import.meta.dir, "..", "..", "docs", "api", "openapi.yaml");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, stringify(doc, { lineWidth: 0 }));
console.log(`wrote ${outPath}`);
