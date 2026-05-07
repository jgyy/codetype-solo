import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./client";
import { makeDdbAttemptsRepo, makeInMemoryAttemptsRepo, type AttemptsRepo } from "./attempts";
import { makeDdbDailyRepo, makeInMemoryDailyRepo, type DailyRepo } from "./daily";
import {
    makeDdbSnippetsRepo,
    makeInMemorySnippetsRepo,
    type SnippetRow,
    type SnippetsRepo,
} from "./snippets";
import { makeDdbProfileRepo, makeInMemoryProfileRepo, type ProfileRepo } from "./profile";
import {
    makeDdbLeaderboardRepo,
    makeInMemoryLeaderboardRepo,
    type LeaderboardRepo,
} from "./leaderboard";

export type Repos = {
    attempts: AttemptsRepo;
    snippets: SnippetsRepo;
    daily: DailyRepo;
    profiles: ProfileRepo;
    leaderboard: LeaderboardRepo;
};

export function composeRepos(
    client: DynamoDBDocumentClient = ddb,
    table: string = TABLE,
): Repos {
    const snippets = makeDdbSnippetsRepo(client, table);
    return {
        attempts: makeDdbAttemptsRepo(client, table),
        snippets,
        daily: makeDdbDailyRepo(client, table, snippets),
        profiles: makeDdbProfileRepo(client, table),
        leaderboard: makeDdbLeaderboardRepo(client, table),
    };
}

export function composeInMemoryRepos(seedSnippets: SnippetRow[] = []): Repos {
    const snippets = makeInMemorySnippetsRepo(seedSnippets);
    return {
        attempts: makeInMemoryAttemptsRepo(),
        snippets,
        daily: makeInMemoryDailyRepo(snippets),
        profiles: makeInMemoryProfileRepo(),
        leaderboard: makeInMemoryLeaderboardRepo(),
    };
}

export type {
    AttemptsRepo,
    DailyRepo,
    LeaderboardRepo,
    ProfileRepo,
    SnippetsRepo,
    SnippetRow,
};
export type { NewAttempt, AttemptRow } from "./attempts";
export type { DailySeedRow } from "./daily";
export type { ProfilePatch, ProfileRow } from "./profile";
export type { LbEntry, LbState } from "./leaderboard";
