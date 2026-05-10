// Single source of truth for every HTTP endpoint. The OpenAPI generator and
// the web client both consume this registry; if a backend renames a path or
// changes a body shape, both sides update mechanically.

import type { ZodTypeAny } from "zod";
import {
    ListAttemptsQuery,
    PostAttemptBody,
} from "./attempts";
import { DailyQuery } from "./daily";
import { DrillSnippetQuery, GetSnippetParams, NextSnippetQuery } from "./snippets";
import { UpsertProfileBody } from "./profile";
import { GetLeaderboardQuery } from "./leaderboard";
import {
    ListSubmissionsQuery,
    RejectBody,
    RetractParam,
    SubmissionBody,
    SubmissionIdParam,
} from "./submissions";
import {
    ApproveResponse,
    DailyResponse,
    DrillSnippetResponse,
    ErrorModelResponse,
    LeaderboardResponseSchema,
    ListAttemptsResponse,
    ListSubmissionsResponse,
    NextSnippetResponse,
    PostAttemptResponse,
    ProfileResponse,
    RejectResponse,
    RetractResponse,
    SnippetResponse,
    SubmitResponse,
} from "./responses";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type EndpointDef = {
    operationId: string;
    method: Method;
    /** Path template with `{param}` placeholders, OpenAPI-style. */
    path: string;
    /** Whether the endpoint requires JWT auth. */
    auth: "user" | "mod" | "public";
    description: string;
    body?: ZodTypeAny;
    query?: ZodTypeAny;
    params?: ZodTypeAny;
    response: ZodTypeAny;
};

export const ENDPOINTS = {
    postAttempt: {
        operationId: "postAttempt",
        method: "POST",
        path: "/attempts",
        auth: "user",
        description: "Record a typing attempt; server recomputes WPM and runs anti-cheat.",
        body: PostAttemptBody,
        response: PostAttemptResponse,
    },
    listAttempts: {
        operationId: "listAttempts",
        method: "GET",
        path: "/attempts",
        auth: "user",
        description: "List the caller's recent attempts within an optional date range.",
        query: ListAttemptsQuery,
        response: ListAttemptsResponse,
    },
    getDaily: {
        operationId: "getDaily",
        method: "GET",
        path: "/daily",
        auth: "public",
        description: "Get (or self-seed) the daily-challenge snippet for a given UTC date.",
        query: DailyQuery,
        response: DailyResponse,
    },
    getSnippet: {
        operationId: "getSnippet",
        method: "GET",
        path: "/snippets/{lang}/{id}",
        auth: "public",
        description: "Fetch a single snippet by language and id.",
        params: GetSnippetParams,
        response: SnippetResponse,
    },
    upsertProfile: {
        operationId: "upsertProfile",
        method: "POST",
        path: "/profile",
        auth: "user",
        description: "Create or update the caller's profile (handle, leaderboard opt-in).",
        body: UpsertProfileBody,
        response: ProfileResponse,
    },
    getLeaderboard: {
        operationId: "getLeaderboard",
        method: "GET",
        path: "/leaderboard",
        auth: "public",
        description: "Top 50 entries for a language and ISO week (defaults to current week).",
        query: GetLeaderboardQuery,
        response: LeaderboardResponseSchema,
    },
    submitSnippet: {
        operationId: "submitSnippet",
        method: "POST",
        path: "/snippets/submissions",
        auth: "user",
        description: "Submit a snippet for moderator review (rate-limited per user).",
        body: SubmissionBody,
        response: SubmitResponse,
    },
    listSubmissions: {
        operationId: "listSubmissions",
        method: "GET",
        path: "/snippets/submissions",
        auth: "user",
        description: "List submissions — `?mine=true` for the caller, `?status=PENDING` for mods.",
        query: ListSubmissionsQuery,
        response: ListSubmissionsResponse,
    },
    approveSubmission: {
        operationId: "approveSubmission",
        method: "POST",
        path: "/snippets/submissions/{id}/approve",
        auth: "mod",
        description: "Approve a pending submission; promotes it to a SNIPPET row.",
        params: SubmissionIdParam,
        response: ApproveResponse,
    },
    rejectSubmission: {
        operationId: "rejectSubmission",
        method: "POST",
        path: "/snippets/submissions/{id}/reject",
        auth: "mod",
        description: "Reject a pending submission with a free-form reason.",
        params: SubmissionIdParam,
        body: RejectBody,
        response: RejectResponse,
    },
    retractSnippet: {
        operationId: "retractSnippet",
        method: "POST",
        path: "/snippets/{lang}/{id}/retract",
        auth: "mod",
        description: "Retire an approved snippet so it stops appearing in listings or daily.",
        params: RetractParam,
        response: RetractResponse,
    },
    // Spec 013
    getNextSnippet: {
        operationId: "getNextSnippet",
        method: "GET",
        path: "/snippets/next",
        auth: "public",
        description: "Adaptive next-snippet picker. Falls back to random for guests or cold-start users.",
        query: NextSnippetQuery,
        response: NextSnippetResponse,
    },
    getDrillSnippet: {
        operationId: "getDrillSnippet",
        method: "GET",
        path: "/snippets/drill",
        auth: "public",
        description: "Synthesised micro-snippet targeting one symbol class; deterministic per (user, day, class).",
        query: DrillSnippetQuery,
        response: DrillSnippetResponse,
    },
    getErrorModel: {
        operationId: "getErrorModel",
        method: "GET",
        path: "/profile/error-model",
        auth: "user",
        description: "The caller's per-user weakness model — top bigrams and symbol classes.",
        response: ErrorModelResponse,
    },
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof ENDPOINTS;
export type EndpointName = keyof Endpoints;
