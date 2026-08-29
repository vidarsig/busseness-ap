// Re-exports the REAL app code the test bench drives, so the bench can never
// drift into testing a copy. If a prompt or a parser changes in src/, the bench
// picks it up on the next build with no edit here.
export { buildChatSystem, buildContext, streamClaude, categorizeBatch, detectImportColumns, generateInsights, detectYear, txPool } from '../../src/utils/ai';
export { findHeaderMap, parseBank, stampBankDirection } from '../../src/components/BankImport';
export {
  DEFAULT_ACCOUNTS, DEFAULT_SETTINGS, DEFAULT_COMPANY,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES,
} from '../../src/types';
export { calcProfitLoss, calcVATSummary, calcVAT } from '../../src/utils/calculations';
export { COUNTRY_CONFIGS, US_STATES, CA_PROVINCES, languageForCountry } from '../../src/data/countries';
export { translations } from '../../src/i18n/translations';
