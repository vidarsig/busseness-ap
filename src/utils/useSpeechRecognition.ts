import { useRef, useState, useEffect, useCallback } from 'react';

// Minimal typing for the Web Speech API (not in the default TS DOM lib).
// Works in Chrome / Android WebView (the TWA wrapper), Edge and Safari.
type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

type TranscriptHandler = (text: string, isFinal: boolean) => void;

/**
 * Browser speech-to-text. Tap start, talk, the words stream back through
 * `onResult`. No accounts, no cost, no install — uses the phone's own engine.
 *
 * lang: app language code ('is' or 'en'); mapped to a locale for recognition.
 */
export function useSpeechRecognition(lang: string) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRec | null>(null);
  const handlerRef = useRef<TranscriptHandler | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    setSupported(true);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang === 'is' ? 'is-IS' : 'en-US';

    rec.onresult = (e: SpeechResultEvent) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) handlerRef.current?.(final, true);
      else if (interim) handlerRef.current?.(interim, false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      // 'no-speech' / 'aborted' are normal stops, not real errors.
      if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(e.error === 'not-allowed'
          ? (lang === 'is' ? 'Vantar leyfi fyrir hljóðnema.' : 'Microphone permission needed.')
          : (lang === 'is' ? 'Hljóðnemi virkar ekki.' : 'Microphone not working.'));
      }
      setListening(false);
    };

    recRef.current = rec;
    return () => { try { rec.stop(); } catch { /* ignore */ } };
  }, [lang]);

  const start = useCallback((onResult: TranscriptHandler) => {
    if (!recRef.current) return;
    handlerRef.current = onResult;
    setError('');
    try { recRef.current.start(); setListening(true); } catch { /* already started */ }
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  return { listening, supported, error, start, stop };
}
