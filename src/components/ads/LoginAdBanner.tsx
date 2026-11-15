import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AdCarousel, { type CarouselAd } from './AdCarousel';
import AdSlot from './AdSlot';

const LOGIN_AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT_LOGIN as string | undefined;
const CACHE_KEY = 'veducore_login_ads';

function readCache(): CarouselAd[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CarouselAd[]) : null;
  } catch {
    return null;
  }
}

function writeCache(ads: CarouselAd[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(ads));
  } catch {
    /* ignore */
  }
}

function track(adId: string, kind: 'impression' | 'click') {
  if (!supabase) return;
  // Fire-and-forget; a failed counter must never affect the page.
  void supabase.rpc('track_ad_event', { p_ad_id: adId, p_kind: kind }).then(() => {}, () => {});
}

/**
 * Login page banner: Veducore's own ads (managed in /superadmin/ads) as a
 * fading carousel. With no live ads it falls back to AdSense, and then to
 * the "Advertise here" card.
 */
export default function LoginAdBanner() {
  const [ads, setAds] = useState<CarouselAd[] | null>(readCache);

  useEffect(() => {
    if (!supabase) {
      setAds([]);
      return;
    }
    let alive = true;
    supabase
      .from('platform_ads')
      .select('id, title, image_url, link_url')
      .eq('placement', 'login')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        const list = error ? [] : ((data ?? []) as CarouselAd[]);
        setAds(list);
        writeCache(list);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onImpression = useCallback((ad: CarouselAd) => track(ad.id, 'impression'), []);
  const onAdClick = useCallback((ad: CarouselAd) => track(ad.id, 'click'), []);

  // Still loading: hold the space so nothing jumps.
  if (ads === null) return <div className="min-h-[90px] w-full" aria-hidden />;

  if (ads.length > 0) {
    return <AdCarousel ads={ads} onImpression={onImpression} onAdClick={onAdClick} />;
  }

  return <AdSlot slot={LOGIN_AD_SLOT} format="horizontal" minHeight={90} />;
}
