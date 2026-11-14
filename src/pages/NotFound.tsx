// 404 page shown for any URL that doesn't match a route.
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

const HOME: Record<string, string> = {
  admin: '/admin/dashboard',
  teacher: '/teacher/dashboard',
  parent: '/parent/dashboard',
};

const styles = `
@keyframes nf-float { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-14px) rotate(4deg) } }
@keyframes nf-shadow { 0%,100% { transform: scaleX(1); opacity: .35 } 50% { transform: scaleX(.7); opacity: .18 } }
@keyframes nf-orbit { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes nf-needle { 0%,100% { transform: rotate(-35deg) } 30% { transform: rotate(50deg) } 55% { transform: rotate(-20deg) } 75% { transform: rotate(25deg) } }
@keyframes nf-twinkle { 0%,100% { opacity: .2; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.15) } }
@keyframes nf-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.nf-float  { animation: nf-float 4s ease-in-out infinite }
.nf-shadow { animation: nf-shadow 4s ease-in-out infinite; transform-origin: center }
.nf-orbit  { animation: nf-orbit 9s linear infinite; transform-origin: 100px 100px }
.nf-needle { animation: nf-needle 3.2s ease-in-out infinite; transform-origin: 100px 100px }
.nf-twinkle { animation: nf-twinkle 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
.nf-rise   { animation: nf-rise .6s ease-out both }
@media (prefers-reduced-motion: reduce) {
  .nf-float, .nf-shadow, .nf-orbit, .nf-needle, .nf-twinkle, .nf-rise { animation: none }
}
`;

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const home = pathname.startsWith('/superadmin')
    ? '/superadmin'
    : (profile?.role && HOME[profile.role]) || '/login';
  const homeLabel = home === '/login' ? 'Go to login' : 'Go to dashboard';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white px-4 py-12">
      <style>{styles}</style>

      {/* soft background blobs */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-md text-center">
        {/* Animated lost-compass illustration */}
        <svg viewBox="0 0 200 220" className="mx-auto h-52 w-52 sm:h-60 sm:w-60" role="img" aria-label="A spinning compass that has lost its way">
          <defs>
            <linearGradient id="nf-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7B8CF7" />
              <stop offset="100%" stopColor="#3B4DC8" />
            </linearGradient>
          </defs>

          {/* twinkling stars */}
          <circle className="nf-twinkle" cx="28" cy="40" r="3" fill="#A5B0F8" />
          <circle className="nf-twinkle" style={{ animationDelay: '.8s' }} cx="176" cy="30" r="2.5" fill="#7B8CF7" />
          <circle className="nf-twinkle" style={{ animationDelay: '1.6s' }} cx="182" cy="150" r="3" fill="#C7CDFB" />
          <circle className="nf-twinkle" style={{ animationDelay: '1.2s' }} cx="16" cy="140" r="2" fill="#7B8CF7" />

          <g className="nf-float">
            {/* orbiting dots */}
            <g className="nf-orbit">
              <circle cx="100" cy="18" r="5" fill="#5B6EE8" />
              <circle cx="182" cy="100" r="3.5" fill="#A5B0F8" />
              <circle cx="38" cy="160" r="4" fill="#7B8CF7" />
            </g>

            {/* compass body */}
            <circle cx="100" cy="100" r="62" fill="white" stroke="url(#nf-ring)" strokeWidth="10" />
            <circle cx="100" cy="100" r="48" fill="#EEF0FD" />
            {[0, 90, 180, 270].map((a) => (
              <rect key={a} x="98" y="56" width="4" height="10" rx="2" fill="#A5B0F8" transform={`rotate(${a} 100 100)`} />
            ))}

            {/* wobbling needle */}
            <g className="nf-needle">
              <path d="M100 62 L109 100 L100 100 Z" fill="#EF4444" />
              <path d="M100 62 L91 100 L100 100 Z" fill="#F87171" />
              <path d="M100 138 L109 100 L100 100 Z" fill="#94A3B8" />
              <path d="M100 138 L91 100 L100 100 Z" fill="#CBD5E1" />
            </g>
            <circle cx="100" cy="100" r="6" fill="#27347F" />
          </g>

          {/* ground shadow */}
          <ellipse className="nf-shadow" cx="100" cy="206" rx="46" ry="6" fill="#27347F" />
        </svg>

        <p className="nf-rise mt-2 bg-gradient-to-r from-brand-500 to-brand-800 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent sm:text-8xl">
          404
        </p>
        <h1 className="nf-rise mt-2 text-2xl font-bold text-slate-800" style={{ animationDelay: '.1s' }}>
          Page not found
        </h1>
        <p className="nf-rise mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-500" style={{ animationDelay: '.2s' }}>
          Our compass couldn't find this page. It may have moved, or the link may be wrong.
        </p>
        <code className="nf-rise mx-auto mt-4 inline-block max-w-full truncate rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600" style={{ animationDelay: '.25s' }}>
          {pathname}
        </code>

        <div className="nf-rise mt-8 flex flex-col justify-center gap-3 sm:flex-row" style={{ animationDelay: '.3s' }}>
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(home))}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Go back
          </button>
          <Link
            to={home}
            replace
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition hover:bg-brand-600"
          >
            <Home className="h-4 w-4" /> {homeLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
