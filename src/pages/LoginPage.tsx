import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useAuth, getDashboardPath } from '@/auth/AuthContext';
import veducoreLogo from '@/assets/veducore-logo.png';

export default function LoginPage() {
  const { signIn, session, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && session && profile) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      navigate(from ?? getDashboardPath(profile.role), { replace: true });
    }
  }, [authLoading, session, profile, navigate, location.state]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!identifier || !password) {
      setError('Please enter both email/username and password.');
      return;
    }

    // Validate format: must be an email or a .veducore username
    const isEmail = identifier.includes('@');
    const isVeducore = identifier.toLowerCase().endsWith('.veducore');

    if (!isEmail && !isVeducore) {
      setError('Please enter a valid email or username.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(identifier, password);
    setLoading(false);

    if (signInError) {
      if (signInError.includes('Invalid login')) {
        setError('Invalid credentials. Please check your email/username and password.');
      } else if (signInError.includes('Email not confirmed')) {
        setError('Your account has not been confirmed. Please contact your administrator.');
      } else {
        setError(signInError);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 px-4 py-8">
      <div className="w-full max-w-md">

        {/* Branding */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={veducoreLogo}
            alt="Veducore"
            className="mb-3 h-10 w-auto object-contain"
          />
          <p className="text-sm text-gray-500">Sign in to access your dashboard</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-gray-700">
                Email / Username
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your email or username"
                autoComplete="username"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 pr-11 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/30" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Demo Credentials */}
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <p className="mb-2 text-xs font-semibold text-blue-700">Demo Credentials (click to fill)</p>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setIdentifier('iamaryan721@gmail.com');
                setPassword('aryan3860');
              }}
              className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors border border-blue-100"
            >
              <span className="font-medium text-gray-700">Admin</span>
              <span className="text-gray-400">iamaryan721@gmail.com / aryan3860</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIdentifier('priya@greenwood.veducore');
                setPassword('Teacher@123');
              }}
              className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors border border-blue-100"
            >
              <span className="font-medium text-gray-700">Teacher (Priya Sharma)</span>
              <span className="text-gray-400">priya@greenwood.veducore / Teacher@123</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIdentifier('ADM-2024-001@greenwood.veducore');
                setPassword('aaka2024');
              }}
              className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors border border-blue-100"
            >
              <span className="font-medium text-gray-700">Parent (Ramesh Verma)</span>
              <span className="text-gray-400">ADM-2024-001@greenwood.veducore / aaka2024</span>
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Veducore &middot; Secure access for authorized users only
        </p>
      </div>
    </div>
  );
}
