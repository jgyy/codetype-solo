"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Attempt } from "@codetype/shared";

type Point = { ts: number; label: string; wpm_net: number; wpm_gross: number };

export function WpmChart({ attempts }: { attempts: Attempt[] }) {
  const points: Point[] = [...attempts]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map((a) => ({
      ts: new Date(a.created_at).getTime(),
      label: new Date(a.created_at).toLocaleDateString(),
      wpm_net: a.wpm_net,
      wpm_gross: a.wpm_gross,
    }));

  if (points.length === 0) {
    return <p className="text-zinc-500 text-sm">No attempts yet — chart appears once you finish one.</p>;
  }

  return (
    <div className="h-72 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} />
          <Tooltip
            contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 6 }}
            labelStyle={{ color: "#e4e4e7" }}
          />
          <Line type="monotone" dataKey="wpm_net" stroke="#f59e0b" strokeWidth={2} dot={false} name="Net WPM" />
          <Line type="monotone" dataKey="wpm_gross" stroke="#52525b" strokeWidth={1} dot={false} name="Gross WPM" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
