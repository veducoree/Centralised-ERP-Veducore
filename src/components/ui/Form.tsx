import { type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Keys that produce non-numeric characters in a number input.
// We block them unless the field explicitly allows negatives.
const BLOCKED_NUMBER_KEYS = ['e', 'E', '+'];
const BLOCKED_NUMBER_KEYS_NO_NEG = ['e', 'E', '+', '-'];

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** When true, blocks e / E / + and (unless allowNegative) also blocks - */
  numericOnly?: boolean;
  /** Only relevant when numericOnly=true. Allows the minus key for negative numbers. */
  allowNegative?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, className, id, numericOnly, allowNegative, onKeyDown, ...props }, ref) => {
    const inputId = id || props.name;

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (numericOnly || props.type === 'number') {
        const blocked = allowNegative ? BLOCKED_NUMBER_KEYS : BLOCKED_NUMBER_KEYS_NO_NEG;
        if (blocked.includes(e.key)) {
          e.preventDefault();
          return;
        }
      }
      onKeyDown?.(e);
    }

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50 disabled:text-gray-500',
            error ? 'border-red-300 focus:border-red-400' : 'border-gray-300 focus:border-blue-500',
            className
          )}
          onKeyDown={handleKeyDown}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, required, className, id, children, ...props }, ref) => {
    const selectId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50',
            error ? 'border-red-300 focus:border-red-400' : 'border-gray-300 focus:border-blue-500',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

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
          <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30',
            error ? 'border-red-300 focus:border-red-400' : 'border-gray-300 focus:border-blue-500',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
