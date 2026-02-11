import type { PaymentMethod } from './types';

export const DEFAULT_CATEGORIES = [
  'takeout', 'restaurants', 'coffee', 'transport', 'rent', 'groceries',
  'clothing', 'beauty', 'gifts', 'subscriptions', 'entertainment',
  'electronics', 'home_goods', 'utilities', 'other',
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'other', label: 'Other' },
];
