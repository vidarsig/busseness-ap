import { useRef } from 'react';
import { Mic } from 'lucide-react';
import { useSpeechRecognition } from '../utils/useSpeechRecognition';

interface Props {
  /** Current text of the field this mic dictates into. */
  value: string;
  /** Called with the new text (existing + spoken) as the user speaks. */
  onChange: (text: string) => void;
  /** App language ('is' | 'en'). */
  lang: string;
  disabled?: boolean;
  /** Tooltip / accessible label. */
  title?: string;
  className?: string;
}

/**
 * Tap-to-talk mic that appends speech to a text field.
 * Renders nothing if the device has no speech recognition, so it never breaks a form.
 */
export default function MicButton({ value, onChange, lang, disabled, title, className }: Props) {
  const { listening, supported, start, stop } = useSpeechRecognition(lang);
  const baseRef = useRef('');
  const finalRef = useRef('');

  if (!supported) return null;

  function toggle() {
    if (disabled) return;
    if (listening) { stop(); return; }
    baseRef.current = value ? value.trimEnd() + ' ' : '';
    finalRef.current = '';
    start((text, isFinal) => {
      if (isFinal) {
        finalRef.current += text;
        onChange(baseRef.current + finalRef.current);
      } else {
        onChange(baseRef.current + finalRef.current + text);
      }
    });
  }

  const label = title ?? (listening
    ? (lang === 'is' ? 'Stöðva' : 'Stop')
    : (lang === 'is' ? 'Tala' : 'Speak'));

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex-shrink-0 p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        listening ? 'bg-red-500 text-white animate-pulse hover:bg-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      } ${className ?? ''}`}>
      <Mic className="w-4 h-4" />
    </button>
  );
}
