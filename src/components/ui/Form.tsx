import { type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

// ── Number input key blocking ─────────────────────────────────────────────────
const BLOCKED_NUMBER_KEYS        = ['e', 'E', '+'];
const BLOCKED_NUMBER_KEYS_NO_NEG = ['e', 'E', '+', '-'];

// ── Design tokens ─────────────────────────────────────────────────────────────
// radius:  10px for all controls (inputs, selects, textareas)
// height:  h-10 (40px) standard, h-9 (36px) compact via size prop
// focus:   indigo ring 2px (#5B6EE8)
// label:   12–13px medium, 4px gap below

const BASE_FIELD = [
  'w-full rounded-[10px] border bg-white',
  'px-3.5 h-10 text-sm text-gray-900 placeholder-gray-400',
  'transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25',
  'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
].join(' ');

const FIELD_NORMAL = 'border-gray-200 focus:border-[#5B6EE8]';
const FIELD_ERROR  = 'border-red-300 focus:border-red-400 focus:ring-red-400/20';

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Renders a red asterisk next to the label. Does NOT set HTML required attr. */
  required?: boolean;
  numericOnly?: boolean;
  allowNegative?: boolean;
  /** 'md' = 40px (default), 'sm' = 36px */
  fieldSize?: 'md' | 'sm';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label, error, hint, required,
      className, id, numericOnly, allowNegative, onKeyDown,
      fieldSize = 'md', ...props
    },
    ref
  ) => {
    const inputId = id || props.name;

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (numericOnly || props.type === 'number') {
        const blocked = allowNegative ? BLOCKED_NUMBER_KEYS : BLOCKED_NUMBER_KEYS_NO_NEG;
        if (blocked.includes(e.key)) { e.preventDefault(); return; }
      }
      onKeyDown?.(e);
    }

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1 block text-[13px] font-medium text-gray-700"
          >
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            BASE_FIELD,
            error ? FIELD_ERROR : FIELD_NORMAL,
            fieldSize === 'sm' && 'h-9',
            className
          )}
          onKeyDown={handleKeyDown}
          /* Note: intentionally NOT forwarding `required` as HTML attr to avoid
             native browser asterisk + tooltip duplicating our label star. */
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        {!error && hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  fieldSize?: 'md' | 'sm';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, required, className, id, children, fieldSize = 'md', ...props }, ref) => {
    const selectId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1 block text-[13px] font-medium text-gray-700"
          >
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            BASE_FIELD,
            'appearance-none cursor-pointer pr-9',
            // Custom chevron via background image
            'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239ca3af\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")]',
            'bg-no-repeat bg-[right_12px_center]',
            error ? FIELD_ERROR : FIELD_NORMAL,
            fieldSize === 'sm' && 'h-9',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, required, className, id, ...props }, ref) => {
    const textareaId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1 block text-[13px] font-medium text-gray-700"
          >
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-sm text-gray-900',
            'placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25',
            'disabled:bg-gray-50 disabled:text-gray-400',
            error ? FIELD_ERROR : FIELD_NORMAL,
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
