'use client';

import { useState } from 'react';
import type { DbTransaction } from '@/lib/types';
import { formatCategory } from '@/lib/utils';

type RecurringExpensesProps = {
  transactions: DbTransaction[];
};

type RecurringItem = {
  description: string;
  category: string;
  avgAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  occurrences: number;
  lastDate: string;
  nextExpected: string;
  amounts: number[];
  priceChange: number | null; // percentage change between last two amounts
};

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().split('T')[0];
}

function classifyFrequency(medianInterval: number): RecurringItem['frequency'] | null {
  if (medianInterval >= 5 && medianInterval <= 10) return 'weekly';
  if (medianInterval >= 12 && medianInterval <= 18) return 'biweekly';
  if (medianInterval >= 25 && medianInterval <= 38) return 'monthly';
  if (medianInterval >= 80 && medianInterval <= 100) return 'quarterly';
  return null;
}

function frequencyLabel(f: RecurringItem['frequency']): string {
  switch (f) {
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Every 2 weeks';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
  }
}

function frequencyToDays(f: RecurringItem['frequency']): number {
  switch (f) {
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'monthly': return 30;
    case 'quarterly': return 90;
  }
}

function monthlyEquivalent(amount: number, frequency: RecurringItem['frequency']): number {
  switch (frequency) {
    case 'weekly': return amount * 4.33;
    case 'biweekly': return amount * 2.17;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function detectRecurring(transactions: DbTransaction[]): RecurringItem[] {
  // Only look at expenses
  const expenses = transactions.filter(t => !t.is_income);

  // Group by normalized description
  const groups = new Map<string, DbTransaction[]>();
  for (const t of expenses) {
    const key = t.description.trim().toLowerCase();
    const group = groups.get(key) || [];
    group.push(t);
    groups.set(key, group);
  }

  const results: RecurringItem[] = [];

  for (const [, group] of groups) {
    // Need at least 2 occurrences to detect a pattern
    if (group.length < 2) continue;

    // Sort by date (oldest first)
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    // Calculate intervals between consecutive transactions
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const medianInterval = median(intervals);
    const frequency = classifyFrequency(medianInterval);
    if (!frequency) continue;

    // Check that intervals are somewhat consistent (std dev < 30% of median)
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > medianInterval * 0.35) continue;

    const amounts = sorted.map(t => Number(t.amount));
    const avgAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const lastDate = sorted[sorted.length - 1].date;
    const nextExpected = addDays(lastDate, frequencyToDays(frequency));

    // Detect price change between last two occurrences
    let priceChange: number | null = null;
    if (amounts.length >= 2) {
      const prev = amounts[amounts.length - 2];
      const last = amounts[amounts.length - 1];
      if (prev > 0 && Math.abs(last - prev) > 0.01) {
        priceChange = Math.round(((last - prev) / prev) * 1000) / 10;
      }
    }

    results.push({
      description: sorted[sorted.length - 1].description, // Use original casing from latest
      category: sorted[sorted.length - 1].category,
      avgAmount,
      frequency,
      occurrences: sorted.length,
      lastDate,
      nextExpected,
      amounts,
      priceChange,
    });
  }

  // Sort by monthly cost (highest first)
  results.sort((a, b) =>
    monthlyEquivalent(b.avgAmount, b.frequency) - monthlyEquivalent(a.avgAmount, a.frequency)
  );

  return results;
}

export default function RecurringExpenses({ transactions }: RecurringExpensesProps) {
  const [expanded, setExpanded] = useState(false);
  const recurring = detectRecurring(transactions);

  if (recurring.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Recurring Expenses</h2>
        <p className="text-sm text-gray-400">
          No recurring expenses detected yet. As you add more transactions over time, patterns will appear here automatically.
        </p>
      </div>
    );
  }

  const totalMonthly = recurring.reduce(
    (s, r) => s + monthlyEquivalent(r.avgAmount, r.frequency),
    0
  );
  const totalYearly = totalMonthly * 12;

  const displayItems = expanded ? recurring : recurring.slice(0, 5);
  const hasMore = recurring.length > 5;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Recurring Expenses</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {recurring.length} subscription{recurring.length !== 1 ? 's' : ''} detected
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-800">&euro;{totalMonthly.toFixed(2)}<span className="text-sm font-normal text-gray-500">/mo</span></p>
          <p className="text-xs text-gray-400">&euro;{totalYearly.toFixed(2)}/year</p>
        </div>
      </div>

      <div className="space-y-3">
        {displayItems.map((item, i) => {
          const monthly = monthlyEquivalent(item.avgAmount, item.frequency);
          const isUpcoming = item.nextExpected >= today &&
            daysBetween(today, item.nextExpected) <= 7;

          return (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                isUpcoming ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.description}
                  </p>
                  {item.priceChange !== null && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                      item.priceChange > 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {item.priceChange > 0 ? '+' : ''}{item.priceChange}%
                    </span>
                  )}
                  {isUpcoming && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
                      Due soon
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  <span>{formatCategory(item.category)}</span>
                  <span>{frequencyLabel(item.frequency)}</span>
                  <span>Next: {new Date(item.nextExpected + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-800">&euro;{item.avgAmount.toFixed(2)}</p>
                {item.frequency !== 'monthly' && (
                  <p className="text-[10px] text-gray-400">&euro;{monthly.toFixed(2)}/mo</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${recurring.length} subscriptions`}
        </button>
      )}

      <p className="text-[10px] text-gray-400 mt-3">
        Detected by analyzing transaction patterns. Charges with similar descriptions appearing at regular intervals are flagged as recurring.
      </p>
    </div>
  );
}
