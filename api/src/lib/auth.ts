import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export type Caller = { sub: string; email?: string };

export function getCaller(event: APIGatewayProxyEventV2WithJWTAuthorizer): Caller | null {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return null;
  const sub = claims.sub as string | undefined;
  if (!sub) return null;
  return { sub, email: claims.email as string | undefined };
}

export function unauthorized() {
  return json(401, { error: "unauthorized" });
}

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function badRequest(message: string) {
  return json(400, { error: "bad_request", message });
}
