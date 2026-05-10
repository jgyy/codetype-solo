import { accuracyScaledWpm, grossWpm, netWpm, type WpmInput } from "@codetype/shared";

type Props = WpmInput & {
  onAgain: () => void;
  cheatScore?: number;
  cheatReasons?: string[];
};

export function ResultCard(props: Props) {
  const accuracy = props.charsTotal > 0 ? props.charsCorrect / props.charsTotal : 0;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 space-y-4">
      <h2 className="text-xl font-semibold">Result</h2>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="WPM (gross)" value={grossWpm(props).toFixed(1)} />
        <Stat label="WPM (net)" value={netWpm(props).toFixed(1)} />
        <Stat label="WPM (acc-scaled)" value={accuracyScaledWpm(props).toFixed(1)} />
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm text-zinc-400">
        <Stat label="Accuracy" value={`${(accuracy * 100).toFixed(1)}%`} />
        <Stat label="Errors" value={String(props.errors)} />
        <Stat label="Time" value={`${(props.durationMs / 1000).toFixed(2)}s`} />
      </div>
      {props.cheatScore !== undefined && props.cheatScore >= 0.5 && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          Flagged ({(props.cheatScore * 100).toFixed(0)}%) · excluded from leaderboard.
          {props.cheatReasons && props.cheatReasons.length > 0 && (
            <span className="block text-xs text-rose-400/80 mt-1">
              {props.cheatReasons.join(", ")}
            </span>
          )}
        </p>
      )}
      <button
        onClick={props.onAgain}
        className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400"
      >
        New snippet
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-mono">{value}</div>
    </div>
  );
}
