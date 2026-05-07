// ISO-8601 week number for a UTC date.
// Format: "YYYY-Www" (e.g. "2026-W19").

export function isoWeek(date: Date): string {
    // Copy and use UTC.
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Thursday of the current week determines the year. (ISO weeks belong to
    // whichever year contains the week's Thursday.)
    const day = d.getUTCDay() || 7; // 1..7, Mon..Sun
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const ISO_WEEK_RE = /^\d{4}-W\d{2}$/;

// Numeric padding for SK ordering: "0093.4" so lexicographic == numeric ascending.
export function padScaled(wpmScaled: number): string {
    const n = Math.max(0, Math.min(9999.9, wpmScaled));
    return n.toFixed(1).padStart(6, "0");
}
