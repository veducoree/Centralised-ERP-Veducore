import { useEffect, useRef, useState } from 'react';

export interface CarouselAd {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
}

interface AdCarouselProps {
  ads: CarouselAd[];
  /** Milliseconds each banner stays on screen. */
  interval?: number;
  /** Called once per ad the first time it is actually seen. */
  onImpression?: (ad: CarouselAd) => void;
  onAdClick?: (ad: CarouselAd) => void;
  className?: string;
}

/**
 * Banner carousel: ads slide in from the right, one after another, and each
 * one opens its link in a new tab. No dots or arrows on top of the image. Pauses on hover/focus and while the tab is hidden.
 * Banners use a 5:1 frame (upload 1500×300 for a crisp result).
 */
export default function AdCarousel({ ads, interval = 5000, onImpression, onAdClick, className = '' }: AdCarouselProps) {
  // `pos` runs 0..count; slot `count` is a copy of the first ad so the strip
  // always moves left, then snaps back to 0 without animating.
  const [pos, setPos] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const count = ads.length;
  const active = count ? pos % count : 0;
  const current = count ? ads[active] : null;
  const slides = count > 1 ? [...ads, ads[0]] : ads;

  // Keep the position valid if the list shrinks.
  useEffect(() => {
    if (pos > count) { setAnimate(false); setPos(0); }
  }, [count, pos]);

  // Only count impressions while the banner is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!current || !visible || seen.current.has(current.id)) return;
    seen.current.add(current.id);
    onImpression?.(current);
  }, [current, visible, onImpression]);

  // Auto-advance.
  useEffect(() => {
    if (count < 2 || paused) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setAnimate(true);
      // If the snap-back was missed (reduced motion: no transitionend), continue from slide 1.
      setPos((p) => (p >= count ? 1 : p + 1));
    }, interval);
    return () => window.clearInterval(t);
  }, [count, paused, interval]);

  // Reached the copy of the first ad: jump back to the real one invisibly.
  function onTransitionEnd() {
    if (pos >= count && count > 1) {
      setAnimate(false);
      setPos(0);
    }
  }

  if (!count) return null;

  return (
    <div
      ref={rootRef}
      className={`group relative w-full overflow-hidden rounded-2xl bg-gray-100 shadow-sm ring-1 ring-black/5 aspect-[5/1] ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Sponsored"
    >
      <div
        className={`flex h-full ${animate ? 'transition-transform duration-700 ease-in-out motion-reduce:transition-none' : ''}`}
        style={{ transform: `translateX(-${pos * 100}%)` }}
        onTransitionEnd={onTransitionEnd}
      >
        {slides.map((ad, i) => {
          const isCurrent = i === pos;
          const img = (
            <img
              src={ad.image_url}
              alt={ad.title}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              className="h-full w-full select-none object-cover"
            />
          );
          const common = 'block h-full w-full flex-shrink-0';
          return ad.link_url ? (
            <a
              key={`${ad.id}-${i}`}
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className={common}
              tabIndex={isCurrent ? 0 : -1}
              aria-hidden={!isCurrent}
              onClick={() => onAdClick?.(ad)}
              title={ad.title}
            >
              {img}
            </a>
          ) : (
            <div key={`${ad.id}-${i}`} className={common} aria-hidden={!isCurrent}>
              {img}
            </div>
          );
        })}
      </div>

      {/* "Ad" label */}
      <span className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
        Ad
      </span>

    </div>
  );
}
