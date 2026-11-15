import { useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';

/**
 * Google AdSense slot.
 *
 * Configure with env vars (Vercel → Settings → Environment Variables):
 *   VITE_ADSENSE_CLIENT      = ca-pub-XXXXXXXXXXXXXXXX
 *   VITE_ADSENSE_SLOT_LOGIN  = 1234567890   (an ad unit id from AdSense)
 *   VITE_ADVERTISE_CONTACT   = ads@yourdomain.com  (optional, for the house card)
 *
 * The AdSense script is injected lazily (after the page is idle) so it never
 * slows down the page it sits on. If the env vars are missing, a quiet
 * "Advertise with us" house card is shown instead of an empty hole.
 */

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const SCRIPT_ID = 'adsbygoogle-js';
/** Email (or full URL) advertisers should contact — VITE_ADVERTISE_CONTACT. */
const ADVERTISE_CONTACT = import.meta.env.VITE_ADVERTISE_CONTACT as string | undefined;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

function loadAdSenseScript(client: string): void {
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement('script');
  s.id = SCRIPT_ID;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

function whenIdle(cb: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 2500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1200);
  return () => window.clearTimeout(id);
}

interface AdSlotProps {
  slot: string | undefined;
  /** 'auto' = responsive; 'rectangle' / 'vertical' hint the shape to AdSense. */
  format?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  className?: string;
  /** Minimum height reserved so the layout doesn't jump when the ad loads. */
  minHeight?: number;
}

export default function AdSlot({ slot, format = 'auto', className = '', minHeight = 250 }: AdSlotProps) {
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  const [unfilled, setUnfilled] = useState(false);
  const enabled = Boolean(ADSENSE_CLIENT && slot);

  useEffect(() => {
    if (!enabled || pushed.current) return;
    return whenIdle(() => {
      loadAdSenseScript(ADSENSE_CLIENT!);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        setUnfilled(true);
      }
    });
  }, [enabled]);

  // AdSense marks the <ins> with data-ad-status="unfilled" when it has no ad.
  useEffect(() => {
    const el = insRef.current;
    if (!enabled || !el) return;
    const obs = new MutationObserver(() => {
      if (el.getAttribute('data-ad-status') === 'unfilled') setUnfilled(true);
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-ad-status'] });
    return () => obs.disconnect();
  }, [enabled]);

  if (!enabled || unfilled) {
    return <HouseAd className={className} minHeight={minHeight} />;
  }

  return (
    <div className={`w-full ${className}`}>
      <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-wider text-gray-400">
        Advertisement
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle block w-full"
        style={{ display: 'block', minHeight }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}

function HouseAd({ className, minHeight }: { className: string; minHeight: number }) {
  const href = !ADVERTISE_CONTACT
    ? undefined
    : ADVERTISE_CONTACT.includes('@') && !ADVERTISE_CONTACT.startsWith('http')
      ? `mailto:${ADVERTISE_CONTACT}?subject=${encodeURIComponent('Advertise on Veducore')}`
      : ADVERTISE_CONTACT;

  return (
    <a
      href={href}
      target={ADVERTISE_CONTACT?.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={`group flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white/60 px-5 py-4 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40 ${className}`}
      style={{ minHeight }}
    >
      <span className="flex items-center justify-center gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-transform group-hover:scale-105">
          <Megaphone className="h-[18px] w-[18px]" />
        </span>
        <span className="text-sm font-semibold text-gray-800">Advertise here</span>
      </span>
      <span className="text-xs leading-relaxed text-gray-500">Your chance to get featured here</span>
      {ADVERTISE_CONTACT && (
        <span className="text-xs font-medium text-blue-600 group-hover:underline">Contact us →</span>
      )}
    </a>
  );
}
