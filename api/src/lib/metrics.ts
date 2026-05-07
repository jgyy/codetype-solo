// CloudWatch Embedded Metric Format (EMF) emitter.
// Each call writes one JSON line to stdout that CloudWatch parses into
// metrics on ingest. No extra cost beyond the log line.
//
// Reference: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html

export type EmfUnit =
    | "Milliseconds"
    | "Count"
    | "Bytes"
    | "Percent"
    | "None";

export type EmfMetric = {
    name: string;
    unit: EmfUnit;
    value: number;
};

export type EmfPayload = {
    namespace?: string;
    dimensions: Record<string, string>;
    metrics: EmfMetric[];
    extras?: Record<string, unknown>;
};

const DEFAULT_NAMESPACE = "CodeType";

export function buildEmf(p: EmfPayload): Record<string, unknown> {
    const dimKeys = Object.keys(p.dimensions);
    const root: Record<string, unknown> = {
        _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [
                {
                    Namespace: p.namespace ?? DEFAULT_NAMESPACE,
                    Dimensions: dimKeys.length > 0 ? [dimKeys] : [],
                    Metrics: p.metrics.map((m) => ({ Name: m.name, Unit: m.unit })),
                },
            ],
        },
        ...p.dimensions,
        ...p.extras,
    };
    for (const m of p.metrics) root[m.name] = m.value;
    return root;
}

export function emitEmf(p: EmfPayload): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(buildEmf(p)));
}
