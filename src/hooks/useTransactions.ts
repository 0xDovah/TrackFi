'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbTransaction } from '@/lib/types';

type TransactionInsert = Omit<DbTransaction, 'id' | 'created_at' | 'updated_at'>;
type TransactionUpdate = Partial<Omit<DbTransaction, 'id' | 'household_id' | 'created_at' | 'updated_at'>>;

export function useTransactions(householdId: string | undefined) {
  const [transactions, setTransactions] = useState<DbTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchTransactions = useCallback(async () => {
    if (!householdId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false });

    if (data) setTransactions(data);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Real-time subscription
  useEffect(() => {
    if (!householdId) return;

    const channel = supabase
      .channel(`transactions:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const newTxn = payload.new as DbTransaction;
          setTransactions(prev => {
            // Avoid duplicates from optimistic updates
            if (prev.some(t => t.id === newTxn.id)) return prev;
            return [newTxn, ...prev].sort((a, b) => b.date.localeCompare(a.date));
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const updated = payload.new as DbTransaction;
          setTransactions(prev =>
            prev.map(t => t.id === updated.id ? updated : t)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'transactions',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setTransactions(prev => prev.filter(t => t.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId]);

  const addTransaction = async (data: TransactionInsert) => {
    const tempId = crypto.randomUUID();
    const optimistic: DbTransaction = {
      ...data,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic: add to state
    setTransactions(prev =>
      [optimistic, ...prev].sort((a, b) => b.date.localeCompare(a.date))
    );

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert(data)
      .select()
      .single();

    if (error) {
      // Revert optimistic update
      setTransactions(prev => prev.filter(t => t.id !== tempId));
      return { error };
    }

    // Replace optimistic with real
    setTransactions(prev =>
      prev.map(t => t.id === tempId ? inserted : t)
    );
    return { error: null };
  };

  const updateTransaction = async (id: string, updates: TransactionUpdate) => {
    const prev = transactions;
    setTransactions(transactions.map(t =>
      t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
    ));

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id);

    if (error) {
      setTransactions(prev);
      return { error };
    }
    return { error: null };
  };

  const deleteTransaction = async (id: string) => {
    const prev = transactions;
    setTransactions(transactions.filter(t => t.id !== id));

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      setTransactions(prev);
      return { error };
    }
    return { error: null };
  };

  const bulkUpdateTransactions = async (ids: string[], updates: TransactionUpdate) => {
    if (ids.length === 0) return { error: null };

    const prev = transactions;
    setTransactions(transactions.map(t =>
      ids.includes(t.id) ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
    ));

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .in('id', ids);

    if (error) {
      setTransactions(prev);
      return { error };
    }
    return { error: null };
  };

  const importTransactions = async (txns: TransactionInsert[]) => {
    if (txns.length === 0) return { count: 0, error: null };

    const { data, error } = await supabase
      .from('transactions')
      .upsert(txns as (TransactionInsert & { id?: string })[], { onConflict: 'id' })
      .select();

    if (error) return { count: 0, error };

    // Refetch to get clean state
    await fetchTransactions();
    return { count: data?.length ?? 0, error: null };
  };

  return {
    transactions,
    loading,
    addTransaction,
    updateTransaction,
    bulkUpdateTransactions,
    deleteTransaction,
    importTransactions,
    refetch: fetchTransactions,
  };
}
