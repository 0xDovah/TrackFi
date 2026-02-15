'use client';

import { useState } from 'react';
import type { DbTransaction, DbHouseholdMember, DbCategory, ExpenseType, PaymentMethod } from '@/lib/types';
import { formatCategory, formatPaymentMethod } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import TransactionForm, { getDefaultFormData } from './TransactionForm';
import type { FormData } from './TransactionForm';

type TransactionListProps = {
  transactions: DbTransaction[];
  members: DbHouseholdMember[];
  categories: DbCategory[];
  selectedMonth: string;
  onUpdate: (id: string, data: FormData, newCategory?: string) => void;
  onBulkUpdate: (ids: string[], updates: Record<string, unknown>) => Promise<{ error: unknown }>;
  onDelete: (id: string) => void;
  onAddCategory: (name: string) => void;
};

type BulkField = 'category' | 'paid_by' | 'expense_type' | 'payment_method';

export default function TransactionList({
  transactions,
  members,
  categories,
  selectedMonth,
  onUpdate,
  onBulkUpdate,
  onDelete,
  onAddCategory,
}: TransactionListProps) {
  const [showTransactions, setShowTransactions] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'shared' | 'personal' | 'income'>('all');
  const [filterPartner, setFilterPartner] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<BulkField>('category');
  const [bulkValue, setBulkValue] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getMemberName = (memberId: string) =>
    members.find(m => m.id === memberId)?.display_name ?? 'Unknown';

  const monthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth));

  const filteredTransactions = monthTransactions.filter(t => {
    if (filterType === 'income') return t.is_income;
    if (filterType !== 'all' && (t.expense_type !== filterType || t.is_income)) return false;
    if (filterPartner !== 'all' && t.paid_by !== filterPartner) return false;
    return true;
  });

  const handleEdit = (txn: DbTransaction) => {
    if (editingId === txn.id) {
      setEditingId(null);
      return;
    }
    setEditingId(txn.id);
  };

  const handleEditSubmit = (id: string, data: FormData, newCategory?: string) => {
    onUpdate(id, data, newCategory);
    setEditingId(null);
  };

  const toggleBulkMode = () => {
    if (bulkMode) {
      // Exit bulk mode — clear selection
      setBulkMode(false);
      setSelectedIds(new Set());
      setBulkResult(null);
    } else {
      setBulkMode(true);
      setEditingId(null); // Close any open editor
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const handleBulkApply = async () => {
    if (selectedIds.size === 0 || !bulkValue) return;

    setBulkLoading(true);
    setBulkResult(null);

    const updates: Record<string, unknown> = { [bulkField]: bulkValue };
    const { error } = await onBulkUpdate(Array.from(selectedIds), updates);

    if (error) {
      setBulkResult({ type: 'error', text: `Failed to update ${selectedIds.size} transactions` });
    } else {
      setBulkResult({ type: 'success', text: `Updated ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}` });
      setSelectedIds(new Set());
    }
    setBulkLoading(false);
  };

  // Set a sensible default value when field changes
  const handleBulkFieldChange = (field: BulkField) => {
    setBulkField(field);
    switch (field) {
      case 'category':
        setBulkValue(categories[0]?.name ?? '');
        break;
      case 'paid_by':
        setBulkValue(members[0]?.id ?? '');
        break;
      case 'expense_type':
        setBulkValue('shared');
        break;
      case 'payment_method':
        setBulkValue('debit_card');
        break;
    }
  };

  const partner1 = members[0];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center">
        <button
          onClick={() => setShowTransactions(!showTransactions)}
          className="flex-1 flex justify-between items-center text-left"
        >
          <h2 className="text-2xl font-semibold text-gray-800">
            Transactions
            <span className="text-sm font-normal text-gray-400 ml-2">({filteredTransactions.length})</span>
          </h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 text-gray-500 transition-transform ${showTransactions ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {showTransactions && (
        <>
          <div className="flex flex-wrap gap-2 mt-4 mb-4 items-center">
            {(['all', 'shared', 'personal', 'income'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  filterType === t
                    ? t === 'shared' ? 'bg-blue-600 text-white'
                      : t === 'personal' ? 'bg-purple-600 text-white'
                      : t === 'income' ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <select
              value={filterPartner}
              onChange={(e) => setFilterPartner(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All partners</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button
              onClick={toggleBulkMode}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                bulkMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {bulkMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
            </button>
          </div>

          {/* Bulk edit toolbar */}
          {bulkMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button
                  onClick={selectAll}
                  className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  {selectedIds.size === filteredTransactions.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-gray-500">
                  {selectedIds.size} selected
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-600 font-medium">Set</span>
                <select
                  value={bulkField}
                  onChange={(e) => handleBulkFieldChange(e.target.value as BulkField)}
                  className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="category">Category</option>
                  <option value="paid_by">Paid By</option>
                  <option value="expense_type">Expense Type</option>
                  <option value="payment_method">Payment Method</option>
                </select>
                <span className="text-xs text-gray-600 font-medium">to</span>
                {bulkField === 'category' && (
                  <select
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>{formatCategory(cat.name)}</option>
                    ))}
                  </select>
                )}
                {bulkField === 'paid_by' && (
                  <select
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name}</option>
                    ))}
                  </select>
                )}
                {bulkField === 'expense_type' && (
                  <select
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="shared">Shared</option>
                    <option value="personal">Personal</option>
                  </select>
                )}
                {bulkField === 'payment_method' && (
                  <select
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {PAYMENT_METHODS.map(pm => (
                      <option key={pm.value} value={pm.value}>{pm.label}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleBulkApply}
                  disabled={selectedIds.size === 0 || !bulkValue || bulkLoading}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkLoading ? 'Applying...' : `Apply to ${selectedIds.size}`}
                </button>
              </div>
              {bulkResult && (
                <p className={`text-xs mt-2 ${bulkResult.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {bulkResult.text}
                </p>
              )}
            </div>
          )}

          {filteredTransactions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {monthTransactions.length === 0
                ? 'No transactions this month.'
                : 'No transactions match current filters.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id}>
                  <div
                    className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow ${
                      editingId === transaction.id ? 'ring-2 ring-blue-500 bg-blue-50' :
                      bulkMode && selectedIds.has(transaction.id) ? 'ring-2 ring-blue-400 bg-blue-50' :
                      'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      {/* Checkbox for bulk mode */}
                      {bulkMode && (
                        <div className="flex items-center mr-3 pt-1">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(transaction.id)}
                            onChange={() => toggleSelection(transaction.id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <div
                        className={`flex-1 min-w-0 ${bulkMode ? 'cursor-pointer' : ''}`}
                        onClick={bulkMode ? () => toggleSelection(transaction.id) : undefined}
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-sm text-gray-500">{transaction.date}</span>
                          {transaction.is_income ? (
                            <span className="px-2 py-0.5 text-xs rounded font-medium bg-emerald-100 text-emerald-700">
                              income
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              transaction.expense_type === 'shared'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {transaction.expense_type}
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                            {formatCategory(transaction.category)}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            partner1 && transaction.paid_by === partner1.id
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {getMemberName(transaction.paid_by)}
                          </span>
                          <span className="px-2 py-0.5 text-xs bg-gray-50 text-gray-500 rounded">
                            {formatPaymentMethod(transaction.payment_method)}
                          </span>
                          {transaction.source && transaction.source !== 'manual' && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-50 text-yellow-700 rounded">(imported)</span>
                          )}
                        </div>
                        <p className="text-gray-800 font-medium">{transaction.description}</p>
                        {transaction.notes && (
                          <p className="text-sm text-gray-500 mt-1">{transaction.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        <p className={`text-xl font-bold ${transaction.is_income ? 'text-emerald-600' : 'text-gray-900'}`}>
                          {transaction.is_income ? '+' : ''}&euro;{Number(transaction.amount).toFixed(2)}
                        </p>
                        {!bulkMode && (
                          <>
                            <button
                              onClick={() => handleEdit(transaction)}
                              className={`hover:bg-blue-50 p-2 rounded transition-colors ${
                                editingId === transaction.id ? 'text-blue-700 bg-blue-100' : 'text-blue-600 hover:text-blue-800'
                              }`}
                              title="Edit transaction"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => onDelete(transaction.id)}
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition-colors"
                              title="Delete transaction"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {editingId === transaction.id && !bulkMode && (
                    <div className="bg-white border border-blue-200 rounded-lg shadow-md p-6 mt-2">
                      <TransactionForm
                        mode="edit"
                        initialData={{
                          date: transaction.date,
                          description: transaction.description,
                          amount: Number(transaction.amount).toString(),
                          paidBy: transaction.paid_by,
                          category: transaction.category,
                          expenseType: transaction.expense_type as 'shared' | 'personal',
                          paymentMethod: transaction.payment_method as any,
                          isIncome: transaction.is_income,
                          notes: transaction.notes || '',
                        }}
                        members={members}
                        categories={categories}
                        onSubmit={(data, newCat) => handleEditSubmit(transaction.id, data, newCat)}
                        onCancel={() => setEditingId(null)}
                        onAddCategory={onAddCategory}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
