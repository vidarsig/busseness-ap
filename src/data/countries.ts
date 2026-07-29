import { CountryConfig } from '../types';

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IS: {
    code: 'IS', flag: '🇮🇸', nameEn: 'Iceland',
    currency: 'ISK', vatTerm: 'VSK', vatRates: [24, 11, 0], standardRate: 24,
    taxAuthority: 'RSK', companyIdLabel: 'Kennitala', vatNumberLabel: 'VSK-númer',
    isUSA: false,
    taxWithholdingRate: 36.94, employeePensionRate: 4, employerPensionRate: 11.5,
    socialInsuranceRate: 6.35, personalDeductionMonthly: 62596,
  },
  GB: {
    code: 'GB', flag: '🇬🇧', nameEn: 'United Kingdom',
    currency: 'GBP', vatTerm: 'VAT', vatRates: [20, 5, 0], standardRate: 20,
    taxAuthority: 'HMRC', companyIdLabel: 'Company No.', vatNumberLabel: 'VAT No.',
    isUSA: false,
    taxWithholdingRate: 20, employeePensionRate: 5, employerPensionRate: 3,
    socialInsuranceRate: 13.8, personalDeductionMonthly: 1048,
  },
  US: {
    code: 'US', flag: '🇺🇸', nameEn: 'United States',
    currency: 'USD', vatTerm: 'Sales Tax', vatRates: [0], standardRate: 0,
    taxAuthority: 'IRS', companyIdLabel: 'EIN', vatNumberLabel: 'Tax ID',
    isUSA: true,
    taxWithholdingRate: 22, employeePensionRate: 6.2, employerPensionRate: 6.2,
    socialInsuranceRate: 1.45, personalDeductionMonthly: 1077,
  },
  DE: {
    code: 'DE', flag: '🇩🇪', nameEn: 'Germany',
    currency: 'EUR', vatTerm: 'MwSt', vatRates: [19, 7, 0], standardRate: 19,
    taxAuthority: 'Finanzamt', companyIdLabel: 'Steuernummer', vatNumberLabel: 'USt-IdNr.',
    isUSA: false,
    taxWithholdingRate: 25, employeePensionRate: 9.3, employerPensionRate: 9.3,
    socialInsuranceRate: 7.3, personalDeductionMonthly: 1000,
  },
  FR: {
    code: 'FR', flag: '🇫🇷', nameEn: 'France',
    currency: 'EUR', vatTerm: 'TVA', vatRates: [20, 10, 5.5, 0], standardRate: 20,
    taxAuthority: 'DGFiP', companyIdLabel: 'SIRET', vatNumberLabel: 'N° TVA',
    isUSA: false,
    taxWithholdingRate: 20, employeePensionRate: 11.31, employerPensionRate: 16.01,
    socialInsuranceRate: 7, personalDeductionMonthly: 1000,
  },
  NL: {
    code: 'NL', flag: '🇳🇱', nameEn: 'Netherlands',
    currency: 'EUR', vatTerm: 'BTW', vatRates: [21, 9, 0], standardRate: 21,
    taxAuthority: 'Belastingdienst', companyIdLabel: 'KvK', vatNumberLabel: 'BTW-nummer',
    isUSA: false,
    taxWithholdingRate: 36.93, employeePensionRate: 4.5, employerPensionRate: 5,
    socialInsuranceRate: 6.7, personalDeductionMonthly: 800,
  },
  NO: {
    code: 'NO', flag: '🇳🇴', nameEn: 'Norway',
    currency: 'NOK', vatTerm: 'MVA', vatRates: [25, 15, 12, 0], standardRate: 25,
    taxAuthority: 'Skatteetaten', companyIdLabel: 'Org.nr', vatNumberLabel: 'MVA-nr',
    isUSA: false,
    taxWithholdingRate: 22, employeePensionRate: 2, employerPensionRate: 14.1,
    socialInsuranceRate: 5, personalDeductionMonthly: 7000,
  },
  DK: {
    code: 'DK', flag: '🇩🇰', nameEn: 'Denmark',
    currency: 'DKK', vatTerm: 'MOMS', vatRates: [25, 0], standardRate: 25,
    taxAuthority: 'Skat', companyIdLabel: 'CVR', vatNumberLabel: 'SE-nummer',
    isUSA: false,
    taxWithholdingRate: 38, employeePensionRate: 4, employerPensionRate: 8,
    socialInsuranceRate: 0, personalDeductionMonthly: 3900,
  },
  SE: {
    code: 'SE', flag: '🇸🇪', nameEn: 'Sweden',
    currency: 'SEK', vatTerm: 'MOMS', vatRates: [25, 12, 6, 0], standardRate: 25,
    taxAuthority: 'Skatteverket', companyIdLabel: 'Org.nr', vatNumberLabel: 'Momsreg.nr',
    isUSA: false,
    taxWithholdingRate: 30, employeePensionRate: 4.5, employerPensionRate: 31.42,
    socialInsuranceRate: 0, personalDeductionMonthly: 4000,
  },
  AU: {
    code: 'AU', flag: '🇦🇺', nameEn: 'Australia',
    currency: 'AUD', vatTerm: 'GST', vatRates: [10, 0], standardRate: 10,
    taxAuthority: 'ATO', companyIdLabel: 'ABN', vatNumberLabel: 'ABN',
    isUSA: false,
    taxWithholdingRate: 32.5, employeePensionRate: 11.5, employerPensionRate: 0,
    socialInsuranceRate: 0, personalDeductionMonthly: 1500,
  },
  CA: {
    code: 'CA', flag: '🇨🇦', nameEn: 'Canada',
    currency: 'CAD', vatTerm: 'GST/HST', vatRates: [15, 13, 12, 5, 0], standardRate: 15,
    taxAuthority: 'CRA', companyIdLabel: 'Business No.', vatNumberLabel: 'GST/HST No.',
    isUSA: false,
    taxWithholdingRate: 20.5, employeePensionRate: 5.95, employerPensionRate: 5.95,
    socialInsuranceRate: 1.66, personalDeductionMonthly: 1307,
  },
  NZ: {
    code: 'NZ', flag: '🇳🇿', nameEn: 'New Zealand',
    currency: 'NZD', vatTerm: 'GST', vatRates: [15, 0], standardRate: 15,
    taxAuthority: 'IRD', companyIdLabel: 'IRD No.', vatNumberLabel: 'GST No.',
    isUSA: false,
    taxWithholdingRate: 33, employeePensionRate: 3, employerPensionRate: 3,
    socialInsuranceRate: 0, personalDeductionMonthly: 1200,
  },
};

export const COUNTRY_LIST = Object.values(COUNTRY_CONFIGS);

// Canada provinces/territories with their COMBINED sales-tax rate (%) — GST 5%
// everywhere, plus HST (single rate) or a separate PST/QST. GST/HST is a value-added
// tax (recoverable), so the app's VAT engine applies (unlike US sales tax). Rates
// verified for 2026 (Nova Scotia dropped to 14% on 1 Apr 2025). `type` is informational.
// Single source of truth: used by Settings (picker) and the AI concierge setup.
export interface CaProvince { code: string; name: string; rate: number; type: string; }
export const CA_PROVINCES: CaProvince[] = [
  { code: 'AB', name: 'Alberta', rate: 5, type: 'GST' },
  { code: 'BC', name: 'British Columbia', rate: 12, type: 'GST + PST' },
  { code: 'MB', name: 'Manitoba', rate: 12, type: 'GST + PST' },
  { code: 'NB', name: 'New Brunswick', rate: 15, type: 'HST' },
  { code: 'NL', name: 'Newfoundland and Labrador', rate: 15, type: 'HST' },
  { code: 'NT', name: 'Northwest Territories', rate: 5, type: 'GST' },
  { code: 'NS', name: 'Nova Scotia', rate: 14, type: 'HST' },
  { code: 'NU', name: 'Nunavut', rate: 5, type: 'GST' },
  { code: 'ON', name: 'Ontario', rate: 13, type: 'HST' },
  { code: 'PE', name: 'Prince Edward Island', rate: 15, type: 'HST' },
  { code: 'QC', name: 'Quebec', rate: 14.975, type: 'GST + QST' },
  { code: 'SK', name: 'Saskatchewan', rate: 11, type: 'GST + PST' },
  { code: 'YT', name: 'Yukon', rate: 5, type: 'GST' },
];

// US states with their BASE state sales-tax rate (%). Local (city/county) rates can
// add on top — the contractor can override in Settings. NB: AK/DE/MT/NH/OR have NO
// state sales tax (0). Single source of truth: Settings picker + onboarding + AI setup.
export interface UsState { name: string; rate: number; }
export const US_STATES: UsState[] = [
  { name: 'Alabama', rate: 4 }, { name: 'Alaska', rate: 0 }, { name: 'Arizona', rate: 5.6 },
  { name: 'Arkansas', rate: 6.5 }, { name: 'California', rate: 7.25 }, { name: 'Colorado', rate: 2.9 },
  { name: 'Connecticut', rate: 6.35 }, { name: 'Delaware', rate: 0 }, { name: 'Florida', rate: 6 },
  { name: 'Georgia', rate: 4 }, { name: 'Hawaii', rate: 4 }, { name: 'Idaho', rate: 6 },
  { name: 'Illinois', rate: 6.25 }, { name: 'Indiana', rate: 7 }, { name: 'Iowa', rate: 6 },
  { name: 'Kansas', rate: 6.5 }, { name: 'Kentucky', rate: 6 }, { name: 'Louisiana', rate: 4.45 },
  { name: 'Maine', rate: 5.5 }, { name: 'Maryland', rate: 6 }, { name: 'Massachusetts', rate: 6.25 },
  { name: 'Michigan', rate: 6 }, { name: 'Minnesota', rate: 6.875 }, { name: 'Mississippi', rate: 7 },
  { name: 'Missouri', rate: 4.225 }, { name: 'Montana', rate: 0 }, { name: 'Nebraska', rate: 5.5 },
  { name: 'Nevada', rate: 6.85 }, { name: 'New Hampshire', rate: 0 }, { name: 'New Jersey', rate: 6.625 },
  { name: 'New Mexico', rate: 4.875 }, { name: 'New York', rate: 4 }, { name: 'North Carolina', rate: 4.75 },
  { name: 'North Dakota', rate: 5 }, { name: 'Ohio', rate: 5.75 }, { name: 'Oklahoma', rate: 4.5 },
  { name: 'Oregon', rate: 0 }, { name: 'Pennsylvania', rate: 6 }, { name: 'Rhode Island', rate: 7 },
  { name: 'South Carolina', rate: 6 }, { name: 'South Dakota', rate: 4.2 }, { name: 'Tennessee', rate: 7 },
  { name: 'Texas', rate: 6.25 }, { name: 'Utah', rate: 6.1 }, { name: 'Vermont', rate: 6 },
  { name: 'Virginia', rate: 5.3 }, { name: 'Washington', rate: 6.5 }, { name: 'West Virginia', rate: 6 },
  { name: 'Wisconsin', rate: 5 }, { name: 'Wyoming', rate: 4 }, { name: 'District of Columbia', rate: 6 },
];

// Look up a province by its full name OR 2-letter code (case-insensitive), so both
// the Settings dropdown and an AI-supplied "Ontario" / "ON" resolve to the same entry.
export function findCaProvince(nameOrCode: string): CaProvince | null {
  const q = (nameOrCode || '').trim().toLowerCase();
  if (!q) return null;
  return CA_PROVINCES.find(p => p.name.toLowerCase() === q || p.code.toLowerCase() === q) ?? null;
}
