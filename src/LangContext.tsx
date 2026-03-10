import { createContext, useContext } from 'react';
import type { Lang, TranslationKey } from './i18n';
import { t } from './i18n';

export const LangContext = createContext<Lang>('ja');

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): (key: TranslationKey, params?: Record<string, string>) => string {
  const lang = useLang();
  return (key, params) => t(key, lang, params);
}
