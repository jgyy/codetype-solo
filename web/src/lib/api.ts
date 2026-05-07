"use client";

import {
    PostAttemptBody,
    type Attempt,
    type Language,
    type LeaderboardResponse,
} from "@codetype/shared";
import { CONFIG } from "./config";
import { currentSession } from "./auth";

async function authHeaders(): Promise<HeadersInit> {
    const s = await currentSession();
    return s ? { authorization: `Bearer ${s.idToken}` } : {};
}

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

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
        "content-type": "application/json",
        ...(await authHeaders()),
        ...(init.headers ?? {}),
    };
    const res = await fetch(`${CONFIG.apiUrl}${path}`, { ...init, headers });
    let body: unknown;
    try {
        body = await res.json();
    } catch {
        throw new ApiError("internal", `${res.status} ${res.statusText} on ${path}`, res.status);
    }
    if (!body || typeof body !== "object" || !("ok" in body)) {
        throw new ApiError("internal", `malformed response on ${path}`, res.status);
    }
    const env = body as Envelope<T>;
    if (env.ok) return env.data;
    throw new ApiError(env.error.code, env.error.message, res.status, env.error.details);
}

export type AttemptItem = Attempt & {
    PK: string;
    SK: string;
    GSI1SK: string;
    wpm_mismatch?: boolean;
};

export async function postAttempt(
    a: Attempt,
): Promise<{ sk?: string; wpm_mismatch?: boolean; duplicate?: boolean; leaderboard_updated?: boolean }> {
    const pre = PostAttemptBody.safeParse(a);
    if (!pre.success) {
        throw new ApiError("bad_request", "validation_failed", 0, pre.error.issues);
    }
    return jsonFetch("/attempts", { method: "POST", body: JSON.stringify(a) });
}

export async function listAttempts(from: string, to: string): Promise<{ items: AttemptItem[] }> {
    return jsonFetch(`/attempts?from=${from}&to=${to}`);
}

export type DailySeed = { snippet_id: string; language: Language };

export async function getDaily(date: string): Promise<DailySeed> {
    return jsonFetch(`/daily?date=${date}`);
}

export async function getSnippet(language: Language, id: string) {
    return jsonFetch<{ code: string; title: string; language: Language }>(
        `/snippets/${language}/${id}`,
    );
}

export type ProfileUpdate = {
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
};

export type ProfileResponse = {
    created: boolean;
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
};

export async function upsertProfile(patch: ProfileUpdate = {}): Promise<ProfileResponse> {
    return jsonFetch("/profile", { method: "POST", body: JSON.stringify(patch) });
}

export type SubmissionDtoView = {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    language: Language;
    title: string;
    code: string;
    difficulty: number;
    submitter_sub: string;
    created_at: string;
    decided_at?: string;
    reject_reason?: string;
    approved_snippet_id?: string;
};

export type NewSubmissionInput = {
    language: Language;
    title: string;
    code: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
};

export async function submitSnippet(
    input: NewSubmissionInput,
): Promise<{ id: string; created_at: string; status: "PENDING" }> {
    return jsonFetch("/snippets/submissions", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function listMySubmissions(): Promise<{ items: SubmissionDtoView[] }> {
    return jsonFetch("/snippets/submissions?mine=true");
}

export async function getLeaderboard(
    lang: Language,
    week?: string,
): Promise<LeaderboardResponse> {
    const qs = new URLSearchParams({ lang });
    if (week) qs.set("week", week);
    return jsonFetch(`/leaderboard?${qs.toString()}`);
}
