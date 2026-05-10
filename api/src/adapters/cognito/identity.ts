import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export type Caller = { sub: string; email?: string; groups: string[] };

function parseGroups(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((g): g is string => typeof g === "string");
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.filter((g): g is string => typeof g === "string");
            } catch {
            }
            return trimmed
                .slice(1, -1)
                .split(/[\s,]+/)
                .filter(Boolean);
        }
        return trimmed.length ? trimmed.split(/[\s,]+/).filter(Boolean) : [];
    }
    return [];
}

export function getCaller(event: APIGatewayProxyEventV2WithJWTAuthorizer): Caller | null {
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return null;
    const sub = claims.sub as string | undefined;
    if (!sub) return null;
    return {
        sub,
        email: claims.email as string | undefined,
        groups: parseGroups((claims as Record<string, unknown>)["cognito:groups"]),
    };
}

export function callerInGroup(caller: Caller | null, group: string): boolean {
    return caller !== null && caller.groups.includes(group);
}
