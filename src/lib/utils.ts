import { PAYMENT_METHODS } from './constants';
import type { Transaction, Settings, ExpenseType } from './types';

export function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatPaymentMethod(pm: string): string {
  const found = PAYMENT_METHODS.find(m => m.value === pm);
  return found ? found.label : pm;
}

export function normalizeTransaction(t: Transaction, s: Settings): Transaction {
  const paidByLower = String(t.paidBy).toLowerCase();
  return {
    ...t,
    amount: typeof t.amount === 'string' ? parseFloat(t.amount as unknown as string) || 0 : t.amount,
    expenseType: (String(t.expenseType).toLowerCase() === 'shared' ? 'shared' : 'personal') as ExpenseType,
    paidBy: paidByLower === s.partner1.toLowerCase() ? s.partner1
          : paidByLower === s.partner2.toLowerCase() ? s.partner2
          : t.paidBy,
    is_income: !!t.is_income,
  };
}
