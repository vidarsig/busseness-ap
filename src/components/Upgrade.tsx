import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import {
  Zap, Check, X, Crown, Star, Building2, ArrowRight,
  Users, Cloud, Shield, Headphones, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Paddle config ─────────────────────────────────────────────
// Replace these with your real Paddle price IDs once your account is approved
const PADDLE_VENDOR_ID = 'YOUR_PADDLE_VENDOR_ID';
const PADDLE_PRICES = {
  pro_monthly:      'pri_REPLACE_PRO_MONTHLY',
  pro_annual:       'pri_REPLACE_PRO_ANNUAL',
  business_monthly: 'pri_REPLACE_BUSINESS_MONTHLY',
  business_annual:  'pri_REPLACE_BUSINESS_ANNUAL',
};

declare global {
  interface Window {
    Paddle?: {
      Setup: (opts: { vendor: string }) => void;
      Checkout: { open: (opts: { product?: string; email?: string }) => void };
    };
  }
}

function loadPaddle(): Promise<void> {
  return new Promise(resolve => {
    if (window.Paddle) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.onload = () => {
      window.Paddle?.Setup({ vendor: PADDLE_VENDOR_ID });
      resolve();
    };
    document.head.appendChild(script);
  });
}

async function openCheckout(priceId: string, email?: string) {
  await loadPaddle();
  window.Paddle?.Checkout.open({ product: priceId, email });
}

// ── Plan data ─────────────────────────────────────────────────
const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    icon: Star,
    color: 'border-gray-200',
    headerColor: 'bg-gray-50',
    badgeColor: 'bg-gray-100 text-gray-600',
    monthlyEur: 0,
    annualEur: 0,
    tagline: 'Get started at no cost',
    taglineIs: 'Byrjaðu án kostnaðar',
    features: [
      { text: 'All core screens', textIs: 'Allir aðalskjáir', included: true },
      { text: 'Transactions, invoices, VAT', textIs: 'Færslur, reikningar, VSK', included: true },
      { text: 'Jobs & stock management', textIs: 'Verkefni og birgðir', included: true },
      { text: 'AI assistant (your API key)', textIs: 'AI aðstoð (þinn lykill)', included: true },
      { text: 'Local storage only', textIs: 'Aðeins staðbundin geymsla', included: true },
      { text: 'Cloud sync', textIs: 'Skýjageymsla', included: false },
      { text: 'Multi-user access', textIs: 'Margnotendaaðgangur', included: false },
      { text: 'Priority support', textIs: 'Forgangsþjónusta', included: false },
    ],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    icon: Zap,
    color: 'border-blue-500',
    headerColor: 'bg-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700',
    monthlyEur: 9,
    annualEur: 7,
    tagline: 'For growing businesses',
    taglineIs: 'Fyrir vaxandi fyrirtæki',
    popular: true,
    features: [
      { text: 'Everything in Free', textIs: 'Allt úr Free', included: true },
      { text: 'Cloud sync (your Supabase)', textIs: 'Skýjasamstilling', included: true },
      { text: 'Up to 3 users', textIs: 'Allt að 3 notendur', included: true },
      { text: 'Role-based permissions', textIs: 'Hlutverkstengdar heimildir', included: true },
      { text: 'Priority email support', textIs: 'Forgangs tölvupóstsþjónusta', included: true },
      { text: 'Unlimited users', textIs: 'Ótakmarkaðir notendur', included: false },
      { text: 'Dedicated account manager', textIs: 'Sérstakur reikningsstjóri', included: false },
    ],
    monthlyPriceId: PADDLE_PRICES.pro_monthly,
    annualPriceId: PADDLE_PRICES.pro_annual,
  },
  {
    id: 'business' as const,
    name: 'Business',
    icon: Building2,
    color: 'border-purple-500',
    headerColor: 'bg-purple-700',
    badgeColor: 'bg-purple-100 text-purple-700',
    monthlyEur: 19,
    annualEur: 15,
    tagline: 'For teams & contractors',
    taglineIs: 'Fyrir teymi og verktaka',
    features: [
      { text: 'Everything in Pro', textIs: 'Allt úr Pro', included: true },
      { text: 'Unlimited users', textIs: 'Ótakmarkaðir notendur', included: true },
      { text: 'Advanced permission control', textIs: 'Ítarlegar heimildir', included: true },
      { text: 'Dedicated account manager', textIs: 'Sérstakur reikningsstjóri', included: true },
      { text: 'Phone support', textIs: 'Símþjónusta', included: true },
      { text: 'Custom onboarding', textIs: 'Sérsniðið uppsetningarferli', included: true },
    ],
    monthlyPriceId: PADDLE_PRICES.business_monthly,
    annualPriceId: PADDLE_PRICES.business_annual,
  },
];

const FAQS = [
  {
    q: 'Can I cancel anytime?',
    qIs: 'Get ég sagt upp hvenær sem er?',
    a: 'Yes. Cancel anytime and you keep access until the end of the billing period. No questions asked.',
    aIs: 'Já. Þú getur sagt upp hvenær sem er og heldur áfram að nota appið til loka greiðslutímabils.',
  },
  {
    q: 'What payment methods are accepted?',
    qIs: 'Hvaða greiðslumátar eru í boði?',
    a: 'All major credit and debit cards (Visa, Mastercard, Amex). Payments are handled securely by Paddle.',
    aIs: 'Allar helstu greiðslukort (Visa, Mastercard, Amex). Greiðslur fara í gegnum Paddle.',
  },
  {
    q: 'Is VAT included in the price?',
    qIs: 'Er VSK innifalinn í verðinu?',
    a: 'Yes. All displayed prices include applicable VAT. Paddle collects and remits taxes on our behalf.',
    aIs: 'Já. Allt verð er með VSK. Paddle sér um skattheimtu.',
  },
  {
    q: 'What happens to my data if I downgrade?',
    qIs: 'Hvað gerist við gögn mín ef ég fer niður í Free?',
    a: 'Your data is always yours. If you downgrade, cloud sync pauses but your local data is untouched. You can export a full backup anytime from Settings.',
    aIs: 'Gögnin eru alltaf þín. Ef þú ferð niður í Free stöðvar skýjasamstilling en staðbundin gögn eru ósnert. Þú getur flutt út öryggisafrit hvenær sem er.',
  },
  {
    q: 'Do I need a Supabase account for Pro?',
    qIs: 'Þarf ég Supabase aðgang fyrir Pro?',
    a: 'Yes — cloud sync uses your own free Supabase project. We walk you through the 5-minute setup in Settings.',
    aIs: 'Já — skýjasamstilling notar þitt eigið Supabase verkefni. Við leiðbeinum þér í gegnum 5 mínútna uppsetningu í Stillingum.',
  },
];

export default function Upgrade() {
  const { data, dispatch } = useApp();
  const lang = data.settings.language;
  const t = (is: string, en: string) => lang === 'is' ? is : en;
  const currentPlan = data.settings.plan ?? 'free';

  const [annual, setAnnual] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleUpgrade(plan: typeof PLANS[number]) {
    if (plan.id === 'free') return;
    const priceId = annual ? plan.annualPriceId : plan.monthlyPriceId;
    if (!priceId || priceId.startsWith('pri_REPLACE')) {
      alert(t(
        'Paddle er ekki tengt ennþá. Við látum þig vita þegar greiðslur eru virkar.',
        'Paddle is not connected yet. We\'ll notify you when payments go live.'
      ));
      return;
    }
    setLoading(plan.id);
    try {
      await openCheckout(priceId, data.settings.company.email || undefined);
    } finally {
      setLoading(null);
    }
  }

  // Simulate plan activation for testing (remove when Paddle is live)
  function devSetPlan(plan: 'free' | 'pro' | 'business') {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { plan } });
  }

  return (
    <div className="space-y-8 pb-12">

      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <Crown className="w-3.5 h-3.5" />
          {t('Uppfæra áskrift', 'Upgrade your plan')}
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          {t('Veldu þitt plan', 'Choose your plan')}
        </h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          {t(
            'Byrjaðu ókeypis. Uppfærðu þegar þú ert tilbúinn. Engar bindingar.',
            'Start free. Upgrade when you\'re ready. No lock-in.'
          )}
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={`text-sm font-medium ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>
            {t('Mánaðarlegt', 'Monthly')}
          </span>
          <button onClick={() => setAnnual(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : ''}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-gray-900' : 'text-gray-400'}`}>
            {t('Árlegt', 'Annual')}
          </span>
          <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
            {t('2 mánuðir ókeypis', '2 months free')}
          </span>
        </div>
      </div>

      {/* Current plan banner */}
      {currentPlan !== 'free' && (
        <div className="max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">
            {t(`Þú ert á ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plani`, `You are on the ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan`)}
            {' — '}
            <a href="mailto:hello@jobboks.com" className="underline font-medium">
              {t('Hafa samband til að breyta', 'Contact us to change')}
            </a>
          </p>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {PLANS.map(plan => {
          const Icon = plan.icon;
          const price = annual ? plan.annualEur : plan.monthlyEur;
          const isCurrent = currentPlan === plan.id;
          const isPopular = 'popular' in plan && plan.popular;

          return (
            <div key={plan.id}
              className={`relative bg-white rounded-2xl border-2 ${plan.color} overflow-hidden shadow-sm ${isPopular ? 'shadow-blue-100 shadow-lg' : ''}`}>

              {isPopular && (
                <div className="absolute top-0 inset-x-0 flex justify-center">
                  <div className="bg-blue-600 text-white text-[10px] font-bold px-4 py-0.5 rounded-b-lg tracking-wide uppercase">
                    {t('Vinsælast', 'Most popular')}
                  </div>
                </div>
              )}

              {/* Header */}
              <div className={`px-6 pt-8 pb-5 ${plan.id !== 'free' ? plan.headerColor : 'bg-gray-50'}`}>
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-3 ${plan.id === 'free' ? plan.badgeColor : 'bg-white/20 text-white'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {plan.name}
                </div>
                <div className={`${plan.id !== 'free' ? 'text-white' : 'text-gray-900'}`}>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold">€{price}</span>
                    <span className="text-sm opacity-70 mb-1.5">/{t('mán', 'mo')}</span>
                  </div>
                  {annual && price > 0 && (
                    <p className="text-xs opacity-60 mt-0.5">
                      {t(`Innheimt árlega €${price * 12}`, `Billed annually €${price * 12}`)}
                    </p>
                  )}
                  <p className="text-xs opacity-70 mt-2">
                    {lang === 'is' ? plan.taglineIs : plan.tagline}
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="px-6 py-5 space-y-2.5">
                {plan.features.map((f, fi) => (
                  <div key={fi} className="flex items-start gap-2.5">
                    {f.included
                      ? <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      : <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />}
                    <span className={`text-sm ${f.included ? 'text-gray-700' : 'text-gray-400'}`}>
                      {lang === 'is' ? f.textIs : f.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="px-6 pb-6">
                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-center text-sm font-semibold text-gray-400">
                    {t('Núverandi plan', 'Current plan')}
                  </div>
                ) : plan.id === 'free' ? (
                  <button onClick={() => devSetPlan('free')}
                    className="w-full py-2.5 rounded-xl border-2 border-gray-200 hover:border-gray-300 text-sm font-semibold text-gray-600 transition">
                    {t('Vera á Free', 'Stay on Free')}
                  </button>
                ) : (
                  <button onClick={() => handleUpgrade(plan)}
                    disabled={loading === plan.id}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-60 ${
                      plan.id === 'pro' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-700 hover:bg-purple-800'
                    }`}>
                    {loading === plan.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        {t('Fá', 'Get')} {plan.name}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust badges */}
      <div className="flex flex-wrap justify-center gap-6 text-xs text-gray-400 max-w-lg mx-auto">
        <div className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-green-500" />
          {t('Öruggar greiðslur (Paddle)', 'Secure payments (Paddle)')}
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-blue-500" />
          {t('Hægt að segja upp hvenær', 'Cancel anytime')}
        </div>
        <div className="flex items-center gap-1.5">
          <Cloud className="w-4 h-4 text-purple-500" />
          {t('VSK innifalið', 'VAT included')}
        </div>
        <div className="flex items-center gap-1.5">
          <Headphones className="w-4 h-4 text-orange-500" />
          {t('Stuðningur í tölvupósti', 'Email support')}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-bold text-gray-900 text-center mb-4">
          {t('Algengar spurningar', 'Frequently asked questions')}
        </h2>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left">
                <span className="text-sm font-semibold text-gray-900">
                  {lang === 'is' ? faq.qIs : faq.q}
                </span>
                {openFaq === i
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                  {lang === 'is' ? faq.aIs : faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="text-center text-xs text-gray-400">
        {t('Spurningar? Skrifaðu okkur á', 'Questions? Email us at')}{' '}
        <a href="mailto:hello@jobboks.com" className="text-blue-600 font-medium">hello@jobboks.com</a>
      </div>
    </div>
  );
}
