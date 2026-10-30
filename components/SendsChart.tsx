"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export function SendsChart({
  data,
}: {
  data: Array<{ date: string; sends: number }>;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#71717a" }}
            width={32}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              borderColor: "#e4e4e7",
            }}
          />
          <Line
            type="monotone"
            dataKey="sends"
            stroke="#18181b"
            strokeWidth={2}
            dot={false}
            name="Sends"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
