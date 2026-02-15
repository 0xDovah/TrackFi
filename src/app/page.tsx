'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useHousehold } from '@/hooks/useHousehold';
import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets } from '@/hooks/useBudgets';
import type { ExpenseType, PaymentMethod } from '@/lib/types';
import TransactionForm, { getDefaultFormData } from '@/components/TransactionForm';
import type { FormData } from '@/components/TransactionForm';
import Summary from '@/components/Summary';
import TransactionList from '@/components/TransactionList';
import SettingsPanel from '@/components/SettingsPanel';
import SmartImport from '@/components/SmartImport';
import SavingsRate from '@/components/SavingsRate';
import RecurringExpenses from '@/components/RecurringExpenses';
import SpendingCharts from '@/components/SpendingCharts';

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const {
    household,
    members,
    categories,
    invites,
    loading: hhLoading,
    addCategory,
    deleteCategory,
    updateMemberName,
    getMemberByName,
    regenerateInvite,
    revokeInvite,
    sendInvite,
    updateInviteEmail,
  } = useHousehold(user?.id);
  const {
    transactions,
    loading: txnLoading,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactions,
  } = useTransactions(household?.id);
  const {
    budgets,
    setBudget,
    removeBudget,
  } = useBudgets(household?.id);

  const [showSettings, setShowSettings] = useState(false);
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Auth loading ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Loading...</p>
      </div>
    );
  }

  // --- Not authenticated ---
  if (!user) {
    router.push('/login');
    return null;
  }

  // --- Household loading ---
  if (hhLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Loading...</p>
      </div>
    );
  }

  // --- No household ---
  if (!household) {
    router.push('/onboarding');
    return null;
  }

  // --- Available months ---
  const availableMonths = Array.from(
    new Set(transactions.map(t => t.date.slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a));

  // --- Add transaction ---
  const handleAddSubmit = async (data: FormData, newCategory?: string) => {
    if (newCategory) {
      await addCategory(newCategory);
    }

    await addTransaction({
      household_id: household.id,
      date: data.date,
      description: data.description,
      amount: parseFloat(data.amount),
      paid_by: data.paidBy,
      category: newCategory || data.category,
      expense_type: data.expenseType,
      payment_method: data.paymentMethod,
      is_income: data.isIncome,
      notes: data.notes,
      source: 'manual',
    });
  };

  // --- Update transaction ---
  const handleUpdateSubmit = async (id: string, data: FormData, newCategory?: string) => {
    if (newCategory) {
      await addCategory(newCategory);
    }

    await updateTransaction(id, {
      date: data.date,
      description: data.description,
      amount: parseFloat(data.amount),
      paid_by: data.paidBy,
      category: newCategory || data.category,
      expense_type: data.expenseType,
      payment_method: data.paymentMethod,
      is_income: data.isIncome,
      notes: data.notes,
    });
  };

  // --- Delete transaction ---
  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
  };

  // --- Import ---
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const incoming = raw.transactions || raw;
        if (!Array.isArray(incoming)) throw new Error('Invalid format');

        // Map imported transactions to DB format
        const mapped = incoming.map((t: Record<string, unknown>) => {
          // Try to resolve paidBy string name to a member UUID
          const paidByStr = String(t.paidBy || t.paid_by || '');
          const member = getMemberByName(paidByStr);
          const paidByUuid = member?.id ?? members[0]?.id;

          // Auto-discover new categories
          const cat = String(t.category || 'other').toLowerCase().replace(/\s+/g, '_');

          const expenseType = String(t.expenseType || t.expense_type || 'shared').toLowerCase() === 'shared' ? 'shared' as const : 'personal' as const;
          const pmRaw = String(t.paymentMethod || t.payment_method || 'debit_card');
          const validPms = ['cash', 'debit_card', 'credit_card', 'bizum', 'bank_transfer', 'revolut', 'other'] as const;
          const paymentMethod = validPms.includes(pmRaw as PaymentMethod) ? pmRaw as PaymentMethod : 'other' as PaymentMethod;

          return {
            household_id: household.id,
            date: String(t.date || new Date().toISOString().split('T')[0]),
            description: String(t.description || ''),
            amount: typeof t.amount === 'string' ? parseFloat(t.amount) || 0 : Number(t.amount) || 0,
            paid_by: paidByUuid,
            category: cat,
            expense_type: expenseType,
            payment_method: paymentMethod,
            is_income: !!(t.is_income || t.isIncome),
            notes: String(t.notes || ''),
            source: String(t.source || 'json_import'),
          };
        });

        // Discover new categories from import
        const existingCatNames = new Set(categories.map(c => c.name));
        const newCats = new Set<string>();
        for (const t of mapped) {
          if (t.category && !existingCatNames.has(t.category)) {
            newCats.add(t.category);
          }
        }
        for (const cat of newCats) {
          await addCategory(cat);
        }

        const { count, error } = await importTransactions(mapped);
        if (error) {
          setImportMsg({ type: 'error', text: `Import failed: ${error.message}` });
        } else {
          setImportMsg({ type: 'success', text: `Imported ${count} transaction${count !== 1 ? 's' : ''}` });
        }
      } catch {
        setImportMsg({ type: 'error', text: 'Failed to import: invalid JSON format' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Export ---
  const handleExport = () => {
    // Resolve paid_by UUIDs to display names for readability
    const exportData = transactions.map(t => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      paidBy: members.find(m => m.id === t.paid_by)?.display_name ?? 'Unknown',
      category: t.category,
      expenseType: t.expense_type,
      paymentMethod: t.payment_method,
      is_income: t.is_income,
      notes: t.notes,
      source: t.source,
    }));
    const blob = new Blob([JSON.stringify({ transactions: exportData }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackfi-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Smart Import ---
  const handleSmartImport = async (transactions: Array<{
    date: string;
    description: string;
    amount: number;
    category: string;
    expense_type: string;
    payment_method: string;
    is_income: boolean;
    notes: string;
    paid_by: string;
  }>) => {
    const mapped = transactions.map(t => {
      const validPms = ['cash', 'debit_card', 'credit_card', 'bizum', 'bank_transfer', 'revolut', 'other'] as const;
      const pm = validPms.includes(t.payment_method as PaymentMethod) ? t.payment_method as PaymentMethod : 'other' as PaymentMethod;
      const et = t.expense_type === 'shared' ? 'shared' as const : 'personal' as const;

      return {
        household_id: household.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        paid_by: t.paid_by,
        category: t.category,
        expense_type: et,
        payment_method: pm,
        is_income: t.is_income,
        notes: t.notes,
        source: 'ai_import',
      };
    });

    // Auto-discover categories
    const existingCatNames = new Set(categories.map(c => c.name));
    for (const t of mapped) {
      if (t.category && !existingCatNames.has(t.category)) {
        await addCategory(t.category);
        existingCatNames.add(t.category);
      }
    }

    const { count, error } = await importTransactions(mapped);
    if (error) {
      setImportMsg({ type: 'error', text: `Smart import failed: ${error.message}` });
    } else {
      setImportMsg({ type: 'success', text: `Smart imported ${count} transaction${count !== 1 ? 's' : ''}` });
    }
  };

  // --- Sign out ---
  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-1">TrackFi</h1>
          <p className="text-gray-600">Track shared expenses together</p>
        </div>

        {/* Utility bar */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Import JSON
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={() => setShowSmartImport(!showSmartImport)}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md text-sm font-medium hover:from-purple-700 hover:to-blue-700 transition-colors"
          >
            Smart Import
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Settings
          </button>
        </div>

        {/* Import message */}
        {importMsg && (
          <div className={`mb-4 p-3 rounded-md text-sm ${importMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {importMsg.text}
            <button onClick={() => setImportMsg(null)} className="ml-2 font-medium underline">dismiss</button>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && household && (
          <SettingsPanel
            household={household}
            members={members}
            categories={categories}
            invites={invites}
            budgets={budgets}
            currentUserId={user.id}
            onClose={() => setShowSettings(false)}
            onUpdateMemberName={updateMemberName}
            onAddCategory={addCategory}
            onDeleteCategory={deleteCategory}
            onRegenerateInvite={regenerateInvite}
            onRevokeInvite={revokeInvite}
            onUpdateInviteEmail={updateInviteEmail}
            onSendInvite={sendInvite}
            onSetBudget={setBudget}
            onRemoveBudget={removeBudget}
            onSignOut={handleSignOut}
          />
        )}

        {/* Smart Import */}
        {showSmartImport && (
          <SmartImport
            members={members}
            categories={categories}
            onImport={handleSmartImport}
            onClose={() => setShowSmartImport(false)}
          />
        )}

        {/* Add Transaction Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <TransactionForm
            mode="add"
            members={members}
            categories={categories}
            onSubmit={handleAddSubmit}
            onAddCategory={addCategory}
          />
        </div>

        {/* Summary */}
        <Summary
          transactions={transactions}
          members={members}
          budgets={budgets}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          availableMonths={availableMonths}
        />

        {/* Spending Charts */}
        <SpendingCharts transactions={transactions} selectedMonth={selectedMonth} />

        {/* Savings Rate */}
        <SavingsRate transactions={transactions} />

        {/* Recurring Expenses */}
        <RecurringExpenses transactions={transactions} />

        {/* Transaction List */}
        <TransactionList
          transactions={transactions}
          members={members}
          categories={categories}
          selectedMonth={selectedMonth}
          onUpdate={handleUpdateSubmit}
          onDelete={handleDelete}
          onAddCategory={addCategory}
        />

        {/* Loading indicator for transactions */}
        {txnLoading && (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm">Loading transactions...</p>
          </div>
        )}
      </div>
    </div>
  );
}
