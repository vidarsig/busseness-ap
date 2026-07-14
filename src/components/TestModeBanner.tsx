import { FlaskConical, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

// A loud, always-on banner while Test Mode is active, so it's impossible to
// forget you're in the sandbox. One tap exits and restores the real data.
export default function TestModeBanner() {
  const { testMode, exitTestMode, lang } = useApp();
  if (!testMode) return null;
  const is = lang === 'is';
  return (
    <div className="fixed top-0 inset-x-0 z-[80] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-semibold shadow-md">
      <FlaskConical className="w-4 h-4 flex-shrink-0" />
      <span className="text-center">{is ? 'PRUFUSTILLING — ekkert vistast, raunveruleg gögn eru örugg' : 'TEST MODE — nothing is saved, your real data is safe'}</span>
      <button onClick={exitTestMode}
        className="ml-1 bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1 flex items-center gap-1 flex-shrink-0">
        <X className="w-3.5 h-3.5" /> {is ? 'Hætta prufu' : 'Exit test'}
      </button>
    </div>
  );
}
