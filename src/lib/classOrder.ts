/**
 * Sort key so classes list in school order:
 * Nursery < LKG/KG < UKG < Class 1 < Class 2 … < anything unrecognised.
 */
export function getClassSortKey(name: string, gradeLevel: number | null | undefined): number {
  const n = name.trim().toLowerCase();

  if (n === 'nursery' || n === 'pre-nursery' || n === 'pre nursery') return 0;
  if (n === 'lkg' || n === 'kg' || n === 'lower kg' || n === 'lower kindergarten') return 1;
  if (n === 'ukg' || n === 'upper kg' || n === 'upper kindergarten') return 2;

  if (gradeLevel != null) return gradeLevel + 3;

  const match = n.match(/(\d+)/);
  if (match) return parseInt(match[1], 10) + 3;

  return 9999;
}

export function sortByClassOrder<T extends { name: string; grade_level: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ka = getClassSortKey(a.name, a.grade_level);
    const kb = getClassSortKey(b.name, b.grade_level);
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });
}

/** Sections sorted A, B, C … */
export function sortSections<T extends { name: string }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
