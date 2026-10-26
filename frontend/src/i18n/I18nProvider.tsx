import { createContext, createElement, PropsWithChildren, useCallback, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, messages, SupportedLocale, SUPPORTED_LOCALES, TranslationKey } from './messages';

const STORAGE_KEY = 'nexusforge.locale';
const OVERRIDES_STORAGE_KEY = 'nexusforge.locale.overrides';

type LocaleOverrides = Partial<Record<SupportedLocale, Record<string, string>>>;

type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey) => string;
  supportedLocales: SupportedLocale[];
  exportDictionary: () => string;
  importDictionary: (json: string) => void;
  resetDictionary: () => void;
};

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function getStoredLocale(): SupportedLocale {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'fr' || raw === 'en' || raw === 'de' || raw === 'es') {
    return raw;
  }
  return DEFAULT_LOCALE;
}

function getStoredOverrides(): LocaleOverrides {
  const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as LocaleOverrides;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => getStoredLocale());
  const [overrides, setOverrides] = useState<LocaleOverrides>(() => getStoredOverrides());

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const exportDictionary = useCallback(() => JSON.stringify(overrides, null, 2), [overrides]);

  const importDictionary = useCallback((json: string) => {
    const parsed = JSON.parse(json) as LocaleOverrides;
    const normalized: LocaleOverrides = {};
    for (const localeKey of SUPPORTED_LOCALES) {
      const row = parsed?.[localeKey];
      if (!row || typeof row !== 'object') {
        continue;
      }
      const cleanRow: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string') {
          cleanRow[key] = value;
        }
      }
      normalized[localeKey] = cleanRow;
    }
    setOverrides(normalized);
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(normalized));
  }, []);

  const resetDictionary = useCallback(() => {
    setOverrides({});
    localStorage.removeItem(OVERRIDES_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      supportedLocales: SUPPORTED_LOCALES,
      t: (key: TranslationKey) =>
        overrides[locale]?.[key] ?? messages[locale][key] ?? overrides[DEFAULT_LOCALE]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key,
      exportDictionary,
      importDictionary,
      resetDictionary
    }),
    [exportDictionary, importDictionary, locale, overrides, resetDictionary, setLocale]
  );

  return createElement(I18nContext.Provider, { value }, children);
}
