"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RevenueDataPoint {
  month: string;
  revenue: number;
}

export default function RevenueChart({ data }: { data: RevenueDataPoint[] }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg">
      <div className="px-5 py-4 border-b border-bb-border">
        <h2 className="font-display font-semibold">Revenue Overview</h2>
      </div>
      <div className="p-5 h-[300px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-bb-dim text-sm">
            No revenue data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FF6B00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis
                dataKey="month"
                stroke="#666666"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#666666"
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#141414",
                  border: "1px solid #2A2A2A",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#FF6B00"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
