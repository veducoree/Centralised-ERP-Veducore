/**
 * Smart subject code generator for Veducore Mobile App.
 * Automatically derives standard 3-4 letter codes from subject names
 * with unique numeric suffix (e.g. MAT01, ENG01, SCI01).
 */

const SUBJECT_OVERRIDES: Record<string, string> = {
  mathematics: 'MAT',
  maths: 'MAT',
  math: 'MAT',
  algebra: 'ALG',
  geometry: 'GEO',
  english: 'ENG',
  hindi: 'HIN',
  science: 'SCI',
  'social science': 'SSC',
  'social studies': 'SST',
  history: 'HIS',
  geography: 'GEO',
  civics: 'CIV',
  physics: 'PHY',
  chemistry: 'CHE',
  biology: 'BIO',
  computer: 'COM',
  'computer science': 'CS',
  'information technology': 'IT',
  art: 'ART',
  music: 'MUS',
  'physical education': 'PE',
  pe: 'PE',
  evs: 'EVS',
  'environmental science': 'EVS',
  sanskrit: 'SAN',
  urdu: 'URD',
  french: 'FRE',
  german: 'GER',
  spanish: 'SPA',
  economics: 'ECO',
  accountancy: 'ACC',
  accounts: 'ACC',
  commerce: 'COM',
  business: 'BUS',
  'business studies': 'BST',
  psychology: 'PSY',
  philosophy: 'PHI',
  'political science': 'POL',
  robotics: 'ROB',
  ai: 'AI',
  'artificial intelligence': 'AI',
};

export function getBaseSubjectCode(name: string): string {
  const lower = (name || '').trim().toLowerCase();
  if (!lower) return 'SUB';

  const matched = Object.entries(SUBJECT_OVERRIDES)
    .filter(([k]) => lower === k || lower.startsWith(k) || lower.includes(k))
    .sort((a, b) => b[0].length - a[0].length)[0];

  if (matched) return matched[1];

  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const acronym = words.map(w => w[0]).join('').toUpperCase();
    if (acronym.length >= 2 && acronym.length <= 4) {
      return acronym;
    }
  }

  const letters = name.replace(/[^a-zA-Z]/g, '');
  return letters.slice(0, 3).toUpperCase() || 'SUB';
}

export function generateSubjectCode(
  name: string,
  existingCodes: (string | null | undefined)[] = []
): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';

  const base = getBaseSubjectCode(trimmed);
  const normalizedExisting = existingCodes
    .filter(Boolean)
    .map(c => String(c).trim().toUpperCase());

  let n = 1;
  let code = `${base}${String(n).padStart(2, '0')}`;
  while (normalizedExisting.includes(code.toUpperCase())) {
    n++;
    code = `${base}${String(n).padStart(2, '0')}`;
  }
  return code;
}
