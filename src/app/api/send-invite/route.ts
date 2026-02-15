import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

export async function POST(request: Request) {
  // Verify authentication
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for API key
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email sending is not configured. Set RESEND_API_KEY in environment variables.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const inviteId = body.inviteId;
    if (!inviteId || typeof inviteId !== 'string') {
      return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
    }

    // Fetch the invite
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    // Validate invite state
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is not pending' }, { status: 400 });
    }
    if (!invite.invited_email) {
      return NextResponse.json({ error: 'No email set on this invite' }, { status: 400 });
    }

    // Verify caller is the household owner
    const { data: callerMember } = await supabase
      .from('household_members')
      .select('role')
      .eq('household_id', invite.household_id)
      .eq('user_id', user.id)
      .single();

    if (!callerMember || callerMember.role !== 'owner') {
      return NextResponse.json({ error: 'Only the household owner can send invites' }, { status: 403 });
    }

    // Fetch household name
    const { data: household } = await supabase
      .from('households')
      .select('name')
      .eq('id', invite.household_id)
      .single();

    const householdName = household?.name ?? 'a household';

    // Build signup link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const signupLink = `${baseUrl}/signup?invite=${encodeURIComponent(invite.invite_code)}`;

    // Send email via Resend
    const resend = new Resend(apiKey);
    const { error: emailError } = await resend.emails.send({
      from: 'TrackFi <onboarding@resend.dev>',
      to: invite.invited_email,
      subject: `You've been invited to join ${householdName} on TrackFi`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; font-weight: 700; color: #1e40af; margin: 0;">TrackFi</h1>
            <p style="color: #6b7280; margin-top: 4px;">Track shared expenses together</p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center;">
            <p style="font-size: 16px; color: #374151; margin: 0 0 8px;">You've been invited to join</p>
            <p style="font-size: 20px; font-weight: 600; color: #1e293b; margin: 0 0 24px;">${householdName}</p>

            <a href="${signupLink}" style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: 600; font-size: 16px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
              Join Now
            </a>

            <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
              Or use this invite code manually:
            </p>
            <p style="font-family: monospace; font-size: 18px; font-weight: 700; color: #2563eb; letter-spacing: 2px; margin: 8px 0 0;">
              ${invite.invite_code}
            </p>
          </div>

          <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 24px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send invite error:', error);
    return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 });
  }
}
