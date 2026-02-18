import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';
i18n
    .use(HttpApi)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
    supportedLngs: ['en', 'ru', 'kz'],
    fallbackLng: 'ru',
    detection: {
        order: ['localStorage', 'cookie', 'htmlTag', 'path', 'subdomain'],
        caches: ['localStorage', 'cookie'],
    },
    backend: {
        loadPath: '/locales/{{lng}}/translation.json',
    },
    react: {
        useSuspense: true,
    },
});
export type Language = 'en' | 'ru' | 'kz';
export const t = i18n.t.bind(i18n);
export const setLanguage = (lng: Language) => {
    return i18n.changeLanguage(lng);
};
export const getLanguage = (): Language => {
    return (i18n.language || i18n.options.fallbackLng || 'ru') as Language;
};
export default i18n;
