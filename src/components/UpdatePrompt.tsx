import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

// A small banner that appears when a newer version of the app has been
// published. One tap reloads onto the new version — no manual cache clearing.
// The app also re-checks for updates on load, every few minutes, and whenever
// it regains focus, so new versions surface quickly.
export default function UpdatePrompt() {
  const { lang } = useApp();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => { registration.update().catch(() => {}); };
      setInterval(check, 60 * 1000);
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  if (!needRefresh) return null;
  const is = lang === 'is';

  return (
    <div className="fixed z-[70] bottom-4 inset-x-4 md:inset-x-auto md:right-4 md:w-80
      bg-blue-600 text-white rounded-xl shadow-2xl p-4 flex items-center gap-3">
      <RefreshCw className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{is ? 'Ný útgáfa tilbúin' : 'New version ready'}</div>
        <div className="text-xs text-white/80">{is ? 'Smelltu til að uppfæra appið.' : 'Tap to update the app.'}</div>
      </div>
      <button onClick={() => updateServiceWorker(true)}
        className="bg-white text-blue-700 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 whitespace-nowrap">
        {is ? 'Uppfæra' : 'Update'}
      </button>
      <button onClick={() => setNeedRefresh(false)} aria-label={is ? 'Loka' : 'Close'}
        className="text-white/70 hover:text-white flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
