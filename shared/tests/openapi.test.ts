import { describe, expect, test } from "bun:test";
import {
    OpenAPIRegistry,
    OpenApiGeneratorV31,
    extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

describe("zod-to-openapi generator (fixture)", () => {
    test("turns a small Zod schema into a stable OpenAPI shape", () => {
        const reg = new OpenAPIRegistry();
        const Point = reg.register(
            "Point",
            z.object({
                x: z.number().int(),
                y: z.number().int(),
                label: z.string().optional(),
            }),
        );
        reg.registerPath({
            method: "get",
            path: "/points/{id}",
            operationId: "getPoint",
            request: { params: z.object({ id: z.string() }) },
            responses: {
                "200": {
                    description: "OK",
                    content: { "application/json": { schema: Point } },
                },
            },
        });

        const gen = new OpenApiGeneratorV31(reg.definitions);
        const doc = gen.generateDocument({
            openapi: "3.1.0",
            info: { title: "fixture", version: "0.0.0" },
        });

        expect(doc.openapi).toBe("3.1.0");
        const point = doc.components?.schemas?.Point as Record<string, unknown>;
        expect(point.type).toBe("object");
        expect(point.required).toEqual(["x", "y"]);
        const props = point.properties as Record<string, Record<string, unknown>>;
        expect(props.x.type).toBe("integer");
        expect(props.label.type).toBe("string");

        const path = doc.paths?.["/points/{id}"] as Record<string, unknown>;
        const get = path.get as Record<string, unknown>;
        expect(get.operationId).toBe("getPoint");
    });
});
