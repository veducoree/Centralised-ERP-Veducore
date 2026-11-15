// Fixed 5:1 banner frame: drag the photo to position it, zoom to fit.
// The frame never changes shape — only what's inside it moves.
// `exportBanner()` renders exactly what's visible to a 1500×300 image.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

export const BANNER_W = 1500;
export const BANNER_H = 300;
const RATIO = BANNER_W / BANNER_H;
const MAX_ZOOM = 4;

export interface BannerCropperHandle {
  /** Renders the visible area to a 1500×300 JPEG. */
  exportBanner: () => Promise<Blob>;
}

interface Props {
  src: string;
  /** Called once the image is ready, or if it fails to load. */
  onReady?: (info: { width: number; height: number } | null) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const BannerCropper = forwardRef<BannerCropperHandle, Props>(function BannerCropper({ src, onReady }, ref) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Pan as fractions (0 = left/top edge, 0.5 = centred, 1 = right/bottom edge).
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Load the image (CORS so already-uploaded banners can be re-cropped).
  useEffect(() => {
    setImg(null);
    setZoom(1);
    setPan({ x: 0.5, y: 0.5 });
    const el = new Image();
    const remote = !src.startsWith('blob:') && !src.startsWith('data:');
    if (remote) el.crossOrigin = 'anonymous';
    el.onload = () => { setImg(el); onReadyRef.current?.({ width: el.naturalWidth, height: el.naturalHeight }); };
    el.onerror = () => onReadyRef.current?.(null);
    // Cache-buster: a copy cached without CORS (from the list thumbnail) would taint the canvas.
    el.src = remote ? `${src}${src.includes('?') ? '&' : '?'}crop=1` : src;
  }, [src]);

  // Track frame width.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFrameW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameH = frameW / RATIO;

  /** Displayed image size and top-left offset for the current zoom/pan. */
  const layout = useCallback((fw: number, z: number, p: { x: number; y: number }) => {
    if (!img || !fw) return null;
    const fh = fw / RATIO;
    const cover = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    const dw = img.naturalWidth * cover * z;
    const dh = img.naturalHeight * cover * z;
    return { dw, dh, x: -(dw - fw) * p.x, y: -(dh - fh) * p.y, fh };
  }, [img]);

  const L = layout(frameW, zoom, pan);

  // ── Drag ──
  function onPointerDown(e: React.PointerEvent) {
    if (!L) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: L.x, oy: L.y };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !L) return;
    const nx = clamp(d.ox + (e.clientX - d.startX), frameW - L.dw, 0);
    const ny = clamp(d.oy + (e.clientY - d.startY), L.fh - L.dh, 0);
    setPan({
      x: L.dw > frameW ? -nx / (L.dw - frameW) : 0.5,
      y: L.dh > L.fh ? -ny / (L.dh - L.fh) : 0.5,
    });
  }
  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  // ── Zoom (pan fractions keep the view roughly centred) ──
  const setZoomClamped = useCallback((z: number) => setZoom(clamp(z, 1, MAX_ZOOM)), []);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, MAX_ZOOM));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Arrow keys nudge the photo.
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const map: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = map[e.key];
    if (m) { e.preventDefault(); setPan((p) => ({ x: clamp(p.x + m[0], 0, 1), y: clamp(p.y + m[1], 0, 1) })); }
    if (e.key === '+' || e.key === '=') setZoomClamped(zoom * 1.1);
    if (e.key === '-') setZoomClamped(zoom / 1.1);
  }

  useImperativeHandle(ref, () => ({
    exportBanner: () => new Promise<Blob>((resolve, reject) => {
      const l = layout(frameW, zoom, pan);
      if (!img || !l) { reject(new Error('Image not ready')); return; }
      const sx = (-l.x / l.dw) * img.naturalWidth;
      const sy = (-l.y / l.dh) * img.naturalHeight;
      const sw = (frameW / l.dw) * img.naturalWidth;
      const sh = (l.fh / l.dh) * img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = BANNER_W;
      canvas.height = BANNER_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background
      ctx.fillRect(0, 0, BANNER_W, BANNER_H);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, BANNER_W, BANNER_H);
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/jpeg', 0.9);
      } catch {
        reject(new Error('This image cannot be re-cropped. Upload it again.'));
      }
    }),
  }), [img, frameW, zoom, pan, layout]);

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`relative w-full touch-none select-none overflow-hidden rounded-2xl bg-slate-900 outline-none ring-indigo-400 focus-visible:ring-2 ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ aspectRatio: `${RATIO}` }}
        aria-label="Banner position. Drag or use arrow keys to move, plus and minus to zoom."
      >
        {img && L ? (
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{ width: L.dw, height: L.dh, transform: `translate(${L.x}px, ${L.y}px)` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Loading image…</div>
        )}

        {/* rule-of-thirds guides while dragging */}
        {dragging && frameH > 0 && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/25" />)}
          </div>
        )}

        {!dragging && img && (
          <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            <Move className="h-3 w-3" /> Drag to position
          </span>
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setZoomClamped(zoom / 1.15)} disabled={zoom <= 1}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomClamped(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-indigo-600"
          aria-label="Zoom"
        />
        <button type="button" onClick={() => setZoomClamped(zoom * 1.15)} disabled={zoom >= MAX_ZOOM}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <span className="w-10 text-right text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0.5, y: 0.5 }); }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100" title="Reset">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>
    </div>
  );
});

export default BannerCropper;
