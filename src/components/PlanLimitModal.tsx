import { Crown, X, ArrowRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
  limitText: string;
  limitTextIs: string;
}

export default function PlanLimitModal({ open, onClose, onUpgrade, limitText, limitTextIs }: Props) {
  const { data } = useApp();
  const lang = data.settings.language;
  const t = (is: string, en: string) => lang === 'is' ? is : en;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mx-auto mb-4">
          <Crown className="w-7 h-7 text-white" />
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {t('Takmark náð á Free plani', 'Free plan limit reached')}
        </h2>

        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          {lang === 'is' ? limitTextIs : limitText}
          {' '}
          {t('Uppfærðu í Pro til að halda áfram.', 'Upgrade to Pro to continue.')}
        </p>

        <button
          onClick={() => { window.dispatchEvent(new CustomEvent('navigate-upgrade')); onUpgrade?.(); onClose(); }}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-semibold py-3 rounded-xl transition mb-3">
          <Crown className="w-4 h-4" />
          {t('Uppfæra í Pro — €9/mán', 'Upgrade to Pro — €9/mo')}
          <ArrowRight className="w-4 h-4" />
        </button>

        <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition">
          {t('Ekki núna', 'Not now')}
        </button>
      </div>
    </div>
  );
}
