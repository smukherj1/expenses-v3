import { useQuery } from "@tanstack/react-query";
import { getMonthlySummary, getCategoryBreakdown } from "../api/analytics.ts";
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

const PIE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export default function DashboardPage() {
  const { data: monthly = [] } = useQuery({
    queryKey: ["analytics", "monthly", currentYear],
    queryFn: () => getMonthlySummary(currentYear),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["analytics", "category", currentYear, currentMonth],
    queryFn: () => getCategoryBreakdown(currentYear, currentMonth),
  });

  const thisMonth = monthly.find((m) => m.month === currentMonth);
  const totalIncome = thisMonth?.income ?? 0;
  const totalExpenses = thisMonth?.expenses ?? 0;
  const net = totalIncome - totalExpenses;

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div
          className="bg-white rounded-xl border p-5"
          data-testid="card-income"
        >
          <p className="text-sm text-gray-500 mb-1">Income (this month)</p>
          <p className="text-2xl font-bold text-green-600">
            ${totalIncome.toFixed(2)}
          </p>
        </div>
        <div
          className="bg-white rounded-xl border p-5"
          data-testid="card-expenses"
        >
          <p className="text-sm text-gray-500 mb-1">Expenses (this month)</p>
          <p className="text-2xl font-bold text-red-600">
            ${totalExpenses.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5" data-testid="card-net">
          <p className="text-sm text-gray-500 mb-1">Net (this month)</p>
          <p
            className={`text-2xl font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            ${net.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            Monthly Income vs Expenses ({currentYear})
          </h2>
          {barData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No data yet
            </p>
          ) : (
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
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            Spending by Category (this month)
          </h2>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No tagged transactions this month
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
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name} ${(percent ?? 0 * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
