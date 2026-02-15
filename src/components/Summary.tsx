'use client';

import type { DbTransaction, DbHouseholdMember, DbBudget } from '@/lib/types';
import { formatCategory } from '@/lib/utils';

type SummaryProps = {
  transactions: DbTransaction[];
  members: DbHouseholdMember[];
  budgets: DbBudget[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  availableMonths: string[];
};

export default function Summary({
  transactions,
  members,
  budgets,
  selectedMonth,
  onMonthChange,
  availableMonths,
}: SummaryProps) {
  const monthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth));

  const incomeTransactions = monthTransactions.filter(t => t.is_income);
  const expenseTransactions = monthTransactions.filter(t => !t.is_income);
  const sharedTransactions = expenseTransactions.filter(t => t.expense_type === 'shared');
  const personalTransactions = expenseTransactions.filter(t => t.expense_type === 'personal');

  const partner1 = members[0];
  const partner2 = members[1];

  const partner1SharedTotal = partner1
    ? sharedTransactions.filter(t => t.paid_by === partner1.id).reduce((s, t) => s + Number(t.amount), 0)
    : 0;
  const partner2SharedTotal = partner2
    ? sharedTransactions.filter(t => t.paid_by === partner2.id).reduce((s, t) => s + Number(t.amount), 0)
    : 0;
  const sharedTotal = partner1SharedTotal + partner2SharedTotal;
  const personalTotal = personalTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const totalSpending = sharedTotal + personalTotal;
  const totalIncome = incomeTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const netBalance = totalIncome - totalSpending;
  const balanceOwed = partner1SharedTotal - partner2SharedTotal;

  const partnerPersonalCategories = (memberId: string) => {
    const map = new Map<string, number>();
    for (const t of personalTransactions.filter(t => t.paid_by === memberId)) {
      map.set(t.category, (map.get(t.category) || 0) + Number(t.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  };

  const partner1Personal = partner1
    ? personalTransactions.filter(t => t.paid_by === partner1.id).reduce((s, t) => s + Number(t.amount), 0)
    : 0;
  const partner2Personal = partner2
    ? personalTransactions.filter(t => t.paid_by === partner2.id).reduce((s, t) => s + Number(t.amount), 0)
    : 0;
  const partner1Categories = partner1 ? partnerPersonalCategories(partner1.id) : [];
  const partner2Categories = partner2 ? partnerPersonalCategories(partner2.id) : [];

  const allMonths = availableMonths.includes(selectedMonth)
    ? availableMonths
    : [selectedMonth, ...availableMonths];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="text-2xl font-semibold text-gray-800">Summary</h2>
        <select
          value={selectedMonth}
          onChange={(e) => onMonthChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {allMonths.map(m => (
            <option key={m} value={m}>
              {new Date(m + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
            </option>
          ))}
        </select>
      </div>

      {/* Top-level totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-lg text-center">
          <p className="text-sm text-gray-500 mb-1">Total Spending</p>
          <p className="text-3xl font-bold text-gray-800">&euro;{totalSpending.toFixed(2)}</p>
        </div>
        <div className="bg-emerald-50 p-5 rounded-lg text-center">
          <p className="text-sm text-gray-500 mb-1">Total Income</p>
          <p className="text-3xl font-bold text-emerald-700">&euro;{totalIncome.toFixed(2)}</p>
        </div>
        <div className={`p-5 rounded-lg text-center ${netBalance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="text-sm text-gray-500 mb-1">Net Balance</p>
          <p className={`text-3xl font-bold ${netBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {netBalance >= 0 ? '+' : '-'}&euro;{Math.abs(netBalance).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Shared Expenses */}
      <div className="bg-green-50 p-4 rounded-lg mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Shared Expenses</h3>
        <p className="text-xl font-bold text-green-700 mb-2">&euro;{sharedTotal.toFixed(2)}</p>
        {sharedTransactions.length > 0 && partner1 && partner2 && (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
              <span>{partner1.display_name} paid: <span className="font-medium text-blue-600">&euro;{partner1SharedTotal.toFixed(2)}</span></span>
              <span>{partner2.display_name} paid: <span className="font-medium text-purple-600">&euro;{partner2SharedTotal.toFixed(2)}</span></span>
            </div>
            <div className="text-sm text-gray-700">
              {balanceOwed > 0 ? (
                <span>{partner2.display_name} owes {partner1.display_name} <span className="font-bold text-blue-600">&euro;{balanceOwed.toFixed(2)}</span></span>
              ) : balanceOwed < 0 ? (
                <span>{partner1.display_name} owes {partner2.display_name} <span className="font-bold text-purple-600">&euro;{Math.abs(balanceOwed).toFixed(2)}</span></span>
              ) : (
                <span className="font-bold text-green-600">Settled!</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Personal Expenses */}
      {partner1 && partner2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{partner1.display_name} &mdash; Personal</h3>
            <p className="text-xl font-bold text-blue-600 mb-2">&euro;{partner1Personal.toFixed(2)}</p>
            {partner1Categories.length > 0 ? (
              <ul className="text-sm text-gray-600 space-y-1">
                {partner1Categories.map(([cat, amt]) => (
                  <li key={cat} className="flex justify-between">
                    <span>{formatCategory(cat)}</span>
                    <span className="font-medium">&euro;{amt.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No personal expenses</p>
            )}
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{partner2.display_name} &mdash; Personal</h3>
            <p className="text-xl font-bold text-purple-600 mb-2">&euro;{partner2Personal.toFixed(2)}</p>
            {partner2Categories.length > 0 ? (
              <ul className="text-sm text-gray-600 space-y-1">
                {partner2Categories.map(([cat, amt]) => (
                  <li key={cat} className="flex justify-between">
                    <span>{formatCategory(cat)}</span>
                    <span className="font-medium">&euro;{amt.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No personal expenses</p>
            )}
          </div>
        </div>
      )}

      {/* Budget Progress */}
      {budgets.length > 0 && (() => {
        // Calculate spending per category for this month (expenses only)
        const spendingByCategory = new Map<string, number>();
        for (const t of expenseTransactions) {
          spendingByCategory.set(t.category, (spendingByCategory.get(t.category) || 0) + Number(t.amount));
        }

        return (
          <div className="mt-4 bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Budget Progress</h3>
            <div className="space-y-3">
              {budgets.map(budget => {
                const spent = spendingByCategory.get(budget.category) || 0;
                const limit = Number(budget.amount_limit);
                const pct = limit > 0 ? (spent / limit) * 100 : 0;
                const clamped = Math.min(pct, 100);

                // Color: green < 75%, yellow 75-100%, red > 100%
                const barColor = pct > 100
                  ? 'bg-red-500'
                  : pct >= 75
                  ? 'bg-yellow-500'
                  : 'bg-green-500';
                const textColor = pct > 100
                  ? 'text-red-600'
                  : pct >= 75
                  ? 'text-yellow-600'
                  : 'text-green-600';

                return (
                  <div key={budget.id}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600">{formatCategory(budget.category)}</span>
                      <span className={`text-sm font-medium ${textColor}`}>
                        &euro;{spent.toFixed(2)} / &euro;{limit.toFixed(2)}
                        {pct > 100 && (
                          <span className="ml-1 text-xs text-red-500 font-semibold">
                            ({Math.round(pct - 100)}% over)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${clamped}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
