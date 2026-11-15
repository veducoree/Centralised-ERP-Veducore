// Landing page for the superadmin "Sign in as this school" link.
// The link carries a one-time hashed token which we verify here, instead of
// relying on Supabase's redirect (that falls back to the project's Site URL,
// e.g. localhost:3000, whenever the target isn't on the redirect allow-list).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CenteredLoader } from '@/components/ui/Skeleton';

export default function ImpersonatePage() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-run would burn the one-time token
    started.current = true;

    const tokenHash = new URLSearchParams(window.location.search).get('token_hash');
    if (!tokenHash) { setError('This sign-in link is incomplete.'); return; }
    if (!supabase) { setError('Sign-in is not configured.'); return; }

    (async () => {
      const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (err) {
        setError(/expired|invalid/i.test(err.message)
          ? 'This sign-in link has expired or was already used. Generate a new one from the superadmin portal.'
          : err.message);
        return;
      }
      // Full reload so auth/profile state boots cleanly for the new account.
      window.location.replace('/admin/dashboard');
    })();
  }, []);

  if (!error) return <CenteredLoader size="lg" fullScreen />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Couldn't sign you in</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{error}</p>
        <Link to="/login" className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Go to login
        </Link>
      </div>
    </div>
  );
}
