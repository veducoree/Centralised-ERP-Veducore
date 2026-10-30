import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth, getDashboardPath } from '@/auth/AuthContext';
import { CenteredLoader } from '@/components/ui/Skeleton';
import veducoreLogo from '@/assets/veducore-logo.png';

// ── Image Captcha Helper ──────────────────────────────────────────────────────

// Unambiguous characters (avoiding 0/O, 1/I/l)
const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRandomCaptcha(length = 5): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length));
  }
  return result;
}

function renderCaptchaToCanvas(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#f1f5f9');
  bgGrad.addColorStop(0.5, '#e2e8f0');
  bgGrad.addColorStop(1, '#f8fafc');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Background noise: random decorative lines
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 100 + 80)}, ${Math.floor(Math.random() * 100 + 80)}, ${Math.floor(Math.random() * 100 + 120)}, 0.45)`;
    ctx.lineWidth = Math.random() * 1.5 + 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.bezierCurveTo(
      Math.random() * width, Math.random() * height,
      Math.random() * width, Math.random() * height,
      Math.random() * width, Math.random() * height
    );
    ctx.stroke();
  }

  // Background noise: dots
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = `rgba(${Math.floor(Math.random() * 120)}, ${Math.floor(Math.random() * 120)}, ${Math.floor(Math.random() * 120)}, 0.35)`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw characters
  const charCount = text.length;
  const slotWidth = (width - 24) / charCount;

  const fontFamilies = ['Courier New', 'Georgia', 'Arial', 'Verdana', 'Trebuchet MS'];
  const colors = [
    '#0f172a', // slate-900
    '#1e3a8a', // blue-900
    '#065f46', // emerald-800
    '#7c2d12', // orange-900
    '#581c87', // purple-900
    '#164e63', // cyan-900
    '#312e81', // indigo-900
  ];

  for (let i = 0; i < charCount; i++) {
    const char = text[i];
    const fontSize = Math.floor(Math.random() * 4) + 21; // 21-25px
    const font = fontFamilies[Math.floor(Math.random() * fontFamilies.length)];
    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];

    const x = 14 + i * slotWidth + (Math.random() * 3 - 1.5);
    const y = height / 2 + (Math.random() * 6 - 2) + 6;
    const angle = (Math.random() * 0.4 - 0.2); // -11 to +11 deg

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }

  // Strikethrough wavy line across text
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, height * 0.55 + Math.random() * 6 - 3);
  ctx.bezierCurveTo(
    width * 0.3, height * 0.35,
    width * 0.7, height * 0.75,
    width - 8, height * 0.45 + Math.random() * 6 - 3
  );
  ctx.stroke();
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

  // Image Captcha state
  const [captchaCode, setCaptchaCode] = useState(() => generateRandomCaptcha(5));
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redraw canvas whenever captchaCode changes or authLoading finishes
  useEffect(() => {
    if (!authLoading && canvasRef.current) {
      renderCaptchaToCanvas(canvasRef.current, captchaCode);
    }
  }, [captchaCode, authLoading]);

  // Callback ref ensures the captcha renders immediately the instant <canvas> mounts in the DOM
  const handleCanvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      if (node) {
        renderCaptchaToCanvas(node, captchaCode);
      }
    },
    [captchaCode]
  );

  const refreshCaptcha = useCallback(() => {
    const newCode = generateRandomCaptcha(5);
    setCaptchaCode(newCode);
    setCaptchaInput('');
    if (canvasRef.current) {
      renderCaptchaToCanvas(canvasRef.current, newCode);
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && session && profile) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      navigate(from ?? getDashboardPath(profile.role), { replace: true });
    }
  }, [authLoading, session, profile, navigate, location.state]);

  if (authLoading) {
    return <CenteredLoader size="lg" fullScreen />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setCaptchaError('');

    if (!identifier || !password) {
      setError('Please enter both username and password.');
      return;
    }

    // Verify image captcha (case-insensitive check)
    if (!captchaInput.trim() || captchaInput.trim().toUpperCase() !== captchaCode.toUpperCase()) {
      setCaptchaError('Wrong captcha code. A new image has been loaded.');
      setCaptchaInput('');
      refreshCaptcha();
      // Notice: identifier & password are NOT cleared so user doesn't have to re-type them!
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(identifier, password);
    setLoading(false);

    if (signInError) {
      // Refresh captcha on failed login, but preserve username & password
      refreshCaptcha();
      setCaptchaInput('');
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
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your username or email"
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

            {/* Image Captcha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Security Code (CAPTCHA)
                </label>
                <span className="text-[11px] text-gray-400">Click image or icon to refresh</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Canvas Captcha Image */}
                <div
                  className="relative flex items-center justify-center overflow-hidden rounded-lg border border-gray-300 bg-gray-100 shadow-2xs select-none cursor-pointer group"
                  onClick={refreshCaptcha}
                  title="Click image to reload captcha"
                >
                  <canvas
                    ref={handleCanvasRef}
                    width={130}
                    height={40}
                    className="block group-hover:opacity-90 transition-opacity"
                  />
                </div>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  disabled={loading}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-2xs hover:bg-gray-50 hover:text-blue-600 transition-colors disabled:opacity-40"
                  title="Refresh Captcha Image"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>

                {/* Captcha Input */}
                <input
                  type="text"
                  value={captchaInput}
                  onChange={(e) => {
                    setCaptchaInput(e.target.value);
                    if (captchaError) setCaptchaError('');
                  }}
                  placeholder="Enter code"
                  maxLength={6}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-mono tracking-widest text-gray-900 placeholder-gray-400 uppercase transition-colors focus:outline-none focus:ring-2 ${
                    captchaError
                      ? 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-gray-300 bg-white focus:border-blue-500 focus:ring-blue-500/30'
                  }`}
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {captchaError && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 animate-in fade-in">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {captchaError}
                </p>
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
