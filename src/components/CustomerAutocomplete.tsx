import { useState, useRef } from 'react';
import { Customer } from '../types';

interface Props {
  value: string;
  onName: (name: string) => void;         // free typing
  onPick: (c: Customer) => void;          // an existing customer was chosen → fill all fields
  customers: Customer[];
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

// A name box that suggests existing Viðskiptavinir (customers) as you type. Pick
// one to auto-fill kennitala/address/email etc. Used in Reikningar, Tilboð and
// Verkbókhald so the same customer list drives all three.
export default function CustomerAutocomplete({ value, onName, onPick, customers, className, placeholder, autoFocus }: Props) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const q = value.trim().toLowerCase();
  const matches = q.length === 0
    ? []
    : customers.filter(c => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q).slice(0, 6);

  return (
    <div className="relative">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={e => { onName(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {matches.map(c => (
            <button key={c.id} type="button"
              onMouseDown={e => e.preventDefault()}  /* keep the input focused so the click lands before blur */
              onClick={() => { onPick(c); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
              <div className="text-sm font-medium text-gray-800">{c.name}</div>
              {(c.kennitala || c.city) && (
                <div className="text-xs text-gray-400">{[c.kennitala, c.city].filter(Boolean).join(' · ')}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
