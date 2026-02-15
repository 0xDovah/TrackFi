'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbBudget } from '@/lib/types';

export function useBudgets(householdId: string | undefined) {
  const [budgets, setBudgets] = useState<DbBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchBudgets = useCallback(async () => {
    if (!householdId) { setLoading(false); return; }

    const { data } = await supabase
      .from('budgets')
      .select('*')
      .eq('household_id', householdId)
      .order('category');

    if (data) setBudgets(data);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // Real-time subscription
  useEffect(() => {
    if (!householdId) return;

    const channel = supabase
      .channel(`budgets:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          // Refetch on any change
          supabase
            .from('budgets')
            .select('*')
            .eq('household_id', householdId)
            .order('category')
            .then(({ data }) => {
              if (data) setBudgets(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId]);

  const setBudget = async (category: string, amountLimit: number) => {
    if (!householdId) return;

    const existing = budgets.find(b => b.category === category);

    if (existing) {
      // Update
      const prev = budgets;
      setBudgets(budgets.map(b =>
        b.id === existing.id ? { ...b, amount_limit: amountLimit, updated_at: new Date().toISOString() } : b
      ));

      const { error } = await supabase
        .from('budgets')
        .update({ amount_limit: amountLimit })
        .eq('id', existing.id);

      if (error) setBudgets(prev);
    } else {
      // Insert
      const tempId = crypto.randomUUID();
      const optimistic: DbBudget = {
        id: tempId,
        household_id: householdId,
        category,
        amount_limit: amountLimit,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setBudgets(prev => [...prev, optimistic].sort((a, b) => a.category.localeCompare(b.category)));

      const { data, error } = await supabase
        .from('budgets')
        .insert({ household_id: householdId, category, amount_limit: amountLimit })
        .select()
        .single();

      if (error) {
        setBudgets(prev => prev.filter(b => b.id !== tempId));
      } else if (data) {
        setBudgets(prev => prev.map(b => b.id === tempId ? data : b));
      }
    }
  };

  const removeBudget = async (budgetId: string) => {
    const prev = budgets;
    setBudgets(budgets.filter(b => b.id !== budgetId));

    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', budgetId);

    if (error) setBudgets(prev);
  };

  return {
    budgets,
    loading,
    setBudget,
    removeBudget,
  };
}
