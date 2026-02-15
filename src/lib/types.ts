export type ExpenseType = 'shared' | 'personal';
export type PaymentMethod = 'cash' | 'debit_card' | 'credit_card' | 'bizum' | 'bank_transfer' | 'revolut' | 'other';

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  paidBy: string;
  category: string;
  expenseType: ExpenseType;
  paymentMethod: PaymentMethod;
  is_income: boolean;
  notes: string;
  source: string;
};

export type Settings = {
  partner1: string;
  partner2: string;
  categories: string[];
};

// Database row types (snake_case, matching Supabase schema)
export type DbTransaction = {
  id: string;
  household_id: string;
  date: string;
  description: string;
  amount: number;
  paid_by: string; // UUID referencing household_members.id
  category: string;
  expense_type: ExpenseType;
  payment_method: PaymentMethod;
  is_income: boolean;
  notes: string;
  source: string;
  created_at: string;
  updated_at: string;
};

export type DbHousehold = {
  id: string;
  name: string;
  max_members: number;
  created_at: string;
};

export type DbInvite = {
  id: string;
  household_id: string;
  seat_number: number;
  invite_code: string;
  invited_email: string | null;
  status: 'pending' | 'used' | 'revoked';
  used_by: string | null;
  used_at: string | null;
  created_at: string;
};

export type DbHouseholdMember = {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  role: 'owner' | 'member';
  created_at: string;
};

export type DbCategory = {
  id: string;
  household_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type DbBudget = {
  id: string;
  household_id: string;
  category: string;
  amount_limit: number;
  created_at: string;
  updated_at: string;
};

export type DbProfile = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
};
