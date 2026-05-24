import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { signIn, signUp, resetPassword } from '../utils/supabase';
import { BookOpen, Mail, Lock, User, Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'forgot_sent';

interface LoginProps {
  onSuccess: (userId: string, userName: string, userEmail: string) => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const { data } = useApp();
  const { supabaseUrl, supabaseKey } = data.settings;

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lang = data.settings.language;
  const t = (is: string, en: string) => lang === 'is' ? is : en;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(supabaseUrl, supabaseKey, email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error === 'Invalid login credentials'
        ? t('Rangt netfang eða lykilorð', 'Wrong email or password')
        : result.error);
      return;
    }
    if (result.user) {
      const displayName = (result.user.user_metadata?.name as string) || result.user.email || 'User';
      onSuccess(result.user.id, displayName, result.user.email || '');
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('Sláðu inn nafn', 'Enter your name')); return; }
    if (password.length < 8) { setError(t('Lykilorð þarf að vera 8+ stafir', 'Password must be 8+ characters')); return; }
    setLoading(true);
    const result = await signUp(supabaseUrl, supabaseKey, email, password, name.trim());
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    if (result.user) {
      const displayName = name.trim() || result.user.email || 'User';
      onSuccess(result.user.id, displayName, result.user.email || '');
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    await resetPassword(supabaseUrl, supabaseKey, email);
    setLoading(false);
    setMode('forgot_sent');
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <span className="text-2xl font-bold text-white tracking-tight">Jobboks</span>
      </div>

      <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl">

        {/* ── SIGN IN ─────────────────────────────────────── */}
        {mode === 'signin' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-1">
              {t('Skráðu þig inn', 'Sign in')}
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              {t('Velkomin/n aftur í Jobboks', 'Welcome back to Jobboks')}
            </p>
            <form onSubmit={handleSignIn} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={t('Netfang', 'Email')}
                  className={inputCls + ' pl-10'}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPass ? 'text' : 'password'} required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={t('Lykilorð', 'Password')}
                  className={inputCls + ' pl-10 pr-10'}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? t('Hinkraðu...', 'Signing in…') : t('Skrá inn', 'Sign in')}
              </button>
            </form>
            <div className="flex justify-between mt-4 text-xs">
              <button onClick={() => { setMode('forgot'); setError(''); }}
                className="text-slate-500 hover:text-slate-300 transition">
                {t('Gleymt lykilorð?', 'Forgot password?')}
              </button>
              <button onClick={() => { setMode('signup'); setError(''); }}
                className="text-blue-400 hover:text-blue-300 transition font-medium">
                {t('Nýskráning', 'Create account')}
              </button>
            </div>
          </>
        )}

        {/* ── SIGN UP ─────────────────────────────────────── */}
        {mode === 'signup' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-1">
              {t('Búa til aðgang', 'Create account')}
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              {t('Fyrsti notandi verður eigandi', 'First user becomes the owner')}
            </p>
            <form onSubmit={handleSignUp} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text" required autoComplete="name"
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder={t('Fullt nafn', 'Full name')}
                  className={inputCls + ' pl-10'}
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={t('Netfang', 'Email')}
                  className={inputCls + ' pl-10'}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPass ? 'text' : 'password'} required autoComplete="new-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={t('Lykilorð (8+ stafir)', 'Password (8+ chars)')}
                  className={inputCls + ' pl-10 pr-10'}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? t('Hinkraðu...', 'Creating account…') : t('Búa til aðgang', 'Create account')}
              </button>
            </form>
            <div className="mt-4 text-center text-xs">
              <button onClick={() => { setMode('signin'); setError(''); }}
                className="text-slate-500 hover:text-slate-300 transition inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                {t('Til baka', 'Back to sign in')}
              </button>
            </div>
          </>
        )}

        {/* ── FORGOT PASSWORD ─────────────────────────────── */}
        {mode === 'forgot' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-1">
              {t('Endurstilla lykilorð', 'Reset password')}
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              {t('Við sendum þér hlekk á netfangið þitt', 'We\'ll send a reset link to your email')}
            </p>
            <form onSubmit={handleForgot} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={t('Netfang', 'Email')}
                  className={inputCls + ' pl-10'}
                />
              </div>
              {error && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? t('Hinkraðu...', 'Sending…') : t('Senda hlekk', 'Send reset link')}
              </button>
            </form>
            <div className="mt-4 text-center text-xs">
              <button onClick={() => { setMode('signin'); setError(''); }}
                className="text-slate-500 hover:text-slate-300 transition inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                {t('Til baka', 'Back to sign in')}
              </button>
            </div>
          </>
        )}

        {/* ── FORGOT SENT ─────────────────────────────────── */}
        {mode === 'forgot_sent' && (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-white mb-2">
              {t('Hlekkur sendur!', 'Reset link sent!')}
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              {t(`Við sendum hlekk á ${email}. Athugaðu póstinn þinn.`, `We sent a link to ${email}. Check your inbox.`)}
            </p>
            <button onClick={() => setMode('signin')}
              className="text-xs text-blue-400 hover:text-blue-300 transition inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              {t('Til baka', 'Back to sign in')}
            </button>
          </div>
        )}
      </div>

      {/* Skip / local mode note */}
      <p className="mt-6 text-xs text-slate-700 text-center max-w-xs">
        {t(
          'Supabase cloud sync er virkur. Skráðu þig inn til að halda áfram.',
          'Supabase cloud sync is active. Sign in to continue.'
        )}
      </p>
    </div>
  );
}
