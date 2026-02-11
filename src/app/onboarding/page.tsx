'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_CATEGORIES } from '@/lib/constants';
import type { DbInvite } from '@/lib/types';

type Mode = 'choose' | 'create' | 'join';

export default function OnboardingPage() {
  const [mode, setMode] = useState<Mode>('choose');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [seatCount, setSeatCount] = useState(2);
  const [inviteCode, setInviteCode] = useState('');
  const [createdInvites, setCreatedInvites] = useState<DbInvite[]>([]);
  const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const name = displayName.trim();
    const hhName = householdName.trim() || 'Our Household';
    if (!name) { setError('Display name is required'); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); setLoading(false); return; }

    // Create household with seats via RPC
    const { data, error: rpcError } = await supabase.rpc('create_household_with_seats', {
      household_name: hhName,
      owner_display_name: name,
      seat_count: seatCount,
    });

    if (rpcError) {
      const msg = rpcError.message;
      if (msg.includes('already belong')) {
        setError('You already belong to a household.');
      } else {
        setError(msg);
      }
      setLoading(false);
      return;
    }

    const householdId = data.household_id;
    setCreatedHouseholdId(householdId);

    // Seed default categories
    const categoryRows = DEFAULT_CATEGORIES.map((cat, i) => ({
      household_id: householdId,
      name: cat,
      sort_order: i,
    }));
    await supabase.from('categories').insert(categoryRows);

    // Fetch the created invites (seats 2..N)
    if (seatCount > 1) {
      const { data: invitesData } = await supabase
        .from('invites')
        .select('*')
        .eq('household_id', householdId)
        .order('seat_number');
      if (invitesData) setCreatedInvites(invitesData);
    }

    setLoading(false);
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const name = displayName.trim();
    const code = inviteCode.trim().toLowerCase();
    if (!name) { setError('Display name is required'); setLoading(false); return; }
    if (!code) { setError('Invite code is required'); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); setLoading(false); return; }

    const { error: joinError } = await supabase
      .rpc('join_household_by_invite', {
        invite_code_input: code,
        display_name_input: name,
      });

    if (joinError) {
      const msg = joinError.message;
      if (msg.includes('Invalid or expired invite code')) {
        setError('Invalid or expired invite code. Please check and try again.');
      } else if (msg.includes('already belong')) {
        setError('You already belong to a household.');
      } else if (msg.includes('reserved for a different email')) {
        setError('This invite is reserved for a different email address.');
      } else {
        setError(msg);
      }
      setLoading(false);
      return;
    }

    router.push('/');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Show invite codes after creating household
  if (createdHouseholdId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Household Created!</h1>
          {createdInvites.length > 0 ? (
            <>
              <p className="text-gray-500 mb-6">
                Share these invite codes with your members. Each code can only be used once.
              </p>
              <div className="space-y-3 mb-6">
                {createdInvites.map(invite => (
                  <div key={invite.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                    <div className="text-left">
                      <span className="text-xs text-gray-400 block">Seat {invite.seat_number}</span>
                      <span className="text-lg font-mono font-bold text-blue-600 tracking-wider select-all">
                        {invite.invite_code}
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(invite.invite_code)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Each member needs to sign up and enter their code to join. You can manage invites in Settings later.
              </p>
            </>
          ) : (
            <p className="text-gray-500 mb-6">
              Your household is set up for just you. You can add seats later in Settings.
            </p>
          )}
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Go to App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">TrackFi</h1>
        <p className="text-gray-500 text-center mb-6">Set up your household</p>

        {error && (
          <div className="mb-4 p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
            {error}
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Create a New Household
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full bg-white text-blue-600 py-3 px-4 rounded-md border-2 border-blue-600 hover:bg-blue-50 transition-colors font-medium"
            >
              Join with Invite Code
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreateHousehold} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Miguel"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Household Name (optional)</label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="Our Household"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Seats (including you)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={seatCount}
                  onChange={(e) => setSeatCount(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-lg font-bold text-blue-600 w-8 text-center">{seatCount}</span>
              </div>
              <div className="flex justify-between mt-1">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i + 1}
                    type="button"
                    onClick={() => setSeatCount(i + 1)}
                    className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                      i + 1 <= seatCount
                        ? i === 0
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Seat 1 is you. {seatCount > 1 ? `${seatCount - 1} invite code${seatCount > 2 ? 's' : ''} will be generated.` : 'No invites needed.'}
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Household'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('choose'); setError(''); }}
              className="w-full text-gray-500 text-sm hover:underline"
            >
              Back
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoinHousehold} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Ana"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invite Code</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter the code you received"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Household'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('choose'); setError(''); }}
              className="w-full text-gray-500 text-sm hover:underline"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
