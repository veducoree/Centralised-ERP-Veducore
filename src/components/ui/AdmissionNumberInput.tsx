import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { fetchNextEmployeeId } from '@/services/api';

type NextFetcher = () => Promise<{ prefix: string; next: string | null }>;

/**
 * Number box with the school's fixed prefix, used for admission numbers and
 * teacher employee IDs. The school's prefix (set by Veducore,
 * e.g. "STUD") is shown fixed in front; the admin only types the number part.
 * `value` / `onChange` always carry the FULL admission number (prefix + number).
 *
 * When `autoFill` is on and the box is empty, it is filled with the next
 * number after the school's highest existing one (STUD453 → STUD454).
 */
export function PrefixedNumberInput({
  value, onChange, error, autoFill = true, label, fetchNext, placeholder = 'e.g. 1024',
}: {
  value: string;
  onChange: (full: string) => void;
  error?: string;
  autoFill?: boolean;
  label: string;
  fetchNext: NextFetcher;
  placeholder?: string;
}) {
  const [prefix, setPrefix] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchNext()
      .then((r) => {
        if (!alive) return;
        setPrefix(r.prefix);
        if (autoFill && r.next && !value) onChange(r.next);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // Run once when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPrefix = !!prefix && value.toUpperCase().startsWith(prefix.toUpperCase());
  const numberPart = prefix ? (hasPrefix ? value.slice(prefix.length) : value) : value;

  return (
    <div className="w-full">
      <label className="mb-1 block text-[13px] font-medium text-slate-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className={cn(
        'flex h-10 w-full overflow-hidden rounded-[10px] border bg-white transition-colors focus-within:ring-2',
        error ? 'border-red-300 focus-within:ring-red-400/20' : 'border-slate-200 focus-within:border-[#5B6EE8] focus-within:ring-[#5B6EE8]/25',
      )}>
        {prefix && (
          <span className="flex select-none items-center border-r border-slate-200 bg-slate-50 px-3 font-mono text-sm font-semibold text-slate-600"
            title="Set by Veducore for your school">
            {prefix}
          </span>
        )}
        <input
          className="h-full min-w-0 flex-1 px-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          value={numberPart}
          placeholder={prefix ? '001' : placeholder}
          onChange={(e) => {
            let typed = e.target.value.replace(/\s/g, '');
            // Admin typed the prefix too (e.g. pasted "STUD001") — don't double it.
            if (prefix && typed.toUpperCase().startsWith(prefix.toUpperCase())) typed = typed.slice(prefix.length);
            onChange(typed ? prefix + typed : '');
          }}
        />
      </div>
      {error
        ? <p className="mt-1 text-xs text-red-600">{error}</p>
        : loaded && prefix
          ? <p className="mt-1 text-xs text-slate-400">Saved as {value || `${prefix}…`}</p>
          : null}
    </div>
  );
}

type WrapperProps = { value: string; onChange: (full: string) => void; error?: string; autoFill?: boolean };

/** Employee ID for a new teacher (prefix e.g. "EMP"). */
export function EmployeeIdInput(props: WrapperProps) {
  return <PrefixedNumberInput {...props} label="Employee ID" fetchNext={fetchNextEmployeeId} placeholder="e.g. 101" />;
}
