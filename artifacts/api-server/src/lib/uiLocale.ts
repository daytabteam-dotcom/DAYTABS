import type { Request } from "express";

export const SUPPORTED_UI_LOCALES = [
  "en",
  "tr",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "ru",
  "ar",
  "hi",
  "ja",
  "ko",
  "zh",
] as const;

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export function normalizeUiLocale(input?: string | null): UiLocale | null {
  if (!input) return null;
  const lowered = input.trim().toLowerCase();
  if (!lowered) return null;
  const base = lowered.split(/[,;]+/)[0]?.trim() ?? "";
  const code = (base.split(/[-_]/)[0] ?? "").trim() as UiLocale;
  return SUPPORTED_UI_LOCALES.includes(code) ? code : null;
}

export function getUiLocaleFromRequest(req: Request): UiLocale | null {
  const explicit = normalizeUiLocale(req.get("x-daytabs-locale"));
  if (explicit) return explicit;
  return normalizeUiLocale(req.get("accept-language"));
}

export function languageNameFromLocale(locale: UiLocale): string {
  if (locale === "zh") return "Chinese";
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    return displayNames.of(locale) || "English";
  } catch {
    const fallback: Record<UiLocale, string> = {
      en: "English",
      tr: "Turkish",
      es: "Spanish",
      fr: "French",
      de: "German",
      pt: "Portuguese",
      it: "Italian",
      nl: "Dutch",
      ru: "Russian",
      ar: "Arabic",
      hi: "Hindi",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
    };
    return fallback[locale] || "English";
  }
}

export function buildUserFacingOutputLanguageInstruction(locale: UiLocale): string {
  if (locale === "en") {
    return "Write every user-facing string value in English. Do not use any other language.";
  }
  const name = languageNameFromLocale(locale);
  return `Write every user-facing string value in ${name}. Do not translate the response to English.`;
}

