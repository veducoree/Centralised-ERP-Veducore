// One printed report card page: the school's background image with values
// placed at millimetre positions. `--mm` sets the scale: "1mm" when printing,
// a pixel size in the designer.
import type { CSSProperties, ReactNode } from 'react';
import { pageSize, type CardValues, type ReportCardTemplate, type TableElement } from './types';

const PT_TO_MM = 0.3528;
/** Rough average glyph width of Arial, in em — used to shrink long values. */
const AVG_CHAR_EM = 0.53;

const mm = (v: number) => `calc(${v} * var(--mm))`;

function fitFont(text: string, widthMm: number, fontPt: number) {
  const fontMm = fontPt * PT_TO_MM;
  const need = text.length * AVG_CHAR_EM * fontMm;
  const scale = need > widthMm && need > 0 ? Math.max(0.55, widthMm / need) : 1;
  return fontPt * scale;
}

function cellText(value: string, widthMm: number, fontPt: number, bold: boolean): CSSProperties {
  return {
    fontSize: mm(fitFont(value, widthMm - 1, fontPt) * PT_TO_MM),
    fontWeight: bold ? 700 : 500,
  };
}

function Table({ el, cells }: { el: TableElement; cells: string[][] | undefined }) {
  if (!cells) return null;
  const out: ReactNode[] = [];
  for (let r = 0; r < el.rows.length; r++) {
    for (let c = 0; c < el.cols.length; c++) {
      const value = cells[r]?.[c];
      if (!value) continue;
      const x = el.x + el.col_edges[c] * el.w;
      const y = el.y + el.row_edges[r] * el.h;
      const w = (el.col_edges[c + 1] - el.col_edges[c]) * el.w;
      const h = (el.row_edges[r + 1] - el.row_edges[r]) * el.h;
      out.push(
        <div key={`${r}-${c}`} className="rc-value" style={{
          position: 'absolute', left: mm(x), top: mm(y), width: mm(w), height: mm(h),
          display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
          ...cellText(value, w, el.font_size, el.bold),
        }}>{value}</div>,
      );
    }
  }
  return <>{out}</>;
}

export function ReportCardSheet({
  template, values, scale = '1mm', showBackground = true, applyOffset = true,
  watermark, photoPlaceholder = false, overlay, className,
}: {
  template: ReportCardTemplate;
  values: CardValues | null;
  /** Size of one millimetre, e.g. "1mm" for print or "2.4px" in the designer. */
  scale?: string;
  showBackground?: boolean;
  applyOffset?: boolean;
  watermark?: string;
  /** Show initials when a student has no photo (screen only). */
  photoPlaceholder?: boolean;
  /** Designer handles, drawn in page coordinates (not shifted by the print offset). */
  overlay?: ReactNode;
  className?: string;
}) {
  const page = pageSize(template.orientation);
  const dx = applyOffset ? template.print_offset_x_mm : 0;
  const dy = applyOffset ? template.print_offset_y_mm : 0;

  return (
    <div
      className={`rc-sheet ${className ?? ''}`}
      style={{
        ['--mm' as string]: scale,
        position: 'relative', width: mm(page.w), height: mm(page.h), overflow: 'hidden',
        background: '#fff', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.1,
      } as CSSProperties}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${mm(dx)}, ${mm(dy)})` }}>
        {showBackground && template.background_url && (
          <img
            src={template.background_url}
            alt=""
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', userSelect: 'none' }}
          />
        )}

        {values && template.elements.map((el) => {
          if (el.kind === 'text') {
            const value = values.text[el.id];
            if (!value) return null;
            return (
              <div key={el.id} className="rc-value" style={{
                position: 'absolute', left: mm(el.x), top: mm(el.y), width: mm(el.w), height: mm(el.h),
                display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
                justifyContent: el.align === 'left' ? 'flex-start' : el.align === 'right' ? 'flex-end' : 'center',
                ...cellText(value, el.w, el.font_size, el.bold),
              }}>{value}</div>
            );
          }
          if (el.kind === 'photo') {
            const box: CSSProperties = { position: 'absolute', left: mm(el.x), top: mm(el.y), width: mm(el.w), height: mm(el.h), overflow: 'hidden' };
            if (values.photo) {
              return <img key={el.id} src={values.photo} alt="" style={{ ...box, objectFit: 'cover' }} />;
            }
            if (!photoPlaceholder) return null;
            return (
              <div key={el.id} style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#94a3b8', fontWeight: 700, fontSize: mm(Math.min(el.w, el.h) * 0.3) }}>
                {values.initials}
              </div>
            );
          }
          return <Table key={el.id} el={el} cells={values.cells[el.id]} />;
        })}
      </div>

      {watermark && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ transform: 'rotate(-35deg)', fontSize: mm(30), fontWeight: 800, letterSpacing: mm(3), color: 'rgba(225, 29, 72, 0.16)', whiteSpace: 'nowrap' }}>
            {watermark}
          </span>
        </div>
      )}

      {overlay}
    </div>
  );
}
