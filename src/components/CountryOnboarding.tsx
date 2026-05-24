import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { COUNTRY_LIST, COUNTRY_CONFIGS } from '../data/countries';
import { Language } from '../types';

export default function CountryOnboarding() {
  const { dispatch } = useApp();
  const [selectedCode, setSelectedCode] = useState('');
  const [lang, setLang] = useState<Language>('en');

  const COUNTRY_LANG: Record<string, Language> = {
    IS: 'is', DE: 'de', FR: 'fr', NL: 'nl', NO: 'no', DK: 'da', SE: 'sv',
  };

  function handleCountrySelect(code: string) {
    setSelectedCode(code);
    if (COUNTRY_LANG[code]) setLang(COUNTRY_LANG[code]);
  }

  const ONBOARDING_STRINGS: Record<Language, { title: string; subtitle: string; usNote: string; start: string }> = {
    is: { title: 'Veldu land / umdæmi', subtitle: 'Stillir sjálfgefið gjaldmiðil, VSK-hlutföll og launareglur', usNote: '🇺🇸 Bandaríkin: Söluskattur er mismunandi eftir ríki. Þú getur stillt hlutfallið í Stillingum.', start: 'Hefja notkun' },
    en: { title: 'Choose your country / jurisdiction', subtitle: 'Sets default currency, tax rates and payroll rules', usNote: '🇺🇸 United States: Sales tax varies by state. You can set your rate in Settings after setup.', start: 'Get started' },
    de: { title: 'Land / Zuständigkeit wählen', subtitle: 'Setzt Standardwährung, Steuersätze und Lohnregeln', usNote: '🇺🇸 USA: Die Umsatzsteuer variiert je nach Bundesstaat. Sie können den Satz in den Einstellungen festlegen.', start: 'Loslegen' },
    fr: { title: 'Choisissez votre pays / juridiction', subtitle: 'Définit la devise, les taux de TVA et les règles de paie', usNote: '🇺🇸 États-Unis : La taxe de vente varie selon l\'État. Vous pouvez définir votre taux dans les paramètres.', start: 'Commencer' },
    nl: { title: 'Kies uw land / rechtsgebied', subtitle: 'Stelt standaardvaluta, BTW-tarieven en loonregels in', usNote: '🇺🇸 VS: De omzetbelasting varieert per staat. U kunt uw tarief instellen in Instellingen.', start: 'Aan de slag' },
    no: { title: 'Velg land / jurisdiksjon', subtitle: 'Angir standardvaluta, MVA-satser og lønnsregler', usNote: '🇺🇸 USA: Omsetningsavgiften varierer etter stat. Du kan sette satsen i Innstillinger.', start: 'Kom i gang' },
    da: { title: 'Vælg land / jurisdiktion', subtitle: 'Angiver standardvaluta, momssatser og lønregler', usNote: '🇺🇸 USA: Salgsafgiften varierer efter stat. Du kan indstille satsen i Indstillinger.', start: 'Kom i gang' },
    sv: { title: 'Välj land / jurisdiktion', subtitle: 'Ställer in standardvaluta, momssatser och löneregler', usNote: '🇺🇸 USA: Omsättningsskatten varierar per delstat. Du kan ställa in satsen i Inställningar.', start: 'Kom igång' },
  };
  const ob = ONBOARDING_STRINGS[lang] ?? ONBOARDING_STRINGS['en'];

  function handleStart() {
    if (!selectedCode) return;
    const cc = COUNTRY_CONFIGS[selectedCode];
    dispatch({ type: 'UPDATE_SETTINGS', payload: {
      country: selectedCode,
      language: lang,
      defaultCurrency: cc.currency,
      taxWithholdingRate: cc.taxWithholdingRate,
      employeePensionRate: cc.employeePensionRate,
      employerPensionRate: cc.employerPensionRate,
      socialInsuranceRate: cc.socialInsuranceRate,
      personalDeductionMonthly: cc.personalDeductionMonthly,
      vatRates: cc.vatRates,
      standardRate: cc.standardRate,
      vatTerm: cc.vatTerm,
      taxAuthority: cc.taxAuthority,
      companyIdLabel: cc.companyIdLabel,
      vatNumberLabel: cc.vatNumberLabel,
    }});
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900 to-blue-700 flex flex-col items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 md:p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <BookOpen className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Bókhald</h1>
        </div>

        {/* Language picker */}
        <div className="flex justify-center mb-6">
          <select value={lang} onChange={e => setLang(e.target.value as Language)}
            className="px-4 py-1.5 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-700 focus:border-blue-500 focus:outline-none">
            <option value="is">🇮🇸 Íslenska</option>
            <option value="en">🇬🇧 English</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="nl">🇳🇱 Nederlands</option>
            <option value="no">🇳🇴 Norsk</option>
            <option value="da">🇩🇰 Dansk</option>
            <option value="sv">🇸🇪 Svenska</option>
          </select>
        </div>

        <h2 className="text-lg font-bold text-gray-900 text-center mb-1">{ob.title}</h2>
        <p className="text-sm text-gray-500 text-center mb-5">{ob.subtitle}</p>

        {/* Country grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 max-h-72 overflow-y-auto pr-1">
          {COUNTRY_LIST.map(cc => (
            <button key={cc.code} onClick={() => handleCountrySelect(cc.code)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                selectedCode === cc.code
                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <span className="text-2xl flex-shrink-0">{cc.flag}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{cc.nameEn}</div>
                <div className="text-xs text-gray-400">{cc.currency} · {cc.vatTerm}</div>
              </div>
            </button>
          ))}
        </div>

        {/* US note */}
        {selectedCode === 'US' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-800">
            {ob.usNote}
          </div>
        )}

        <button onClick={handleStart} disabled={!selectedCode}
          className="w-full bg-blue-600 text-white py-3 rounded-xl text-base font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors">
          {ob.start}
        </button>
      </div>
    </div>
  );
}
