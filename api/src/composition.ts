import { systemClock } from "./adapters/clock/system";
import { uuidId } from "./adapters/id/uuid";
import { systemRng } from "./adapters/rng/system";
import type { ClockPort, IdPort, RngPort } from "./core/ports";
import {
    approveSubmission,
    getDailyChallenge,
    getDrillSnippet,
    getErrorModel,
    getLeaderboard,
    getNextSnippet,
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
    rng: RngPort;
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
    getNextSnippet: ReturnType<typeof getNextSnippet>;
    getDrillSnippet: ReturnType<typeof getDrillSnippet>;
    getErrorModel: ReturnType<typeof getErrorModel>;
};

export const buildAdapters = (overrides: Partial<Adapters> = {}): Adapters => ({
    repos: overrides.repos ?? composeRepos(),
    clock: overrides.clock ?? systemClock(),
    id: overrides.id ?? uuidId(),
    rng: overrides.rng ?? systemRng(),
});

export const buildUseCases = (a: Adapters): UseCases => ({
    listAttempts: listAttempts({ attempts: a.repos.attempts }),
    getDailyChallenge: getDailyChallenge({ daily: a.repos.daily, clock: a.clock }),
    recordAttempt: recordAttempt({
        attempts: a.repos.attempts,
        clock: a.clock,
        profiles: a.repos.profiles,
        snippets: a.repos.snippets,
    }),
    upsertProfile: upsertProfile({ profiles: a.repos.profiles, clock: a.clock }),
    getSnippet: getSnippet({ snippets: a.repos.snippets }),
    retractSnippet: retractSnippet({ snippets: a.repos.snippets }),
    submitSnippet: submitSnippet({ submissions: a.repos.submissions }),
    listSubmissions: listSubmissions({ submissions: a.repos.submissions }),
    approveSubmission: approveSubmission({ submissions: a.repos.submissions }),
    rejectSubmission: rejectSubmission({ submissions: a.repos.submissions }),
    getLeaderboard: getLeaderboard({ leaderboard: a.repos.leaderboard, clock: a.clock }),
    getNextSnippet: getNextSnippet({
        snippets: a.repos.snippets,
        profiles: a.repos.profiles,
        rng: a.rng,
    }),
    getDrillSnippet: getDrillSnippet({ rng: a.rng, clock: a.clock }),
    getErrorModel: getErrorModel({ profiles: a.repos.profiles }),
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
