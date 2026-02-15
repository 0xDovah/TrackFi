'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthForm from '@/components/AuthForm';

function SignupContent() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('invite') ?? undefined;

  return <AuthForm mode="signup" inviteCode={inviteCode} />;
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupContent />
    </Suspense>
  );
}
