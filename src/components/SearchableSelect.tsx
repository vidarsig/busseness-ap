import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;        // shown small, under the label (e.g. what a key is for)
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;   // the same class the plain <select> carried, so nothing shifts
  placeholder?: string; // shown when nothing is chosen
  title?: string;
  disabled?: boolean;
  /** Lists shorter than this stay a plain list with no search box (default 8). */
  searchFrom?: number;
}

// Fold case + Icelandic accents so "faedi" finds "Fæði" and "thor" finds "Þór".
// Same fold as the transaction search and CustomerAutocomplete — a keyboard often
// gives unaccented letters, and a list you cannot type your way into is no better
// than no list at all when it holds 68 keys.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ø/g, 'o');

// A dropdown you can TYPE INTO. The plain <select> the app used everywhere gives
// no way to search: 68 bókhaldslyklar and some 35 flokkar had to be found by
// scrolling, and on the phone the native picker does not even jump to a letter
// reliably. Type any part of a number or a name — "6650", "fae", "eldsn" — and the
// list narrows to it. Enter takes the top hit, Esc closes, and with a short list
// the search box does not appear at all.
export default function SearchableSelect({
  value, onChange, options, className, placeholder, title, disabled, searchFrom = 8,
}: Props) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The open list is drawn into <body>, not inside the field. Inside a modal or a
  // scrolling table the panel was cut off at the container's edge — in the "bæta við
  // færslu" form the key list lost its bottom rows to the modal border. A fixed,
  // portalled panel escapes every overflow box; these are its measured coordinates.
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null);

  const withSearch = options.length >= searchFrom;
  const selected = options.find(o => o.value === value);

  const matches = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return options;
    return options.filter(o => fold(`${o.label} ${o.hint ?? ''}`).includes(needle));
  }, [options, q]);

  // Where the panel goes: under the field, or above it when the bottom of the
  // screen is closer than the list is tall.
  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const wanted = 320;
    const dropUp = below < Math.min(wanted, 200) && above > below;
    const maxH = Math.max(140, Math.min(wanted, dropUp ? above : below));
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8)),
      top: dropUp ? r.top - maxH - 4 : r.bottom + 4,
      width: Math.max(r.width, 240),
      maxH,
    });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Close when the click lands anywhere else on the page, and keep the panel glued
  // to the field while anything behind it scrolls or the window resizes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inField = wrapRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inField && !inPanel) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);   // capture: inner scrollers too
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Opening should land the cursor in the search box and start at the top of the
  // list, so the first thing typed filters instead of being swallowed.
  useEffect(() => {
    if (!open) { setQ(''); return; }
    setActive(0);
    const id = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.children[active] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = matches[active] ?? matches[0];
      if (hit) pick(hit.value);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`${className ?? ''} text-left flex items-center justify-between gap-2 disabled:bg-gray-100 disabled:text-gray-400`}
      >
        <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>
          {selected ? selected.label : (placeholder ?? (lang === 'is' ? 'Veldu…' : 'Choose…'))}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, maxWidth: 'min(24rem, 92vw)' }}
          className="z-[60] bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {withSearch && (
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={q}
                onChange={e => { setQ(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder={lang === 'is' ? 'Leita…' : 'Search…'}
                className="w-full text-sm py-1 focus:outline-none"
              />
              {q && (
                <button type="button" onClick={() => { setQ(''); searchRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"><X className="w-4 h-4" /></button>
              )}
            </div>
          )}
          <div ref={listRef} style={{ maxHeight: pos.maxH - (withSearch ? 42 : 0) }} className="overflow-y-auto py-1">
            {matches.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                className={`w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-blue-50' : ''} ${o.value === value ? 'font-semibold text-blue-700' : 'text-gray-800'}`}
              >
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block text-xs text-gray-400 truncate">{o.hint}</span>}
              </button>
            ))}
            {matches.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-400">
                {lang === 'is' ? 'Ekkert fannst' : 'Nothing found'}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
