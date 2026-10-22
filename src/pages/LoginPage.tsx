import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth, getDashboardPath } from '@/auth/AuthContext';
import veducoreLogo from '@/assets/veducore-logo.png';

// ── Math Captcha ──────────────────────────────────────────────────────────────

interface CaptchaState {
  a: number;
  b: number;
  op: '+' | '-' | '×';
  answer: number;
}

function generateCaptcha(): CaptchaState {
  const ops: Array<'+' | '-' | '×'> = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;

  switch (op) {
    case '+':
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
      answer = a + b;
      break;
    case '-':
      a = Math.floor(Math.random() * 20) + 10;
      b = Math.floor(Math.random() * a) + 1;
      answer = a - b;
      break;
    case '×':
      a = Math.floor(Math.random() * 9) + 2;
      b = Math.floor(Math.random() * 9) + 2;
      answer = a * b;
      break;
  }

  return { a, b, op, answer };
}

// ── Login Page ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { signIn, session, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Captcha state
  const [captcha, setCaptcha] = useState<CaptchaState>(generateCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState(false);

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
    setCaptchaError(false);
  }, []);

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
    setCaptchaError(false);

    if (!identifier || !password) {
      setError('Please enter both username and password.');
      return;
    }

    // Verify captcha
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      setCaptchaError(true);
      setCaptchaInput('');
      refreshCaptcha();
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(identifier, password);
    setLoading(false);

    if (signInError) {
      // Refresh captcha on failed login
      refreshCaptcha();
      if (signInError.includes('Invalid login')) {
        setError('Invalid credentials. Please check your username and password.');
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

            {/* Username */}
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                disabled={loading}
              />
            </div>

            {/* Password */}
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

            {/* Math Captcha */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Security Check
              </label>
              <div className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
                captchaError
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 bg-gray-50'
              }`}>
                {/* Math expression */}
                <span className="select-none font-mono text-sm font-semibold text-gray-800 whitespace-nowrap">
                  {captcha.a} {captcha.op} {captcha.b} =
                </span>
                {/* Answer input */}
                <input
                  type="number"
                  value={captchaInput}
                  onChange={(e) => {
                    setCaptchaInput(e.target.value);
                    setCaptchaError(false);
                  }}
                  placeholder="?"
                  className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-center text-sm font-mono font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  disabled={loading}
                  autoComplete="off"
                />
                {/* Refresh captcha */}
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  disabled={loading}
                  className="ml-auto rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:opacity-40"
                  title="Get new question"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              {captchaError && (
                <p className="mt-1 text-xs text-red-500">Incorrect answer. A new question has been generated.</p>
              )}
            </div>

            {/* Remember me / Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/30" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
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

        <p className="mt-4 text-center text-xs text-gray-400">
          Veducore &middot; Secure access for authorized users only
        </p>
      </div>
    </div>
  );
}
