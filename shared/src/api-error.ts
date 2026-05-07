export type ErrorCode =
  | "unauthorized"
  | "bad_request"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export const apiError = (code: ErrorCode, message: string, details?: unknown): ApiError =>
  details === undefined ? { code, message } : { code, message, details };

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };
