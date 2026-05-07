"use client";

// Thin convenience wrappers over the typed client (web/src/lib/api-client).
// Endpoint URLs and shapes live in shared/src/schemas/endpoints.ts — never
// here. Adding/renaming an endpoint touches only the shared registry.

import type {
    Attempt,
    Language,
    LeaderboardResponse,
    SubmissionDto,
} from "@codetype/shared";
import { call, type ResponseFor } from "./api-client/client";

export { ApiError } from "./api-client/client";

export type AttemptItem = Attempt & {
    PK: string;
    SK: string;
    GSI1SK: string;
    wpm_mismatch?: boolean;
};

export async function postAttempt(a: Attempt): Promise<ResponseFor<"postAttempt">> {
    return call("postAttempt", { body: a });
}

export async function listAttempts(from: string, to: string): Promise<{ items: AttemptItem[] }> {
    const r = await call("listAttempts", { query: { from, to } });
    return { items: r.items as unknown as AttemptItem[] };
}

export type DailySeed = { snippet_id: string; language: Language };

export async function getDaily(date: string): Promise<DailySeed> {
    const r = await call("getDaily", { query: { date } });
    return { snippet_id: r.snippet_id, language: r.language };
}

export async function getSnippet(language: Language, id: string) {
    return call("getSnippet", { params: { lang: language, id } });
}

export type ProfileUpdate = {
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
};

export type ProfileResponse = ResponseFor<"upsertProfile">;

export async function upsertProfile(patch: ProfileUpdate = {}): Promise<ProfileResponse> {
    return call("upsertProfile", { body: patch });
}

export async function getLeaderboard(
    lang: Language,
    week?: string,
): Promise<LeaderboardResponse> {
    const r = await call("getLeaderboard", { query: { lang, week } });
    return r as unknown as LeaderboardResponse;
}

export type SubmissionDtoView = SubmissionDto;

export type NewSubmissionInput = {
    language: Language;
    title: string;
    code: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
};

export async function submitSnippet(
    input: NewSubmissionInput,
): Promise<ResponseFor<"submitSnippet">> {
    return call("submitSnippet", { body: input });
}

export async function listMySubmissions(): Promise<{ items: SubmissionDtoView[] }> {
    const r = await call("listSubmissions", { query: { mine: "true" } });
    return { items: r.items as unknown as SubmissionDtoView[] };
}

