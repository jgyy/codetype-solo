const MS_PER_DAY = 86_400_000;

function parseUtc(d: string): number {
  return Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)) - 1,
    Number(d.slice(8, 10)),
  );
}

function fmtUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function streak(attemptDatesUtc: string[], todayUtc: string): number {
  const todayMs = parseUtc(todayUtc);
  const valid = new Set<string>();
  for (const d of attemptDatesUtc) {
    if (parseUtc(d) <= todayMs) valid.add(d);
  }
  let count = 0;
  for (let cursor = todayMs; ; cursor -= MS_PER_DAY) {
    if (!valid.has(fmtUtc(cursor))) break;
    count++;
  }
  return count;
}
