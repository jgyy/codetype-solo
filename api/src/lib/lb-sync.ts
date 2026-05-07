import { isoWeek, type Language } from "@codetype/shared";
import type { Repos } from "../repos";

const MIN_ATTEMPTS = 3;

export type LbSyncResult =
    | { kind: "skipped"; reason: "not_optin" | "no_handle" | "below_min" | "no_score" | "lookup_failed" }
    | { kind: "updated"; new_best: number }
    | { kind: "no_change" }
    | { kind: "removed" };

export async function syncLeaderboardForUser(
    repos: Repos,
    sub: string,
    language: Language,
    now: Date = new Date(),
): Promise<LbSyncResult> {
    const profileRes = await repos.profiles.get(sub);
    if (!profileRes.ok) return { kind: "skipped", reason: "lookup_failed" };
    const profile = profileRes.value;
    if (!profile || profile.leaderboard_optin !== true) return { kind: "skipped", reason: "not_optin" };
    if (!profile.handle) return { kind: "skipped", reason: "no_handle" };

    const week = isoWeek(now);
    const to = now.toISOString().slice(0, 10);
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    const from = fromDate.toISOString().slice(0, 10);

    const attemptsRes = await repos.attempts.listByUser(sub, { from, to });
    if (!attemptsRes.ok) return { kind: "skipped", reason: "lookup_failed" };
    const inWindow = attemptsRes.value.filter((a) => a.language === language);
    const count = inWindow.length;

    if (count < MIN_ATTEMPTS) {
        await repos.leaderboard.remove(language, week, sub);
        return { kind: "skipped", reason: "below_min" };
    }

    const bestScaled = inWindow.reduce(
        (max, a) => Math.max(max, Number(a.wpm_scaled ?? 0)),
        0,
    );
    if (bestScaled <= 0) return { kind: "skipped", reason: "no_score" };

    const upsert = await repos.leaderboard.upsert(language, week, {
        sub,
        handle: profile.handle,
        wpm_scaled: bestScaled,
        attempts_in_window: count,
        updated_at: now.toISOString(),
    });
    if (!upsert.ok) return { kind: "skipped", reason: "lookup_failed" };
    return upsert.value.updated ? { kind: "updated", new_best: bestScaled } : { kind: "no_change" };
}
