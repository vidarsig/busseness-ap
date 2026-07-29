import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { AppSettings } from '../types';
import { checkSettingsHealth } from '../utils/settingsHealth';

// Proactively surfaces likely-wrong settings (wrong sales tax for the state, wrong
// currency for the country) with a one-tap fix — so a misconfiguration is caught
// before it ever reaches a customer. Shared by Settings (inline) and the Dashboard
// (dismissible for the session). onFixed lets a host (Settings) keep its own form in
// sync after a fix so a later Save can't overwrite the correction.
export default function SettingsHealthBanner({ dismissible, compact, onFixed }: {
  dismissible?: boolean;
  compact?: boolean;
  onFixed?: (fix: Partial<AppSettings>) => void;
}) {
  const { data, dispatch, lang } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const issues = checkSettingsHealth(data.settings);
  if (dismissed || issues.length === 0) return null;

  const applyFix = (fix: Partial<AppSettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: fix });
    onFixed?.(fix);
  };

  // Compact = a small notification (for the Dashboard): one slim row, first issue,
  // "+N more" if there are others, and a one-tap fix. Full = the detailed Settings list.
  if (compact) {
    const first = issues[0];
    const more = issues.length - 1;
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-xs">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        <span className="text-amber-800 flex-1 min-w-0 truncate">{first.message}{more > 0 ? ` (+${more} ${lang === 'is' ? 'fleiri' : 'more'})` : ''}</span>
        {Object.keys(first.fix).length > 0 && (
          <button type="button" onClick={() => applyFix(first.fix)}
            className="flex-shrink-0 px-2.5 py-1 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700">
            {first.fixLabel}
          </button>
        )}
        {dismissible && (
          <button type="button" onClick={() => setDismissed(true)} aria-label={lang === 'is' ? 'Loka' : 'Dismiss'}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <h2 className="text-sm font-bold text-amber-900 flex-1">{lang === 'is' ? 'Athugaðu þessar stillingar' : 'Check these settings'}</h2>
        {dismissible && (
          <button type="button" onClick={() => setDismissed(true)} aria-label={lang === 'is' ? 'Loka' : 'Dismiss'}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {issues.map(issue => (
        <div key={issue.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <p className="text-xs text-amber-800 flex-1">{issue.message}</p>
          {Object.keys(issue.fix).length > 0 && (
            <button type="button" onClick={() => applyFix(issue.fix)}
              className="self-start sm:self-auto flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700">
              {issue.fixLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
