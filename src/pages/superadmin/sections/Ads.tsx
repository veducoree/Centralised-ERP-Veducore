// Superadmin → Ads: banner ads shown as a fading carousel on the login page.
// Writes go straight to `platform_ads` / storage bucket `ads` under RLS
// (is_veducore_manager()), using the portal's own Supabase session.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ExternalLink, Eye, ImagePlus, MousePointerClick, Move, Pause, Pencil, Play, Plus, Trash2, UploadCloud,
} from 'lucide-react';
import AdCarousel from '@/components/ads/AdCarousel';
import BannerCropper, { BANNER_W, type BannerCropperHandle } from './BannerCropper';
import { errMsg, fmtDateTime, mgmtSupabase, timeAgo, type Me } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, LoadingBlock, Modal, cx, inputCls, toast, type BadgeTone } from '../ui';

interface Ad {
  id: string;
  title: string;
  image_url: string;
  image_path: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  impressions: number;
  clicks: number;
  created_at: string;
}

type AdStatus = 'live' | 'scheduled' | 'ended' | 'paused';
const STATUS: Record<AdStatus, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  ended: { label: 'Ended', tone: 'gray' },
  paused: { label: 'Paused', tone: 'amber' },
};

function statusOf(a: Ad): AdStatus {
  if (!a.is_active) return 'paused';
  const now = Date.now();
  if (a.starts_at && new Date(a.starts_at).getTime() > now) return 'scheduled';
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return 'ended';
  return 'live';
}

const BUCKET = 'ads';
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function db() {
  if (!mgmtSupabase) throw new Error('Supabase is not configured');
  return mgmtSupabase;
}

async function uploadBanner(file: File): Promise<{ url: string; path: string }> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `login/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { url: db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path };
}

function removeBanner(path: string | null) {
  if (!path) return;
  void db().storage.from(BUCKET).remove([path]).then(() => {}, () => {});
}

/** Accepts "example.com" and turns it into "https://example.com". */
function normaliseLink(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
  return `https://${t}`;
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmtNum = (n: number) => Number(n || 0).toLocaleString('en-IN');
const ctr = (a: Ad) => (a.impressions ? `${((a.clicks / a.impressions) * 100).toFixed(1)}%` : '—');

// ─────────────────────────────────────────────────────────────────────────────

export default function AdsSection({ me }: { me: Me }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Ad | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManage = me.role !== 'support';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await db()
        .from('platform_ads')
        .select('*')
        .eq('placement', 'login')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (e) throw new Error(e.message);
      setAds((data ?? []) as Ad[]);
    } catch (e) {
      setError(/platform_ads/.test(errMsg(e))
        ? 'The ads table is missing. Run `supabase db push` to apply migration 045.'
        : errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const liveAds = useMemo(() => ads.filter((a) => statusOf(a) === 'live'), [ads]);
  const totals = useMemo(() => ads.reduce(
    (t, a) => ({ views: t.views + Number(a.impressions || 0), clicks: t.clicks + Number(a.clicks || 0) }),
    { views: 0, clicks: 0 },
  ), [ads]);

  async function patch(a: Ad, values: Partial<Ad>, msg: string) {
    setBusyId(a.id);
    try {
      const { error: e } = await db().from('platform_ads').update(values).eq('id', a.id);
      if (e) throw new Error(e.message);
      toast(msg);
      await load();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: Ad) {
    if (!window.confirm(`Delete the ad "${a.title}"? This can't be undone.`)) return;
    setBusyId(a.id);
    try {
      const { error: e } = await db().from('platform_ads').delete().eq('id', a.id);
      if (e) throw new Error(e.message);
      removeBanner(a.image_path);
      toast('Ad deleted');
      await load();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const a = ads[i];
    const b = ads[i + dir];
    if (!a || !b) return;
    setBusyId(a.id);
    try {
      // Re-number the whole list so equal sort_order values can't get stuck.
      const next = [...ads];
      next[i] = b;
      next[i + dir] = a;
      setAds(next);
      const results = await Promise.all(
        next.map((ad, idx) => (ad.sort_order === idx ? null : db().from('platform_ads').update({ sort_order: idx }).eq('id', ad.id))),
      );
      const failed = results.find((r) => r?.error);
      if (failed?.error) throw new Error(failed.error.message);
      await load();
    } catch (e) {
      toast(errMsg(e), 'error');
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Banner ads appear at the bottom of the login page. Live ads slide in from the right every 5 seconds,
          and clicking a banner opens its link in a new tab.
        </p>
        {canManage && <Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>New ad</Button>}
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Live preview + totals */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Login page preview"
          subtitle={liveAds.length ? `${liveAds.length} live ad${liveAds.length > 1 ? 's' : ''} rotating` : 'No live ads. The login page shows the "Advertise here" card.'}
        >
          {liveAds.length ? (
            <AdCarousel ads={liveAds} />
          ) : (
            <div className="flex aspect-[5/1] w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
              Add an ad to see it here
            </div>
          )}
        </Card>
        <Card title="Performance" subtitle="All-time, all ads">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Metric label="Views" value={fmtNum(totals.views)} />
            <Metric label="Clicks" value={fmtNum(totals.clicks)} />
            <Metric label="CTR" value={totals.views ? `${((totals.clicks / totals.views) * 100).toFixed(1)}%` : '—'} />
          </div>
        </Card>
      </div>

      {/* List */}
      {loading && !ads.length ? <LoadingBlock /> : ads.length === 0 ? (
        !error && (
          <Card>
            <EmptyState
              icon={<ImagePlus className="h-5 w-5" />}
              title="No ads yet"
              text="Upload any photo, drag it to fit the banner, add the advertiser's link and it goes live on the login page."
              action={canManage ? <Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>Create first ad</Button> : undefined}
            />
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {ads.map((a, i) => {
            const st = statusOf(a);
            const busy = busyId === a.id;
            return (
              <div key={a.id} className={cx('flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center', busy && 'opacity-60')}>
                <img src={a.image_url} alt={a.title} className="aspect-[5/1] w-full flex-shrink-0 rounded-xl object-cover ring-1 ring-slate-100 sm:w-60" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold text-slate-900">{a.title}</h3>
                    <Badge tone={STATUS[st].tone} dot={st === 'live'}>{STATUS[st].label}</Badge>
                  </div>
                  {a.link_url ? (
                    <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-indigo-600 hover:underline">
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{a.link_url}</span>
                    </a>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-400">No link (not clickable)</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {fmtNum(a.impressions)} views</span>
                    <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" /> {fmtNum(a.clicks)} clicks</span>
                    <span>CTR {ctr(a)}</span>
                    <span className="text-slate-400">
                      {a.starts_at || a.ends_at
                        ? `${a.starts_at ? fmtDateTime(a.starts_at) : 'Now'} → ${a.ends_at ? fmtDateTime(a.ends_at) : 'no end'}`
                        : `Added ${timeAgo(a.created_at)}`}
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex flex-shrink-0 items-center gap-1 self-end sm:self-center">
                    <Button size="sm" variant="ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="h-3.5 w-3.5" />} aria-label="Move up" title="Show earlier" />
                    <Button size="sm" variant="ghost" disabled={busy || i === ads.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="h-3.5 w-3.5" />} aria-label="Move down" title="Show later" />
                    <Button size="sm" variant="secondary" disabled={busy}
                      onClick={() => patch(a, { is_active: !a.is_active }, a.is_active ? 'Ad paused' : 'Ad is live again')}
                      icon={a.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}>
                      {a.is_active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(a)} icon={<Pencil className="h-3.5 w-3.5" />}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(a)} icon={<Trash2 className="h-3.5 w-3.5 text-rose-500" />} aria-label="Delete" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <AdEditor
          ad={editing === 'new' ? null : editing}
          nextOrder={ads.length ? Math.max(...ads.map((a) => a.sort_order)) + 1 : 0}
          meId={me.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-2 py-3">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

// ── Create / edit ────────────────────────────────────────────────────────────

function AdEditor({ ad, nextOrder, meId, onClose, onSaved }: {
  ad: Ad | null; nextOrder: number; meId: string; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(ad?.title ?? '');
  const [link, setLink] = useState(ad?.link_url ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(ad?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(ad?.ends_at ?? null));
  const [active, setActive] = useState(ad?.is_active ?? true);
  const [file, setFile] = useState<File | null>(null);
  /** Image loaded into the drag/zoom frame (new upload, or the current banner when re-adjusting). */
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [imgInfo, setImgInfo] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cropperRef = useRef<BannerCropperHandle | null>(null);
  const isGif = file?.type === 'image/gif';

  // Free blob URLs.
  useEffect(() => () => { if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc); }, [cropSrc]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { toast('Use a PNG, JPG, WebP or GIF image', 'error'); return; }
    if (f.size > MAX_BYTES) { toast('Image must be under 5 MB', 'error'); return; }
    setFile(f);
    setImgInfo('');
    setCropSrc(URL.createObjectURL(f));
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  }

  const onCropReady = useCallback((info: { width: number; height: number } | null) => {
    if (!info) { setImgInfo('Could not load this image.'); return; }
    setImgInfo(
      `${info.width}×${info.height}px` +
      (info.width < BANNER_W * 0.6 ? ' · low resolution, the banner may look blurry' : ''),
    );
  }, []);

  const linkValue = normaliseLink(link);
  const datesInvalid = !!(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));
  const hasImage = !!(cropSrc || ad?.image_url);
  const canSave = title.trim() && hasImage && !datesInvalid;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let uploaded: { url: string; path: string } | null = null;
    try {
      if (isGif && file) {
        // Animated GIFs are uploaded as-is (cropping would freeze them).
        uploaded = await uploadBanner(file);
      } else if (cropSrc && cropperRef.current) {
        const blob = await cropperRef.current.exportBanner();
        uploaded = await uploadBanner(new File([blob], 'banner.jpg', { type: 'image/jpeg' }));
      }
      const values = {
        title: title.trim(),
        link_url: linkValue,
        is_active: active,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        ...(uploaded ? { image_url: uploaded.url, image_path: uploaded.path } : {}),
      };
      if (ad) {
        const { error } = await db().from('platform_ads').update(values).eq('id', ad.id);
        if (error) throw new Error(error.message);
        if (uploaded) removeBanner(ad.image_path);
        toast('Ad updated');
      } else {
        const { error } = await db().from('platform_ads').insert({
          ...values, placement: 'login', sort_order: nextOrder, created_by: meId,
        });
        if (error) throw new Error(error.message);
        toast(active ? 'Ad is live on the login page' : 'Ad saved (paused)');
      }
      onSaved();
    } catch (e) {
      if (uploaded) removeBanner(uploaded.path);
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={ad ? 'Edit ad' : 'New ad'} subtitle="Shown at the bottom of the login page" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={saving} disabled={!canSave}>{ad ? 'Save changes' : active ? 'Publish ad' : 'Save as paused'}</Button>
      </>}>
      <div className="space-y-4">
        {/* Banner: fixed 5:1 frame, drag to position, zoom to fit */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Banner image <span className="text-rose-500">*</span></span>
            {hasImage && (
              <div className="flex items-center gap-1">
                {!cropSrc && ad && (
                  <Button size="sm" variant="ghost" onClick={() => setCropSrc(ad.image_url)} icon={<Move className="h-3.5 w-3.5" />}>Adjust</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()} icon={<UploadCloud className="h-3.5 w-3.5" />}>Replace</Button>
              </div>
            )}
          </div>

          {cropSrc && !isGif ? (
            <BannerCropper ref={cropperRef} src={cropSrc} onReady={onCropReady} />
          ) : hasImage ? (
            <div className="relative aspect-[5/1] w-full overflow-hidden rounded-2xl bg-slate-100">
              <img src={cropSrc ?? ad?.image_url} alt="" className="h-full w-full object-cover" />
              {isGif && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white">
                  GIF uploads as-is (centred). Use a 1500×300 GIF for the best fit.
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
              className={cx(
                'flex aspect-[5/1] w-full items-center justify-center rounded-2xl border-2 border-dashed transition-colors',
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40',
              )}
            >
              <span className="flex flex-col items-center gap-1 text-slate-500">
                <UploadCloud className="h-6 w-6 text-indigo-500" />
                <span className="text-sm font-semibold">Click or drop a photo here</span>
                <span className="text-xs text-slate-400">Any size works. You'll drag it to fit the banner · max 5 MB</span>
              </span>
            </button>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT.join(',')} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {imgInfo && <p className={cx('mt-1 text-xs', /blurry|Could not/.test(imgInfo) ? 'text-amber-600' : 'text-slate-400')}>{imgInfo} · saved as 1500×300</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ad name" required hint="Shown to screen readers and in this list">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sharma Coaching – Admissions open" maxLength={120} />
          </Field>
          <Field label="Click-through link" hint={linkValue && linkValue !== link.trim() ? `Will open ${linkValue}` : 'Opens in a new tab. Leave empty for no link'}>
            <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://advertiser.com" inputMode="url" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label="Start showing" hint="Optional, starts immediately if empty">
            <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Stop showing" hint="Optional, runs until paused" error={datesInvalid ? 'Must be after the start time' : undefined}>
            <input type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-slate-800">Active</span>
            <span className="block text-xs text-slate-500">Paused ads stay saved but aren't shown</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((v) => !v)}
            className={cx('relative h-6 w-11 flex-shrink-0 rounded-full transition-colors', active ? 'bg-indigo-600' : 'bg-slate-300')}
          >
            <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', active ? 'left-[22px]' : 'left-0.5')} />
          </button>
        </label>
      </div>
    </Modal>
  );
}
