'use client';

import { useState } from 'react';
import type { ExpenseType, PaymentMethod, DbHouseholdMember, DbCategory } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import { formatCategory } from '@/lib/utils';

type FormData = {
  date: string;
  description: string;
  amount: string;
  paidBy: string; // member ID
  category: string;
  expenseType: ExpenseType;
  paymentMethod: PaymentMethod;
  isIncome: boolean;
  notes: string;
};

type TransactionFormProps = {
  mode: 'add' | 'edit';
  initialData?: FormData;
  members: DbHouseholdMember[];
  categories: DbCategory[];
  onSubmit: (data: FormData, newCategory?: string) => void;
  onCancel?: () => void;
  onAddCategory: (name: string) => void;
};

function getDefaultFormData(members: DbHouseholdMember[], categories: DbCategory[]): FormData {
  return {
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    paidBy: members[0]?.id ?? '',
    category: categories[0]?.name ?? 'other',
    expenseType: 'shared',
    paymentMethod: 'debit_card',
    isIncome: false,
    notes: '',
  };
}

export { getDefaultFormData };
export type { FormData };

export default function TransactionForm({
  mode,
  initialData,
  members,
  categories,
  onSubmit,
  onCancel,
  onAddCategory,
}: TransactionFormProps) {
  const defaultData = getDefaultFormData(members, categories);
  const [formData, setFormData] = useState<FormData>(initialData ?? defaultData);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const isEdit = mode === 'edit';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let newCat: string | undefined;
    if (showNewCategory && newCategoryInput.trim()) {
      newCat = newCategoryInput.trim().toLowerCase().replace(/\s+/g, '_');
      setShowNewCategory(false);
      setNewCategoryInput('');
    }
    onSubmit(formData, newCat);

    if (!isEdit) {
      setFormData(defaultData);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">
        {isEdit ? 'Edit Transaction' : 'Add Transaction'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Transaction direction toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isIncome: false })}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                !formData.isIncome
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isIncome: true })}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                formData.isIncome
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Income
            </button>
          </div>
        </div>

        {/* Expense type toggle */}
        {!formData.isIncome && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expense Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, expenseType: 'shared' })}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  formData.expenseType === 'shared'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Shared
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, expenseType: 'personal' })}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  formData.expenseType === 'personal'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Personal
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            {showNewCategory ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  placeholder="New category"
                  maxLength={50}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button type="button" onClick={() => setShowNewCategory(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <select
                value={formData.category}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowNewCategory(true);
                  } else {
                    setFormData({ ...formData, category: e.target.value });
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{formatCategory(cat.name)}</option>
                ))}
                <option value="__new__">+ Add new...</option>
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="e.g., Dinner at restaurant"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            maxLength={500}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (&euro;)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="99999999"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid By</label>
            <select
              value={formData.paidBy}
              onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAYMENT_METHODS.map(pm => (
                <option key={pm.value} value={pm.value}>{pm.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Any additional details..."
            rows={2}
            maxLength={1000}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {isEdit ? 'Update Transaction' : 'Add Transaction'}
          </button>
          {isEdit && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </>
  );
}
