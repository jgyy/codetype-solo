import { describe, expect, test } from "bun:test";
import { buildEmf } from "../../src/lib/metrics";

describe("buildEmf", () => {
    test("conforms to AWS EMF spec shape", () => {
        const emf = buildEmf({
            dimensions: { Route: "POST /attempts", Outcome: "success" },
            metrics: [
                { name: "RequestCount", unit: "Count", value: 1 },
                { name: "RequestLatencyMs", unit: "Milliseconds", value: 42 },
            ],
            extras: { requestId: "r-1" },
        });

        expect(emf._aws).toBeDefined();
        const aws = emf._aws as Record<string, unknown>;
        expect(typeof aws.Timestamp).toBe("number");
        const cwm = aws.CloudWatchMetrics as Array<Record<string, unknown>>;
        expect(cwm).toHaveLength(1);
        expect(cwm[0]!.Namespace).toBe("CodeType");
        expect(cwm[0]!.Dimensions).toEqual([["Route", "Outcome"]]);
        expect(cwm[0]!.Metrics).toEqual([
            { Name: "RequestCount", Unit: "Count" },
            { Name: "RequestLatencyMs", Unit: "Milliseconds" },
        ]);

        expect(emf.Route).toBe("POST /attempts");
        expect(emf.Outcome).toBe("success");
        expect(emf.RequestCount).toBe(1);
        expect(emf.RequestLatencyMs).toBe(42);

        expect(emf.requestId).toBe("r-1");
    });

    test("custom namespace overrides default", () => {
        const emf = buildEmf({
            namespace: "Custom",
            dimensions: { K: "v" },
            metrics: [{ name: "X", unit: "Count", value: 1 }],
        });
        const aws = emf._aws as { CloudWatchMetrics: Array<{ Namespace: string }> };
        expect(aws.CloudWatchMetrics[0]!.Namespace).toBe("Custom");
    });

    test("zero dimensions still produces valid payload", () => {
        const emf = buildEmf({
            dimensions: {},
            metrics: [{ name: "Y", unit: "None", value: 0 }],
        });
        const aws = emf._aws as { CloudWatchMetrics: Array<{ Dimensions: unknown }> };
        expect(aws.CloudWatchMetrics[0]!.Dimensions).toEqual([]);
        expect(emf.Y).toBe(0);
    });
});
