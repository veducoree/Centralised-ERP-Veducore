#!/usr/bin/env node
/**
 * Sync school logos from Supabase into bundled alternate app icons.
 *
 *   npm run icons:sync            # fetch + (re)generate
 *   npm run icons:sync -- --force # regenerate every icon even if unchanged
 *
 * For each school with a logo (via the public RPC `list_school_app_icons`):
 *   assets/school-icons/<Name>/foreground.png  512² transparent, logo in the adaptive safe zone
 *   assets/school-icons/<Name>/icon.png        1024² opaque (iOS / legacy launchers)
 *   assets/school-icons/<Name>/thumb.png       192² opaque preview for the in-app picker
 * plus
 *   assets/school-icons/manifest.json          read by app.config.js -> expo-alternate-app-icons
 *   src/lib/schoolIcons.generated.ts           list used by the App Icon screen
 *
 * Icons are compiled into the APK, so run this before every native build
 * (`npm run build:apk` does it for you). If Supabase is unreachable the
 * existing icons are kept so the build never breaks.
 */
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/school-icons');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const TS_OUT = path.join(ROOT, 'src/lib/schoolIcons.generated.ts');
const FORCE = process.argv.includes('--force');
const STRICT = process.argv.includes('--strict');

// ── Supabase connection (same project + anon key the app already ships) ──
function supabaseConfig() {
  const src = readFileSync(path.join(ROOT, 'src/lib/supabase.ts'), 'utf8');
  const url = process.env.SUPABASE_URL || src.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
  const key = process.env.SUPABASE_ANON_KEY || src.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/s)?.[1];
  if (!url || !key) throw new Error('Could not find SUPABASE_URL / SUPABASE_ANON_KEY');
  return { url, key };
}

async function fetchSchools() {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/rpc/list_school_app_icons`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 || body.includes('list_school_app_icons')) {
      throw new Error('RPC list_school_app_icons not found — apply supabase/migrations/*_046_school_app_icons.sql');
    }
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Image helpers ──
// logo_url can be a large base64 data URL, so the manifest keeps only a hash of it.
const logoHash = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16);
const iconName = (id) => `School${id.replace(/-/g, '').slice(0, 12).toLowerCase()}`;

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Trim uniform borders; fall back to the untrimmed image if trim fails. */
async function normalise(buf) {
  const base = sharp(buf, { density: 384 }).ensureAlpha().png();
  try {
    return await sharp(await base.toBuffer()).trim({ threshold: 12 }).png().toBuffer();
  } catch {
    return base.toBuffer();
  }
}

/** Opaque logos get a background matching their corner pixel; transparent ones get white. */
async function pickBackground(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const corners = [px(0, 0), px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)];
  if (corners.some((c) => c[3] < 250)) return '#FFFFFF';
  const [r, g, b] = corners[0];
  const same = corners.every((c) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 30);
  if (!same) return '#FFFFFF';
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Palette-quantised PNG: ~10x smaller, visually identical for logos. */
const small = (img) => img.png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();

async function placed(logo, canvas, box, background) {
  const inner = await sharp(logo)
    .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: canvas, height: canvas, channels: 4, background },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function buildIcon(school, dir) {
  const logo = await normalise(await download(school.logo_url));
  const bg = await pickBackground(logo);
  await fs.mkdir(dir, { recursive: true });
  // Adaptive icon safe zone is the centre 66/108 (61%); stay a little inside it.
  // Android's largest launcher size is 432px, so 512px is plenty for the foreground.
  await fs.writeFile(path.join(dir, 'foreground.png'), await small(sharp(await placed(logo, 512, 290, { r: 0, g: 0, b: 0, alpha: 0 }))));
  await fs.writeFile(path.join(dir, 'icon.png'), await small(sharp(await placed(logo, 1024, 760, bg)).flatten({ background: bg })));
  await fs.writeFile(path.join(dir, 'thumb.png'), await small(sharp(await placed(logo, 192, 132, bg)).flatten({ background: bg })));
  return bg;
}

// ── Main ──
async function main() {
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
  const prevByName = new Map(previous.map((e) => [e.name, e]));

  let schools;
  try {
    schools = await fetchSchools();
  } catch (err) {
    console.warn(`⚠️  School icons: ${err.message}`);
    if (STRICT) process.exit(1);
    console.warn(`   Keeping the ${previous.length} existing icon(s).`);
    await writeTs(previous);
    return;
  }

  const entries = [];
  let built = 0, reused = 0, failed = 0;
  for (const s of schools) {
    const name = iconName(s.id);
    const dir = path.join(OUT_DIR, name);
    const prev = prevByName.get(name);
    const haveFiles = ['foreground.png', 'icon.png', 'thumb.png'].every((f) => existsSync(path.join(dir, f)));
    const entry = { name, schoolId: s.id, schoolName: s.name.trim(), city: s.city || null, logoHash: logoHash(s.logo_url) };

    if (!FORCE && prev && haveFiles && prev.logoHash === entry.logoHash) {
      entries.push({ ...entry, backgroundColor: prev.backgroundColor });
      reused++;
      continue;
    }
    try {
      const backgroundColor = await buildIcon(s, dir);
      entries.push({ ...entry, backgroundColor });
      built++;
      console.log(`  ✓ ${s.name}`);
    } catch (err) {
      failed++;
      if (prev && haveFiles) {
        entries.push(prev); // logo unreachable right now: keep the last good icon
        console.warn(`  ⚠️  ${s.name}: ${err.message} (kept previous icon)`);
      } else {
        console.warn(`  ✗ ${s.name}: ${err.message} (skipped)`);
      }
    }
  }

  // Remove icons for schools that no longer exist / lost their logo.
  const keep = new Set(entries.map((e) => e.name));
  if (existsSync(OUT_DIR)) {
    for (const d of await fs.readdir(OUT_DIR, { withFileTypes: true })) {
      if (d.isDirectory() && !keep.has(d.name)) await fs.rm(path.join(OUT_DIR, d.name), { recursive: true, force: true });
    }
  }

  entries.sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(entries, null, 2) + '\n');
  await writeTs(entries);
  console.log(`School icons: ${entries.length} total (${built} generated, ${reused} unchanged, ${failed} failed).`);
}

async function writeTs(entries) {
  const lines = entries.map(
    (e) =>
      `  { name: ${JSON.stringify(e.name)}, schoolId: ${JSON.stringify(e.schoolId)}, schoolName: ${JSON.stringify(e.schoolName)}, city: ${JSON.stringify(e.city)}, thumb: require('../../assets/school-icons/${e.name}/thumb.png') },`,
  );
  const ts = `// Auto-generated by scripts/sync-school-icons.mjs — do not edit.
/* eslint-disable */
export interface SchoolIcon {
  /** Alternate icon name compiled into the native build. */
  name: string;
  schoolId: string;
  schoolName: string;
  city: string | null;
  thumb: number;
}

export const SCHOOL_ICONS: SchoolIcon[] = [
${lines.join('\n')}
];
`;
  await fs.writeFile(TS_OUT, ts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
