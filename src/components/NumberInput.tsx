import { useState, useEffect, InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValue: (n: number) => void;
}

// A number box that shows an EMPTY field (with a faint "0" placeholder) instead of
// a literal 0, so untouched boxes look empty. It keeps the raw text while you type,
// so decimals and leading zeros ("0.5") edit cleanly, and reports the parsed number.
export default function NumberInput({ value, onValue, placeholder = '0', ...rest }: Props) {
  const [text, setText] = useState(value === 0 ? '' : String(value));

  // Resync if the value is changed from outside (e.g. an item picked from stock),
  // without clobbering what the user is mid-typing.
  useEffect(() => {
    setText(prev => {
      const asNum = prev === '' ? 0 : parseFloat(prev);
      return asNum === value ? prev : (value === 0 ? '' : String(value));
    });
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value;
        if (raw !== '' && !/^-?\d*[.,]?\d*$/.test(raw)) return; // ignore stray non-numeric input
        setText(raw);
        const n = raw === '' ? 0 : parseFloat(raw.replace(',', '.'));
        onValue(Number.isFinite(n) ? n : 0);
      }}
      {...rest}
    />
  );
}
