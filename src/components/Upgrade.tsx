import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import {
  Zap, Check, X, Crown, Star, Building2, ArrowRight,
  Shield, Headphones, ChevronDown, ChevronUp,
  FileText, Download, Camera, CreditCard,
} from 'lucide-react';

// ── Stripe config ─────────────────────────────────────────────
// Replace with real Stripe price IDs after Wyoming LLC + EIN
const STRIPE_PRICES = {
  pro_monthly:      'price_REPLACE_PRO_MONTHLY',
  pro_annual:       'price_REPLACE_PRO_ANNUAL',
  business_monthly: 'price_REPLACE_BUSINESS_MONTHLY',
  business_annual:  'price_REPLACE_BUSINESS_ANNUAL',
};

async function openStripeCheckout(priceId: string) {
  if (priceId.startsWith('price_REPLACE')) {
    return false; // not live yet
  }
  // Stripe checkout redirect (replace with your Stripe payment link or Stripe.js)
  window.location.href = `https://buy.stripe.com/${priceId}`;
  return true;
}

// ── Plan data ─────────────────────────────────────────────────
const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    nameIs: 'Ókeypis',
    icon: Star,
    color: 'border-gray-200',
    headerBg: 'bg-gray-50',
    badgeClass: 'bg-gray-100 text-gray-600',
    textClass: 'text-gray-900',
    monthlyEur: 0,
    annualEur: 0,
    tagline: 'Perfect for sole traders starting out',
    taglineIs: 'Fullkomið fyrir einstaklingsverktaka',
    features: [
      { text: '50 transactions / month',         textIs: '50 færslur / mánuð',              included: true },
      { text: '5 invoices / month',               textIs: '5 reikningar / mánuð',            included: true },
      { text: '2 active jobs',                    textIs: '2 virk verkefni',                 included: true },
      { text: '20 stock items',                   textIs: '20 birgðahlutir',                 included: true },
      { text: '2 workers in payroll',             textIs: '2 starfsmenn í launaskrá',        included: true },
      { text: 'PDF invoices (Jobboks watermark)', textIs: 'PDF reikningar (Jobboks merki)',  included: true },
      { text: 'IS + EN languages',                textIs: 'IS + EN tungumál',                included: true },
      { text: 'Cloud sync',                       textIs: 'Skýjasamstilling',                included: false },
      { text: 'Bank import',                      textIs: 'Bankaimport',                     included: false },
      { text: 'VAT report export',                textIs: 'VSK útflutningur',                included: false },
    ],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    nameIs: 'Pro',
    icon: Zap,
    color: 'border-blue-500',
    headerBg: 'bg-blue-600',
    badgeClass: 'bg-white/20 text-white',
    textClass: 'text-white',
    monthlyEur: 9,
    annualEur: 7,
    tagline: 'For growing businesses & contractors',
    taglineIs: 'Fyrir vaxandi fyrirtæki og verktaka',
    popular: true,
    features: [
      { text: 'Unlimited transactions',           textIs: 'Ótakmarkaðar færslur',            included: true },
      { text: 'Unlimited invoices',               textIs: 'Ótakmarkaðir reikningar',         included: true },
      { text: 'Unlimited jobs & Work Book',       textIs: 'Ótakmörkuð verkefni & Vinnubók', included: true },
      { text: 'Unlimited stock items',            textIs: 'Ótakmarkaðir birgðahlutir',       included: true },
      { text: 'PDF without watermark',            textIs: 'PDF án Jobboks merkis',           included: true },
      { text: 'Bank import (CSV)',                textIs: 'Bankaimport (CSV)',                included: true },
      { text: 'VAT report export',                textIs: 'VSK skýrsla útflutningur',        included: true },
      { text: 'Cloud sync (Supabase)',            textIs: 'Skýjasamstilling (Supabase)',     included: true },
      { text: 'All 8 languages',                  textIs: 'Öll 8 tungumál',                  included: true },
      { text: 'Up to 5 team members',             textIs: 'Allt að 5 notendur',              included: false },
    ],
    monthlyPriceId: STRIPE_PRICES.pro_monthly,
    annualPriceId: STRIPE_PRICES.pro_annual,
  },
  {
    id: 'business' as const,
    name: 'Business',
    nameIs: 'Business',
    icon: Building2,
    color: 'border-violet-500',
    headerBg: 'bg-violet-700',
    badgeClass: 'bg-white/20 text-white',
    textClass: 'text-white',
    monthlyEur: 19,
    annualEur: 15,
    tagline: 'For teams, architects & engineering firms',
    taglineIs: 'Fyrir teymi, arkitekta og verkfræðistofur',
    features: [
      { text: 'Everything in Pro',                textIs: 'Allt úr Pro',                     included: true },
      { text: 'Up to 5 team members',             textIs: 'Allt að 5 notendur',              included: true },
      { text: 'Role-based permissions',           textIs: 'Hlutverkstengdar heimildir',      included: true },
      { text: 'Multiple companies',               textIs: 'Mörg fyrirtæki',                  included: true },
      { text: 'Priority email support',           textIs: 'Forgangs tölvupóstsþjónusta',     included: true },
      { text: 'Dedicated onboarding',             textIs: 'Sérsniðið uppsetningarferli',     included: true },
    ],
    monthlyPriceId: STRIPE_PRICES.business_monthly,
    annualPriceId: STRIPE_PRICES.business_annual,
  },
];

const FAQS = [
  {
    q: 'Can I cancel anytime?',
    qIs: 'Get ég sagt upp hvenær sem er?',
    a: 'Yes — cancel anytime and keep access until the end of your billing period. No questions asked.',
    aIs: 'Já. Þú getur sagt upp hvenær sem er og heldur áfram að nota appið til loka greiðslutímabils. Engar spurningar.',
  },
  {
    q: 'What payment methods are accepted?',
    qIs: 'Hvaða greiðslumátar eru í boði?',
    a: 'All major credit and debit cards (Visa, Mastercard, Amex). Payments are handled securely by Stripe.',
    aIs: 'Allar helstu greiðslukort (Visa, Mastercard, Amex). Greiðslur fara í gegnum Stripe.',
  },
  {
    q: 'Is VAT included in the price?',
    qIs: 'Er VSK innifalinn í verðinu?',
    a: 'Yes. All displayed prices include applicable VAT.',
    aIs: 'Já. Allt verð er með VSK.',
  },
  {
    q: 'What happens to my data if I downgrade to Free?',
    qIs: 'Hvað gerist við gögn mín ef ég fer niður í Free?',
    a: 'Your data is always yours. Cloud sync pauses but your local data is untouched. Export a full backup anytime from Settings.',
    aIs: 'Gögnin eru alltaf þín. Skýjasamstilling stöðvar en staðbundin gögn eru ósnert. Flytja má út öryggisafrit hvenær sem er úr Stillingum.',
  },
  {
    q: 'Do I need a Supabase account for cloud sync?',
    qIs: 'Þarf ég Supabase aðgang fyrir skýjasamstillingu?',
    a: 'Yes — cloud sync uses your own free Supabase project. We walk you through the 5-minute setup in Settings.',
    aIs: 'Já — skýjasamstilling notar þitt eigið ókeypis Supabase verkefni. Við leiðbeinum þér í gegnum 5 mínútna uppsetningu í Stillingum.',
  },
  {
    q: 'How does Jobboks compare to Jobber or Tradify?',
    qIs: 'Hvernig ber Jobboks saman við Jobber eða Tradify?',
    a: 'Jobber starts at $29/mo and Tradify at £19/user/mo — neither has a free tier. Jobboks Pro at €9/mo gives you everything a sole trader or small team needs at a fraction of the price.',
    aIs: 'Jobber byrjar á $29/mán og Tradify á £19/notanda/mán — hvorugt með ókeypis útgáfu. Jobboks Pro á €9/mán gefur þér allt sem einstaklingsverktaki eða lítið teymi þarf á broti af verðinu.',
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
    const priceId = annual
      ? (plan as { annualPriceId: string }).annualPriceId
      : (plan as { monthlyPriceId: string }).monthlyPriceId;
    setLoading(plan.id);
    try {
      const launched = await openStripeCheckout(priceId);
      if (!launched) {
        alert(t(
          'Greiðslur eru ekki virkar ennþá — við látum þig vita þegar þær opna. Sendu okkur línu á hello@jobboks.app',
          'Payments are not live yet — we\'ll notify you when they open. Drop us a line at hello@jobboks.app'
        ));
      }
    } finally {
      setLoading(null);
    }
  }

  // Dev helper — simulate plan change
  function devSetPlan(plan: 'free' | 'pro' | 'business') {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { plan } });
  }

  return (
    <div className="space-y-10 pb-16">

      {/* Header */}
      <div className="text-center pt-2">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <Crown className="w-3.5 h-3.5" />
          {t('Uppfæra áskrift', 'Upgrade your plan')}
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          {t('Einfalt verðlag. Engar bindingar.', 'Simple pricing. No lock-in.')}
        </h1>
        <p className="text-gray-500 text-sm max-w-lg mx-auto">
          {t(
            'Byrjaðu ókeypis. Uppfærðu þegar þú ert tilbúinn. 3–5× ódýrara en Jobber eða Tradify.',
            'Start free. Upgrade when you\'re ready. 3–5× cheaper than Jobber or Tradify.'
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
          <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-0.5 rounded-full">
            {t('2 mánuðir ókeypis', '2 months free')}
          </span>
        </div>
      </div>

      {/* Current plan banner */}
      {currentPlan !== 'free' && (
        <div className="max-w-3xl mx-auto bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">
            {t(
              `Þú ert á ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plani.`,
              `You are on the ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan.`
            )}{' '}
            <a href="mailto:hello@jobboks.app" className="underline font-medium">
              {t('Hafa samband til að breyta', 'Contact us to make changes')}
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
              className={`relative bg-white rounded-2xl border-2 ${plan.color} overflow-hidden shadow-sm ${isPopular ? 'shadow-lg shadow-blue-100 ring-1 ring-blue-500/20' : ''}`}>

              {isPopular && (
                <div className="absolute top-0 inset-x-0 flex justify-center">
                  <div className="bg-blue-600 text-white text-[10px] font-bold px-4 py-0.5 rounded-b-lg tracking-widest uppercase">
                    {t('Vinsælast', 'Most popular')}
                  </div>
                </div>
              )}

              {/* Card header */}
              <div className={`px-6 pt-8 pb-5 ${plan.headerBg}`}>
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${plan.badgeClass}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {lang === 'is' ? plan.nameIs : plan.name}
                </div>
                <div className={plan.textClass}>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold">€{price}</span>
                    <span className="text-sm opacity-70 mb-1.5">/{t('mán', 'mo')}</span>
                  </div>
                  {annual && price > 0 && (
                    <p className="text-xs opacity-60 mt-0.5">
                      {t(`Innheimt árlega — €${price * 12}`, `Billed annually — €${price * 12}`)}
                    </p>
                  )}
                  <p className={`text-xs mt-2 ${plan.id === 'free' ? 'text-gray-500' : 'opacity-70'}`}>
                    {lang === 'is' ? plan.taglineIs : plan.tagline}
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="px-6 py-5 space-y-2.5 flex-1">
                {plan.features.map((f, fi) => (
                  <div key={fi} className="flex items-start gap-2.5">
                    {f.included
                      ? <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      : <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />}
                    <span className={`text-sm leading-snug ${f.included ? 'text-gray-700' : 'text-gray-400'}`}>
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
                      plan.id === 'pro'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-violet-700 hover:bg-violet-800'
                    }`}>
                    {loading === plan.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        {t('Fá', 'Get')} {lang === 'is' ? plan.nameIs : plan.name}
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

      {/* Competitor comparison callout */}
      <div className="max-w-3xl mx-auto bg-blue-50 border border-blue-100 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-blue-900 mb-3 text-center">
          {t('Hvernig berum við okkur saman?', 'How do we compare?')}
        </h3>
        <div className="grid grid-cols-4 gap-2 text-xs text-center">
          <div />
          <div className="font-bold text-blue-700">Jobboks Pro<br/><span className="text-green-600">€9/mán</span></div>
          <div className="font-bold text-gray-500">Jobber<br/><span className="text-gray-400">$29/mán</span></div>
          <div className="font-bold text-gray-500">Tradify<br/><span className="text-gray-400">£19/notanda</span></div>

          {[
            ['Reikningagerð', 'Invoicing', '✅', '✅', '✅'],
            ['Vinnubók / Work Book', 'Work Book / Job diary', '✅', '✅', '✅'],
            ['Birgðir', 'Stock management', '✅', '✅', '❌'],
            ['Launaskrá', 'Payroll', '✅', '❌', '❌'],
            ['VSK skýrsla', 'VAT report', '✅', '❌', '✅'],
            ['Ókeypis útgáfa', 'Free tier', '✅', '❌', '❌'],
            ['Offline', 'Works offline', '✅', '❌', '❌'],
          ].map(([labelIs, labelEn, a, b, c], i) => (
            <>
              <div key={`l${i}`} className="text-left text-gray-600 font-medium py-1 border-t border-blue-100">
                {lang === 'is' ? labelIs : labelEn}
              </div>
              <div key={`a${i}`} className="py-1 border-t border-blue-100">{a}</div>
              <div key={`b${i}`} className="py-1 border-t border-blue-100 text-gray-400">{b}</div>
              <div key={`c${i}`} className="py-1 border-t border-blue-100 text-gray-400">{c}</div>
            </>
          ))}
        </div>
      </div>

      {/* Trust badges */}
      <div className="flex flex-wrap justify-center gap-6 text-xs text-gray-400 max-w-xl mx-auto">
        <div className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-green-500" />
          {t('Öruggar greiðslur (Stripe)', 'Secure payments (Stripe)')}
        </div>
        <div className="flex items-center gap-1.5">
          <CreditCard className="w-4 h-4 text-blue-500" />
          {t('Hægt að segja upp hvenær', 'Cancel anytime')}
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-purple-500" />
          {t('VSK innifalið í verði', 'VAT included')}
        </div>
        <div className="flex items-center gap-1.5">
          <Download className="w-4 h-4 text-orange-400" />
          {t('Öryggisafrit alltaf tiltækt', 'Full backup always available')}
        </div>
        <div className="flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-pink-400" />
          {t('Gögnin eru þín — alltaf', 'Your data — always yours')}
        </div>
        <div className="flex items-center gap-1.5">
          <Headphones className="w-4 h-4 text-teal-500" />
          {t('Stuðningur í tölvupósti', 'Email support')}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-bold text-gray-900 text-center mb-5">
          {t('Algengar spurningar', 'Frequently asked questions')}
        </h2>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left gap-3">
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
        <a href="mailto:hello@jobboks.app" className="text-blue-600 font-medium hover:underline">
          hello@jobboks.app
        </a>
      </div>

    </div>
  );
}
