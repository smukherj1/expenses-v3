import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMonthlySummary,
  getCategoryBreakdown,
  getTrend,
  getTopTransactions,
} from "../api/analytics.ts";
import { getTags } from "../api/tags.ts";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";

const MONTH_NAMES = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export default function AnalyticsPage() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [trendTag, setTrendTag] = useState("");
  const [trendMonths] = useState(12);

  const { data: monthly = [] } = useQuery({
    queryKey: ["analytics", "monthly", year],
    queryFn: () => getMonthlySummary(year),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["analytics", "category", year, month],
    queryFn: () => getCategoryBreakdown(year, month),
  });

  const { data: trend = [] } = useQuery({
    queryKey: ["analytics", "trend", trendTag, trendMonths],
    queryFn: () => getTrend(trendTag, trendMonths),
    enabled: !!trendTag,
  });

  const { data: topExpenses = [] } = useQuery({
    queryKey: ["analytics", "top", "expense"],
    queryFn: () => getTopTransactions(10, "expense"),
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: getTags,
    staleTime: 5 * 60_000,
  });

  const barData = monthly.map((m) => ({
    name: MONTH_NAMES[m.month],
    Income: m.income,
    Expenses: m.expenses,
  }));

  const pieData = categories.map((c) => ({
    name: c.tag,
    value: Math.abs(c.total),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h1>

      <div className="space-y-6">
        {/* Monthly bar */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="font-semibold text-gray-800">Monthly Summary</h2>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Income" fill="#10b981" />
              <Bar dataKey="Expenses" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category pie */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="font-semibold text-gray-800">Category Breakdown</h2>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No tagged data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Trend line */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="font-semibold text-gray-800">Trend</h2>
            <select
              value={trendTag}
              onChange={(e) => setTrendTag(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">— select tag —</option>
              {tags.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {!trendTag ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Select a tag to view trend
            </p>
          ) : trend.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No data for this tag
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="amount" stroke="#3b82f6" dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top transactions */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Top 10 Expenses</h2>
          {topExpenses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No data</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-2 text-left text-gray-500 font-medium">
                    Date
                  </th>
                  <th className="py-2 text-left text-gray-500 font-medium">
                    Description
                  </th>
                  <th className="py-2 text-right text-gray-500 font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topExpenses.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 text-gray-500">{t.date}</td>
                    <td className="py-2">{t.description}</td>
                    <td className="py-2 text-right text-red-600 font-medium tabular-nums">
                      {t.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
