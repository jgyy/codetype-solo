// Static, intentionally small. Tweak in PRs as community evolves.
// Match is case-insensitive, substring-based (so "admin1" is also blocked).
export const HANDLE_BLOCKLIST = [
    "admin",
    "moderator",
    "staff",
    "system",
    "anthropic",
    "claude",
    "codetype",
];

export function handleIsBlocked(handle: string): boolean {
    const h = handle.toLowerCase();
    return HANDLE_BLOCKLIST.some((b) => h.includes(b));
}
