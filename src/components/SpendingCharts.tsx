'use client';

import { useState } from 'react';
import type { DbTransaction } from '@/lib/types';
import { formatCategory } from '@/lib/utils';

type SpendingChartsProps = {
  transactions: DbTransaction[];
  selectedMonth: string;
};

const COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#6366f1', '#f43f5e',
  '#a855f7', '#84cc16', '#0ea5e9', '#d946ef', '#f59e0b',
];

type TabId = 'categories' | 'trend' | 'top';

export default function SpendingCharts({ transactions, selectedMonth }: SpendingChartsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('categories');

  const monthExpenses = transactions.filter(
    t => !t.is_income && t.date.startsWith(selectedMonth)
  );

  if (monthExpenses.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Spending Breakdown</h2>
        <p className="text-sm text-gray-400">No expenses this month to visualize.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Spending Breakdown</h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1">
        {([
          { id: 'categories' as TabId, label: 'By Category' },
          { id: 'trend' as TabId, label: 'Monthly Trend' },
          { id: 'top' as TabId, label: 'Top Expenses' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-800 font-medium shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && <CategoryBreakdown expenses={monthExpenses} />}
      {activeTab === 'trend' && <MonthlyTrend transactions={transactions} selectedMonth={selectedMonth} />}
      {activeTab === 'top' && <TopExpenses expenses={monthExpenses} />}
    </div>
  );
}

// ── Category Breakdown (horizontal bars) ──
function CategoryBreakdown({ expenses }: { expenses: DbTransaction[] }) {
  const categoryMap = new Map<string, number>();
  for (const t of expenses) {
    categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + Number(t.amount));
  }

  const sorted = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const max = sorted[0]?.[1] || 1;

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500">{sorted.length} categories</p>
        <p className="text-sm font-medium text-gray-700">Total: &euro;{total.toFixed(2)}</p>
      </div>

      {/* Stacked bar */}
      <div className="flex rounded-full h-4 overflow-hidden mb-4">
        {sorted.map(([cat, amount], i) => (
          <div
            key={cat}
            title={`${formatCategory(cat)}: €${amount.toFixed(2)} (${Math.round((amount / total) * 100)}%)`}
            style={{
              width: `${(amount / total) * 100}%`,
              backgroundColor: COLORS[i % COLORS.length],
            }}
            className="h-full transition-all duration-300"
          />
        ))}
      </div>

      {/* Legend with bars */}
      <div className="space-y-2">
        {sorted.map(([cat, amount], i) => {
          const pct = Math.round((amount / total) * 100);
          return (
            <div key={cat} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-sm text-gray-600 w-28 truncate" title={formatCategory(cat)}>
                {formatCategory(cat)}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(amount / max) * 100}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 w-20 text-right">
                &euro;{amount.toFixed(2)} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly Trend (income vs expenses bar chart) ──
function MonthlyTrend({ transactions, selectedMonth }: { transactions: DbTransaction[]; selectedMonth: string }) {
  // Get last 6 months ending with selected month
  const months: string[] = [];
  const [year, month] = selectedMonth.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const monthData = months.map(m => {
    const monthTxns = transactions.filter(t => t.date.startsWith(m));
    const income = monthTxns.filter(t => t.is_income).reduce((s, t) => s + Number(t.amount), 0);
    const expenses = monthTxns.filter(t => !t.is_income).reduce((s, t) => s + Number(t.amount), 0);
    const date = new Date(m + '-15');
    return {
      month: m,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      income,
      expenses,
    };
  });

  const maxVal = Math.max(...monthData.flatMap(d => [d.income, d.expenses]), 1);

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Expenses
        </span>
      </div>

      <div className="flex items-end gap-2 h-40">
        {monthData.map(d => {
          const incomeH = maxVal > 0 ? (d.income / maxVal) * 100 : 0;
          const expenseH = maxVal > 0 ? (d.expenses / maxVal) * 100 : 0;
          const isSelected = d.month === selectedMonth;

          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end gap-0.5 w-full h-32">
                <div className="flex-1 flex flex-col justify-end">
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${isSelected ? 'bg-emerald-500' : 'bg-emerald-300'}`}
                    style={{ height: `${incomeH}%`, minHeight: d.income > 0 ? '2px' : '0' }}
                    title={`Income: €${d.income.toFixed(2)}`}
                  />
                </div>
                <div className="flex-1 flex flex-col justify-end">
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${isSelected ? 'bg-blue-500' : 'bg-blue-300'}`}
                    style={{ height: `${expenseH}%`, minHeight: d.expenses > 0 ? '2px' : '0' }}
                    title={`Expenses: €${d.expenses.toFixed(2)}`}
                  />
                </div>
              </div>
              <span className={`text-[10px] ${isSelected ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Top Expenses (ranked list) ──
function TopExpenses({ expenses }: { expenses: DbTransaction[] }) {
  // Rank individual expenses by amount
  const sorted = [...expenses].sort((a, b) => Number(b.amount) - Number(a.amount));
  const top = sorted.slice(0, 10);
  const max = Number(top[0]?.amount) || 1;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">Top 10 largest expenses this month</p>
      <div className="space-y-2">
        {top.map((t, i) => {
          const amt = Number(t.amount);
          return (
            <div key={t.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5 text-right shrink-0">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-gray-800 truncate">{t.description}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatCategory(t.category)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(amt / max) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-medium text-gray-700 w-20 text-right shrink-0">
                &euro;{amt.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
