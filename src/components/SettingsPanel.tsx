'use client';

import { useState } from 'react';
import type { DbHouseholdMember, DbCategory, DbHousehold, DbInvite } from '@/lib/types';
import { formatCategory } from '@/lib/utils';

type SettingsPanelProps = {
  household: DbHousehold;
  members: DbHouseholdMember[];
  categories: DbCategory[];
  invites: DbInvite[];
  currentUserId: string;
  onClose: () => void;
  onUpdateMemberName: (memberId: string, newName: string) => void;
  onAddCategory: (name: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onRegenerateInvite: (inviteId: string) => Promise<string>;
  onRevokeInvite: (inviteId: string) => void;
  onUpdateInviteEmail: (inviteId: string, email: string) => Promise<void>;
  onSendInvite: (inviteId: string) => Promise<void>;
  onSignOut: () => void;
};

export default function SettingsPanel({
  household,
  members,
  categories,
  invites,
  currentUserId,
  onClose,
  onUpdateMemberName,
  onAddCategory,
  onDeleteCategory,
  onRegenerateInvite,
  onRevokeInvite,
  onUpdateInviteEmail,
  onSendInvite,
  onSignOut,
}: SettingsPanelProps) {
  const [memberNames, setMemberNames] = useState<Record<string, string>>(
    Object.fromEntries(members.map(m => [m.id, m.display_name]))
  );
  const [newCat, setNewCat] = useState('');
  const [editingEmail, setEditingEmail] = useState<Record<string, string>>({});
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<Record<string, 'sent' | 'error'>>({});

  const isOwner = members.some(m => m.user_id === currentUserId && m.role === 'owner');

  const handleRename = () => {
    for (const m of members) {
      const newName = memberNames[m.id]?.trim();
      if (newName && newName !== m.display_name) {
        onUpdateMemberName(m.id, newName);
      }
    }
  };

  const handleAddCategory = () => {
    if (newCat.trim()) {
      onAddCategory(newCat);
      setNewCat('');
    }
  };

  const handleCopy = (inviteId: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(inviteId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async (inviteId: string) => {
    setInviteActionLoading(inviteId);
    try {
      await onRegenerateInvite(inviteId);
    } catch { /* handled upstream */ }
    setInviteActionLoading(null);
  };

  const handleRevoke = async (inviteId: string) => {
    setInviteActionLoading(inviteId);
    onRevokeInvite(inviteId);
    setInviteActionLoading(null);
  };

  const handleSaveEmail = async (inviteId: string) => {
    const email = editingEmail[inviteId] ?? '';
    setInviteActionLoading(inviteId);
    try {
      await onUpdateInviteEmail(inviteId, email);
      setEditingEmail(prev => {
        const next = { ...prev };
        delete next[inviteId];
        return next;
      });
    } catch { /* handled upstream */ }
    setInviteActionLoading(null);
  };

  const handleSendInvite = async (inviteId: string) => {
    setInviteActionLoading(inviteId);
    try {
      await onSendInvite(inviteId);
      setSentInvites(prev => ({ ...prev, [inviteId]: 'sent' }));
    } catch {
      setSentInvites(prev => ({ ...prev, [inviteId]: 'error' }));
    }
    setInviteActionLoading(null);
  };

  const statusBadge = (status: DbInvite['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      used: 'bg-green-100 text-green-800',
      revoked: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Find the member who used an invite
  const getUsedByName = (invite: DbInvite) => {
    if (!invite.used_by) return null;
    const member = members.find(m => m.user_id === invite.used_by);
    return member?.display_name ?? 'Unknown';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-800">Settings</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
      </div>

      {/* Household Info */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Household</h3>
        <p className="text-sm text-gray-600 mb-1">{household.name}</p>
        <p className="text-xs text-gray-400">
          {members.length} / {household.max_members} seats filled
        </p>
      </div>

      {/* Invite Management (owner only) */}
      {isOwner && invites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Invite Codes</h3>
          <div className="space-y-3">
            {invites.map(invite => (
              <div key={invite.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">Seat {invite.seat_number}</span>
                  {statusBadge(invite.status)}
                </div>

                {invite.status === 'pending' && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-sm font-mono bg-gray-50 px-2 py-1 rounded select-all flex-1">
                        {invite.invite_code}
                      </code>
                      <button
                        onClick={() => handleCopy(invite.id, invite.invite_code)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        {copiedId === invite.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {/* Email field */}
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="email"
                        value={editingEmail[invite.id] ?? invite.invited_email ?? ''}
                        onChange={(e) => setEditingEmail({ ...editingEmail, [invite.id]: e.target.value })}
                        placeholder="Optional: restrict to email"
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {editingEmail[invite.id] !== undefined && (
                        <button
                          onClick={() => handleSaveEmail(invite.id)}
                          disabled={inviteActionLoading === invite.id}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors disabled:opacity-50"
                        >
                          Save
                        </button>
                      )}
                    </div>
                    {invite.invited_email && (
                      <p className="text-xs text-gray-400 mb-2">Restricted to: {invite.invited_email}</p>
                    )}
                    {/* Actions */}
                    <div className="flex gap-2">
                      {invite.invited_email && (
                        <button
                          onClick={() => handleSendInvite(invite.id)}
                          disabled={inviteActionLoading === invite.id}
                          className={`px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                            sentInvites[invite.id] === 'sent'
                              ? 'bg-green-100 text-green-700'
                              : sentInvites[invite.id] === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {inviteActionLoading === invite.id
                            ? 'Sending...'
                            : sentInvites[invite.id] === 'sent'
                            ? 'Sent!'
                            : sentInvites[invite.id] === 'error'
                            ? 'Failed - Retry'
                            : 'Send Invite'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRegenerate(invite.id)}
                        disabled={inviteActionLoading === invite.id}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={() => handleRevoke(invite.id)}
                        disabled={inviteActionLoading === invite.id}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </>
                )}

                {invite.status === 'used' && (
                  <p className="text-sm text-gray-500">
                    Joined by <span className="font-medium">{getUsedByName(invite)}</span>
                  </p>
                )}

                {invite.status === 'revoked' && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-400 flex-1">This invite has been revoked.</p>
                    <button
                      onClick={() => handleRegenerate(invite.id)}
                      disabled={inviteActionLoading === invite.id}
                      className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-owner: show invites as read-only */}
      {!isOwner && invites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Household Seats</h3>
          <div className="space-y-2">
            {invites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Seat {invite.seat_number}</span>
                {statusBadge(invite.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member names */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Member Names</h3>
        <div className="flex gap-2 items-end flex-wrap">
          {members.map((m, i) => (
            <div key={m.id}>
              <label className="block text-xs text-gray-500 mb-1">
                {m.role === 'owner' ? 'Owner' : `Member ${i + 1}`}
              </label>
              <input
                value={memberNames[m.id] || ''}
                onChange={(e) => setMemberNames({ ...memberNames, [m.id]: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <button
            onClick={handleRename}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>

      {/* Category management */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Categories</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {categories.map(cat => (
            <span key={cat.id} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">
              {formatCategory(cat.name)}
              <button onClick={() => onDeleteCategory(cat.id)} className="text-gray-400 hover:text-red-500">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category name"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
          />
          <button
            onClick={handleAddCategory}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Sign Out */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={onSignOut}
          className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
