'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbHousehold, DbHouseholdMember, DbCategory, DbInvite } from '@/lib/types';

export function useHousehold(userId: string | undefined) {
  const [household, setHousehold] = useState<DbHousehold | null>(null);
  const [members, setMembers] = useState<DbHouseholdMember[]>([]);
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [invites, setInvites] = useState<DbInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchAll = useCallback(async () => {
    if (!userId) return; // Stay loading=true until we have a real userId

    // Get membership
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (!membership) {
      setLoading(false);
      return;
    }

    const householdId = membership.household_id;

    // Fetch household, members, categories, invites in parallel
    const [hhRes, membersRes, catsRes, invitesRes] = await Promise.all([
      supabase.from('households').select('*').eq('id', householdId).single(),
      supabase.from('household_members').select('*').eq('household_id', householdId),
      supabase.from('categories').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('invites').select('*').eq('household_id', householdId).order('seat_number'),
    ]);

    if (hhRes.data) setHousehold(hhRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    if (invitesRes.data) setInvites(invitesRes.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Real-time subscription for categories
  useEffect(() => {
    if (!household?.id) return;

    const channel = supabase
      .channel(`categories:${household.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          // Refetch categories on any change
          supabase
            .from('categories')
            .select('*')
            .eq('household_id', household.id)
            .order('sort_order')
            .then(({ data }) => {
              if (data) setCategories(data);
            });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_members',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          // Refetch members on any change (e.g. partner joins, name rename)
          supabase
            .from('household_members')
            .select('*')
            .eq('household_id', household.id)
            .then(({ data }) => {
              if (data) setMembers(data);
            });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invites',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          // Refetch invites on any change
          supabase
            .from('invites')
            .select('*')
            .eq('household_id', household.id)
            .order('seat_number')
            .then(({ data }) => {
              if (data) setInvites(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [household?.id]);

  const addCategory = async (name: string) => {
    if (!household) return;
    const slug = name.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug) return;

    // Optimistic update
    const tempCat: DbCategory = {
      id: crypto.randomUUID(),
      household_id: household.id,
      name: slug,
      sort_order: categories.length,
      created_at: new Date().toISOString(),
    };
    setCategories(prev => [...prev, tempCat]);

    const { error } = await supabase
      .from('categories')
      .insert({ household_id: household.id, name: slug, sort_order: categories.length });

    if (error) {
      // Revert on error
      setCategories(prev => prev.filter(c => c.id !== tempCat.id));
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!household) return;

    const prev = categories;
    setCategories(categories.filter(c => c.id !== categoryId));

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (error) setCategories(prev);
  };

  const updateMemberName = async (memberId: string, newName: string) => {
    const prev = members;
    setMembers(members.map(m => m.id === memberId ? { ...m, display_name: newName } : m));

    const { error } = await supabase
      .from('household_members')
      .update({ display_name: newName })
      .eq('id', memberId);

    if (error) setMembers(prev);
  };

  const getMemberName = (memberId: string): string => {
    return members.find(m => m.id === memberId)?.display_name ?? 'Unknown';
  };

  const getMemberByName = (name: string): DbHouseholdMember | undefined => {
    return members.find(m => m.display_name.toLowerCase() === name.toLowerCase());
  };

  const regenerateInvite = async (inviteId: string) => {
    const { data, error } = await supabase.rpc('regenerate_invite', { invite_id: inviteId });
    if (error) throw error;
    // Optimistic: update local state with new code
    setInvites(prev => prev.map(inv =>
      inv.id === inviteId ? { ...inv, invite_code: data, status: 'pending' as const } : inv
    ));
    return data as string;
  };

  const revokeInvite = async (inviteId: string) => {
    if (!household) return;
    const prev = invites;
    setInvites(invites.map(inv =>
      inv.id === inviteId ? { ...inv, status: 'revoked' as const } : inv
    ));
    const { error } = await supabase
      .from('invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId);
    if (error) setInvites(prev);
  };

  const sendInvite = async (inviteId: string) => {
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send invite');
    return data;
  };

  const updateInviteEmail = async (inviteId: string, email: string) => {
    const { error } = await supabase.rpc('update_invite_email', {
      invite_id: inviteId,
      email_input: email,
    });
    if (error) throw error;
    setInvites(prev => prev.map(inv =>
      inv.id === inviteId ? { ...inv, invited_email: email.trim().toLowerCase() || null } : inv
    ));
  };

  return {
    household,
    members,
    categories,
    invites,
    loading,
    addCategory,
    deleteCategory,
    updateMemberName,
    getMemberName,
    getMemberByName,
    regenerateInvite,
    revokeInvite,
    sendInvite,
    updateInviteEmail,
    refetch: fetchAll,
  };
}
