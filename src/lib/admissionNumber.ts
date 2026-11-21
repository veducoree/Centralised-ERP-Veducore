/** Adds the school prefix to a bare number (e.g. "45" → "STUD45"); leaves anything else as typed. */
export function withAdmissionPrefix(prefix: string, raw: string) {
  const v = raw.trim();
  if (!prefix || !v) return v;
  if (v.toUpperCase().startsWith(prefix.toUpperCase())) return v;
  return /^\d+$/.test(v) ? prefix + v : v;
}
