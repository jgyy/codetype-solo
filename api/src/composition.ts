import { systemClock } from "./adapters/clock/system";
import { uuidId } from "./adapters/id/uuid";
import type { ClockPort, IdPort } from "./core/ports";
import {
    getDailyChallenge,
    listAttempts,
    recordAttempt,
} from "./core/use-cases";
import { composeRepos, type Repos } from "./repos";

export type Adapters = {
    repos: Repos;
    clock: ClockPort;
    id: IdPort;
};

export type UseCases = {
    listAttempts: ReturnType<typeof listAttempts>;
    getDailyChallenge: ReturnType<typeof getDailyChallenge>;
    recordAttempt: ReturnType<typeof recordAttempt>;
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
