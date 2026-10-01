"use client";

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useMemo } from "react";

import { logTicks } from "@/lib/downsample";

/** TEMPORARY diagnostic route: which Y-axis configuration actually renders? */
export default function DebugPage() {
  const rows = useMemo(() => {
    const out: Record<string, number>[] = [];
    for (const n of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]) {
      out.push({
        n,
        a: Math.abs(n / 2 - Math.round(n / 2) - 100) + n / 40,
        expected: (Math.sqrt(n) / 2) * Math.sqrt(2 / Math.PI),
      });
    }
    return out;
  }, []);

  const chart = (label: string, node: React.ReactNode) => (
    <section key={label}>
      <h2>{label}</h2>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {node}
        </ResponsiveContainer>
      </div>
    </section>
  );

  return (
    <div>
      {chart(
        "A: log + explicit domain + explicit ticks",
        <LineChart data={rows}>
          <XAxis dataKey="n" scale="log" domain={[1, 50000]} ticks={logTicks(1, 50000)} />
          <YAxis scale="log" domain={[0.5, 62500]} ticks={logTicks(0.5, 62500, 8)} />
          <Line dataKey="a" dot={false} />
          <Line dataKey="expected" dot={false} />
        </LineChart>,
      )}
      {chart(
        "B: log + auto domain",
        <LineChart data={rows}>
          <XAxis dataKey="n" scale="log" domain={[1, 50000]} />
          <YAxis scale="log" />
          <Line dataKey="a" dot={false} />
          <Line dataKey="expected" dot={false} />
        </LineChart>,
      )}
      {chart(
        "C: log + numeric domain, no ticks",
        <LineChart data={rows}>
          <XAxis dataKey="n" scale="log" domain={[1, 50000]} />
          <YAxis scale="log" domain={[0.5, 62500]} />
          <Line dataKey="a" dot={false} />
          <Line dataKey="expected" dot={false} />
        </LineChart>,
      )}
      {chart(
        "D: linear y",
        <LineChart data={rows}>
          <XAxis dataKey="n" scale="log" domain={[1, 50000]} />
          <YAxis />
          <Line dataKey="a" dot={false} />
          <Line dataKey="expected" dot={false} />
        </LineChart>,
      )}
      {chart(
        "E: log y, string domain",
        <LineChart data={rows}>
          <XAxis dataKey="n" scale="log" domain={[1, 50000]} />
          <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow={false} />
          <Line dataKey="a" dot={false} />
        </LineChart>,
      )}
    </div>
  );
}