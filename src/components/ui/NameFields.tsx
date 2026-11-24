import { Input } from '@/components/ui/Form';
import type { NameParts } from '@/lib/parentUtils';

/** Letters, spaces, dot, apostrophe and hyphen only; no leading spaces, no double spaces. */
function cleanTyping(v: string): string {
  return v.replace(/[^\p{L}\s.'-]/gu, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
}

/** Capitalises the first letter of each word when the field loses focus ("rahul kumar" → "Rahul Kumar"). */
function tidyOnBlur(v: string): string {
  return v.trim().replace(/\s+/g, ' ').replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * First / Middle / Last name inputs. Lays out as three columns on wide screens.
 * Put it in a full-width grid cell (e.g. `sm:col-span-2`).
 */
export function NameFields({
  value,
  onChange,
  error,
  label = '',
  idPrefix = 'name',
}: {
  value: NameParts;
  onChange: (next: NameParts) => void;
  /** Shown under First Name (it is the only required part). */
  error?: string;
  /** Optional prefix for the labels, e.g. "Student" → "Student First Name". */
  label?: string;
  idPrefix?: string;
}) {
  const pre = label ? `${label} ` : '';
  const field = (key: keyof NameParts, text: string, required = false, placeholder = '') => (
    <Input
      id={`${idPrefix}_${key}`}
      label={`${pre}${text}`}
      required={required}
      value={value[key]}
      autoComplete="off"
      placeholder={placeholder}
      error={key === 'first_name' ? error : undefined}
      onChange={(e) => onChange({ ...value, [key]: cleanTyping(e.target.value) })}
      onBlur={(e) => {
        const tidy = tidyOnBlur(e.target.value);
        if (tidy !== value[key]) onChange({ ...value, [key]: tidy });
      }}
    />
  );
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {field('first_name', 'First Name', true, 'e.g. Rahul')}
      {field('middle_name', 'Middle Name', false, 'Optional')}
      {field('last_name', 'Last Name', false, 'e.g. Sharma')}
    </div>
  );
}
