export type WpmInput = {
  charsTotal: number;
  charsCorrect: number;
  errors: number;
  durationMs: number;
};

const CHARS_PER_WORD = 5;
const MS_PER_MIN = 60_000;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function grossWpm({ charsTotal, durationMs }: WpmInput): number {
  if (durationMs <= 0) return 0;
  return round1((charsTotal / CHARS_PER_WORD) / (durationMs / MS_PER_MIN));
}

export function netWpm(input: WpmInput): number {
  if (input.durationMs <= 0) return 0;
  const gross = (input.charsTotal / CHARS_PER_WORD) / (input.durationMs / MS_PER_MIN);
  const errPerMin = input.errors / (input.durationMs / MS_PER_MIN);
  return round1(Math.max(0, gross - errPerMin));
}

export function accuracyScaledWpm(input: WpmInput): number {
  if (input.durationMs <= 0) return 0;
  if (input.charsTotal <= 0) return 0;
  const gross = (input.charsTotal / CHARS_PER_WORD) / (input.durationMs / MS_PER_MIN);
  const accuracy = input.charsCorrect / input.charsTotal;
  return round1(gross * accuracy * accuracy);
}
