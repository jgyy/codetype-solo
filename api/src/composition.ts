import { systemClock } from "./adapters/clock/system";
import { uuidId } from "./adapters/id/uuid";
import type { ClockPort, IdPort } from "./core/ports";
import {
    approveSubmission,
    getDailyChallenge,
    getLeaderboard,
    getSnippet,
    listAttempts,
    listSubmissions,
    recordAttempt,
    rejectSubmission,
    retractSnippet,
    submitSnippet,
    upsertProfile,
} from "./core/use-cases";
import { composeRepos, type Repos } from "./repos";

export type { Repos } from "./repos";
export type { SnippetRow, DailySeedRow } from "./repos";

export const prodRepos = (): Repos => composeRepos();

export type Adapters = {
    repos: Repos;
    clock: ClockPort;
    id: IdPort;
};

export type UseCases = {
    listAttempts: ReturnType<typeof listAttempts>;
    getDailyChallenge: ReturnType<typeof getDailyChallenge>;
    recordAttempt: ReturnType<typeof recordAttempt>;
    upsertProfile: ReturnType<typeof upsertProfile>;
    getSnippet: ReturnType<typeof getSnippet>;
    retractSnippet: ReturnType<typeof retractSnippet>;
    submitSnippet: ReturnType<typeof submitSnippet>;
    listSubmissions: ReturnType<typeof listSubmissions>;
    approveSubmission: ReturnType<typeof approveSubmission>;
    rejectSubmission: ReturnType<typeof rejectSubmission>;
    getLeaderboard: ReturnType<typeof getLeaderboard>;
};

export const buildAdapters = (overrides: Partial<Adapters> = {}): Adapters => ({
    repos: overrides.repos ?? composeRepos(),
    clock: overrides.clock ?? systemClock(),
    id: overrides.id ?? uuidId(),
});

export const buildUseCases = (a: Adapters): UseCases => ({
    listAttempts: listAttempts({ attempts: a.repos.attempts }),
    getDailyChallenge: getDailyChallenge({ daily: a.repos.daily, clock: a.clock }),
    recordAttempt: recordAttempt({ attempts: a.repos.attempts, clock: a.clock }),
    upsertProfile: upsertProfile({ profiles: a.repos.profiles, clock: a.clock }),
    getSnippet: getSnippet({ snippets: a.repos.snippets }),
    retractSnippet: retractSnippet({ snippets: a.repos.snippets }),
    submitSnippet: submitSnippet({ submissions: a.repos.submissions }),
    listSubmissions: listSubmissions({ submissions: a.repos.submissions }),
    approveSubmission: approveSubmission({ submissions: a.repos.submissions }),
    rejectSubmission: rejectSubmission({ submissions: a.repos.submissions }),
    getLeaderboard: getLeaderboard({ leaderboard: a.repos.leaderboard, clock: a.clock }),
});

let cached: { adapters: Adapters; useCases: UseCases } | null = null;
export const useCases = (overrides: Partial<Adapters> = {}): UseCases => {
    if (Object.keys(overrides).length === 0) {
        if (!cached) {
            const adapters = buildAdapters();
            cached = { adapters, useCases: buildUseCases(adapters) };
        }
        return cached.useCases;
    }
    return buildUseCases(buildAdapters(overrides));
};
