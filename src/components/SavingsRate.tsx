'use client';

import type { DbTransaction } from '@/lib/types';

type SavingsRateProps = {
  transactions: DbTransaction[];
};

type MonthData = {
  month: string;       // YYYY-MM
  label: string;       // "Jan 2026"
  income: number;
  expenses: number;
  savingsRate: number;  // 0-100 (or negative)
};

function calcYearsToFI(savingsRate: number): number | null {
  // Uses the standard FIRE formula:
  // You need 25x annual expenses (4% safe withdrawal rate).
  // Assumes 5% real returns after inflation, starting from $0 net worth.
  // Formula: n = ln(1 + 25 * (1-s) * r / s) / ln(1+r)
  // where s = savings rate as decimal, r = 0.05
  if (savingsRate <= 0) return null;  // Can't retire if not saving
  if (savingsRate >= 100) return 0;   // Already there

  const s = savingsRate / 100;
  const r = 0.05;
  const years = Math.log(1 + 25 * (1 - s) * r / s) / Math.log(1 + r);
  return Math.round(years * 10) / 10;
}

function getMonthlyData(transactions: DbTransaction[]): MonthData[] {
  // Group transactions by month
  const monthMap = new Map<string, { income: number; expenses: number }>();

  for (const t of transactions) {
    const month = t.date.slice(0, 7); // YYYY-MM
    const entry = monthMap.get(month) || { income: 0, expenses: 0 };
    if (t.is_income) {
      entry.income += Number(t.amount);
    } else {
      entry.expenses += Number(t.amount);
    }
    monthMap.set(month, entry);
  }

  // Sort oldest to newest
  const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return sorted.map(([month, data]) => {
    const savingsRate = data.income > 0
      ? ((data.income - data.expenses) / data.income) * 100
      : 0;
    const date = new Date(month + '-15'); // mid-month to avoid timezone issues
    return {
      month,
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      income: data.income,
      expenses: data.expenses,
      savingsRate: Math.round(savingsRate * 10) / 10,
    };
  });
}

function calcRollingAverage(data: MonthData[], months: number): number | null {
  if (data.length < months) return null;
  const recent = data.slice(-months);
  const totalIncome = recent.reduce((s, d) => s + d.income, 0);
  const totalExpenses = recent.reduce((s, d) => s + d.expenses, 0);
  if (totalIncome === 0) return null;
  return Math.round(((totalIncome - totalExpenses) / totalIncome) * 1000) / 10;
}

export default function SavingsRate({ transactions }: SavingsRateProps) {
  const monthlyData = getMonthlyData(transactions);

  // Need at least 1 month with income to show anything useful
  const hasIncome = monthlyData.some(d => d.income > 0);
  if (!hasIncome) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Savings Rate</h2>
        <p className="text-sm text-gray-400">Add some income transactions to see your savings rate.</p>
      </div>
    );
  }

  const current = monthlyData[monthlyData.length - 1];
  const rolling3 = calcRollingAverage(monthlyData, 3);
  const rolling12 = calcRollingAverage(monthlyData, 12);
  const yearsToFI = calcYearsToFI(current.savingsRate);

  // For the trend, show last 6 months
  const trendData = monthlyData.slice(-6);

  const rateColor = (rate: number) => {
    if (rate >= 50) return 'text-green-600';
    if (rate >= 20) return 'text-yellow-600';
    if (rate >= 0) return 'text-orange-600';
    return 'text-red-600';
  };

  const barColor = (rate: number) => {
    if (rate >= 50) return 'bg-green-500';
    if (rate >= 20) return 'bg-yellow-500';
    if (rate >= 0) return 'bg-orange-400';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Savings Rate</h2>

      {/* Current month + rolling averages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg text-center">
          <p className="text-xs text-gray-500 mb-1">{current.label}</p>
          <p className={`text-2xl font-bold ${rateColor(current.savingsRate)}`}>
            {current.savingsRate > 0 ? '+' : ''}{current.savingsRate}%
          </p>
        </div>
        {rolling3 !== null && (
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <p className="text-xs text-gray-500 mb-1">3-Month Avg</p>
            <p className={`text-2xl font-bold ${rateColor(rolling3)}`}>
              {rolling3 > 0 ? '+' : ''}{rolling3}%
            </p>
          </div>
        )}
        {rolling12 !== null && (
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <p className="text-xs text-gray-500 mb-1">12-Month Avg</p>
            <p className={`text-2xl font-bold ${rateColor(rolling12)}`}>
              {rolling12 > 0 ? '+' : ''}{rolling12}%
            </p>
          </div>
        )}
        {yearsToFI !== null && (
          <div className="bg-emerald-50 p-4 rounded-lg text-center">
            <p className="text-xs text-gray-500 mb-1">Years to FI</p>
            <p className="text-2xl font-bold text-emerald-700">
              {yearsToFI > 99 ? '99+' : yearsToFI}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">at current rate</p>
          </div>
        )}
      </div>

      {/* Monthly trend bars */}
      {trendData.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Trend</h3>
          <div className="space-y-2">
            {trendData.map(d => {
              // Scale: bar width based on savings rate, clamped 0-100 for display
              const displayRate = Math.max(0, Math.min(d.savingsRate, 100));
              return (
                <div key={d.month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 shrink-0">{d.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
                    {displayRate > 0 && (
                      <div
                        className={`h-4 rounded-full transition-all duration-500 ${barColor(d.savingsRate)}`}
                        style={{ width: `${displayRate}%` }}
                      />
                    )}
                  </div>
                  <span className={`text-xs font-medium w-14 text-right ${rateColor(d.savingsRate)}`}>
                    {d.savingsRate > 0 ? '+' : ''}{d.savingsRate}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Savings rate = (Income - Expenses) / Income. Years to FI assumes 5% real returns and the 4% rule.
          </p>
        </div>
      )}
    </div>
  );
}
