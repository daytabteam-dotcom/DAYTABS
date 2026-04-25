import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const SUPPORTED_DAYTABS_LOCALES = [
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

export type DayTabsLocale = (typeof SUPPORTED_DAYTABS_LOCALES)[number];

export const DAYTABS_LOCALE_LABELS: Record<DayTabsLocale, string> = {
  en: "English",
  tr: "Turkce",
  es: "Espanol",
  fr: "Francais",
  de: "Deutsch",
  pt: "Portugues",
  it: "Italiano",
  nl: "Nederlands",
  ru: "Russkiy",
  ar: "Arabic",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

const STORAGE_KEY = "daytabs_ui_locale";

const baseCopy = {
  languageLabel: "Language",
  tabs: {
    dashboard: { label: "Home", desc: "Overview" },
    "video-analyzer": { label: "Video Analyzer", desc: "Full Analysis" },
    "script-planner": { label: "Script Planner", desc: "AI Scripts" },
    "growth-planner": { label: "YouTube Growth", desc: "Studio" },
    "youtube-audit": { label: "YouTube Audit", desc: "Studio" },
    teleprompter: { label: "Teleprompter", desc: "Read Live" },
  },
  notifications: {
    button: "Notifications",
    title: "Notifications",
    active: "active",
    empty: "No scheduled posts need attention right now.",
    dueToday: (count: number) => `${count} post${count === 1 ? "" : "s"} should be posted today.`,
    dueTodayHelper: "Click to see which cards are due.",
    overdue: (count: number) => `${count} overdue post${count === 1 ? "" : "s"} need an update.`,
    overdueHelper: "Click to see which cards need a posted URL or skipped status.",
  },
  dashboard: {
    welcome: (name: string) => `Welcome back, ${name}`,
    subtitle: "Here's what's ready for you today.",
    used: "Used",
    remaining: "Remaining",
    thisMonth: "this month",
    analysesLeft: "analyses left",
    monthlyUsageUsed: (used: number, total: number) => `${used} of ${total} monthly usage used`,
    remainingInline: (remaining: number) => `${remaining} remaining`,
    upgrade: "Upgrade",
    monthlyUsageProgress: "Monthly usage progress",
    monthlyLimitNote: (limit: number) => `Up to ${limit} video analyses each month. Longer videos may use more of your monthly usage.`,
    statUsageUsed: "Usage used",
    statUsageLeft: "Usage left",
    statScriptGenerations: "Script generations",
    statMaxDuration: "Max duration",
    perVideo: "per video",
    quickActions: "Quick Actions",
    actions: {
      analyze: { title: "Analyze a Video", desc: "Quality, editing, and publish insights" },
      script: { title: "Plan a Script", desc: "AI-powered script and shot planning" },
      teleprompter: { title: "Use Teleprompter", desc: "Read your script live on screen" },
      growth: { title: "Build Growth Calendar", desc: "Studio social strategy and weekly plans", badge: "Studio" },
      audit: { title: "Audit a YouTube Video", desc: "Paste a URL and compare it to stronger competitors", badge: "Studio" },
      upgrade: { title: "Upgrade Your Plan", desc: "Unlock more analyses and features" },
    },
    capabilities: "What DayTabs can do",
    features: {
      quality: { label: "Video Quality Analysis", desc: "Lighting, audio, framing, and pacing scores" },
      editing: { label: "Editing Suggestions", desc: "Hook moments, cut points, and B-roll cues" },
      publish: { label: "Publish Package", desc: "Optimized titles, descriptions, and tags", locked: true },
    },
  },
} as const;

type DayTabsCopy = typeof baseCopy;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const localeOverrides: Partial<Record<DayTabsLocale, DeepPartial<DayTabsCopy>>> = {
  tr: {
    languageLabel: "Dil",
    tabs: {
      dashboard: { label: "Ana Sayfa", desc: "Genel Bakis" },
      "video-analyzer": { label: "Video Analizi", desc: "Tam Analiz" },
      "script-planner": { label: "Script Planner", desc: "YZ Scriptleri" },
      "growth-planner": { label: "YouTube Buyume", desc: "Studio" },
      "youtube-audit": { label: "YouTube Denetimi", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Canli Oku" },
    },
    dashboard: {
      subtitle: "Bugun senin icin hazir olanlar burada.",
      quickActions: "Hizli Islemler",
    },
  },
  es: {
    languageLabel: "Idioma",
    tabs: {
      dashboard: { label: "Inicio", desc: "Resumen" },
      "video-analyzer": { label: "Analizador de Video", desc: "Analisis Completo" },
      "script-planner": { label: "Planificador de Guiones", desc: "Guiones IA" },
      "growth-planner": { label: "Crecimiento en YouTube", desc: "Studio" },
      "youtube-audit": { label: "Auditoria de YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Leer en Vivo" },
    },
  },
  fr: {
    languageLabel: "Langue",
    tabs: {
      dashboard: { label: "Accueil", desc: "Vue d'ensemble" },
      "video-analyzer": { label: "Analyse Video", desc: "Analyse Complete" },
      "script-planner": { label: "Planificateur de Script", desc: "Scripts IA" },
      "growth-planner": { label: "Croissance YouTube", desc: "Studio" },
      "youtube-audit": { label: "Audit YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompteur", desc: "Lire en Direct" },
    },
  },
  de: {
    languageLabel: "Sprache",
    tabs: {
      dashboard: { label: "Start", desc: "Ubersicht" },
      "video-analyzer": { label: "Videoanalyse", desc: "Vollanalyse" },
      "script-planner": { label: "Skriptplaner", desc: "KI Skripte" },
      "growth-planner": { label: "YouTube Wachstum", desc: "Studio" },
      "youtube-audit": { label: "YouTube Audit", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Live Lesen" },
    },
  },
  pt: {
    languageLabel: "Idioma",
    tabs: {
      dashboard: { label: "Inicio", desc: "Visao Geral" },
      "video-analyzer": { label: "Analisador de Video", desc: "Analise Completa" },
      "script-planner": { label: "Planejador de Roteiro", desc: "Roteiros IA" },
      "growth-planner": { label: "Crescimento no YouTube", desc: "Studio" },
      "youtube-audit": { label: "Auditoria do YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Ler ao Vivo" },
    },
  },
  it: {
    languageLabel: "Lingua",
    tabs: {
      dashboard: { label: "Home", desc: "Panoramica" },
      "video-analyzer": { label: "Analizzatore Video", desc: "Analisi Completa" },
      "script-planner": { label: "Pianificatore Script", desc: "Script IA" },
      "growth-planner": { label: "Crescita YouTube", desc: "Studio" },
      "youtube-audit": { label: "Audit YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Leggi dal Vivo" },
    },
  },
  nl: {
    languageLabel: "Taal",
    tabs: {
      dashboard: { label: "Home", desc: "Overzicht" },
      "video-analyzer": { label: "Video Analyzer", desc: "Volledige Analyse" },
      "script-planner": { label: "Scriptplanner", desc: "AI Scripts" },
      "growth-planner": { label: "YouTube Groei", desc: "Studio" },
      "youtube-audit": { label: "YouTube Audit", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Live Lezen" },
    },
  },
  ru: {
    languageLabel: "Yazyk",
    tabs: {
      dashboard: { label: "Glavnaya", desc: "Obzor" },
      "video-analyzer": { label: "Analiz Video", desc: "Polnyy Analiz" },
      "script-planner": { label: "Planner Stsenariya", desc: "AI Skripty" },
      "growth-planner": { label: "Rost YouTube", desc: "Studio" },
      "youtube-audit": { label: "Audit YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Chitat V Pryamom Efire" },
    },
  },
  ar: {
    languageLabel: "اللغة",
    tabs: {
      dashboard: { label: "الرئيسية", desc: "نظرة عامة" },
      "video-analyzer": { label: "محلل الفيديو", desc: "تحليل كامل" },
      "script-planner": { label: "مخطط السكربت", desc: "سكريبتات الذكاء الاصطناعي" },
      "growth-planner": { label: "نمو يوتيوب", desc: "الاستوديو" },
      "youtube-audit": { label: "تدقيق يوتيوب", desc: "الاستوديو" },
      teleprompter: { label: "التلقين", desc: "قراءة مباشرة" },
    },
  },
  hi: {
    languageLabel: "भाषा",
    tabs: {
      dashboard: { label: "होम", desc: "सारांश" },
      "video-analyzer": { label: "वीडियो विश्लेषक", desc: "पूर्ण विश्लेषण" },
      "script-planner": { label: "स्क्रिप्ट प्लानर", desc: "एआई स्क्रिप्ट्स" },
      "growth-planner": { label: "यूट्यूब ग्रोथ", desc: "स्टूडियो" },
      "youtube-audit": { label: "यूट्यूब ऑडिट", desc: "स्टूडियो" },
      teleprompter: { label: "टेलीप्रॉम्प्टर", desc: "लाइव पढ़ें" },
    },
  },
  ja: {
    languageLabel: "言語",
    tabs: {
      dashboard: { label: "ホーム", desc: "概要" },
      "video-analyzer": { label: "動画分析", desc: "完全分析" },
      "script-planner": { label: "スクリプトプランナー", desc: "AIスクリプト" },
      "growth-planner": { label: "YouTube成長", desc: "スタジオ" },
      "youtube-audit": { label: "YouTube監査", desc: "スタジオ" },
      teleprompter: { label: "テレプロンプター", desc: "ライブ表示" },
    },
  },
  ko: {
    languageLabel: "언어",
    tabs: {
      dashboard: { label: "홈", desc: "개요" },
      "video-analyzer": { label: "비디오 분석기", desc: "전체 분석" },
      "script-planner": { label: "스크립트 플래너", desc: "AI 스크립트" },
      "growth-planner": { label: "유튜브 성장", desc: "스튜디오" },
      "youtube-audit": { label: "유튜브 감사", desc: "스튜디오" },
      teleprompter: { label: "텔레프롬프터", desc: "라이브 읽기" },
    },
  },
  zh: {
    languageLabel: "语言",
    tabs: {
      dashboard: { label: "首页", desc: "概览" },
      "video-analyzer": { label: "视频分析", desc: "完整分析" },
      "script-planner": { label: "脚本规划", desc: "AI 脚本" },
      "growth-planner": { label: "YouTube 增长", desc: "工作室" },
      "youtube-audit": { label: "YouTube 审核", desc: "工作室" },
      teleprompter: { label: "提词器", desc: "实时阅读" },
    },
  },
};

function mergeCopy<T extends Record<string, unknown>>(base: T, override?: DeepPartial<T>): T {
  if (!override) return base;
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideValue = override[key];
    if (overrideValue === undefined) continue;
    const baseValue = base[key];
    if (
      overrideValue
      && baseValue
      && typeof overrideValue === "object"
      && typeof baseValue === "object"
      && !Array.isArray(overrideValue)
      && !Array.isArray(baseValue)
    ) {
      result[key as string] = mergeCopy(baseValue as Record<string, unknown>, overrideValue as DeepPartial<Record<string, unknown>>);
    } else {
      result[key as string] = overrideValue;
    }
  }
  return result as T;
}

const DayTabsI18nContext = createContext<{
  locale: DayTabsLocale;
  setLocale: (locale: DayTabsLocale) => void;
  copy: DayTabsCopy;
} | null>(null);

function normalizeLocale(input?: string | null): DayTabsLocale {
  if (!input) return "en";
  const lowered = input.trim().toLowerCase();
  const base = lowered.split(/[-_]/)[0] as DayTabsLocale;
  return SUPPORTED_DAYTABS_LOCALES.includes(base) ? base : "en";
}

function detectInitialLocale(): DayTabsLocale {
  if (typeof window === "undefined") return "en";
  const stored = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  if (window.localStorage.getItem(STORAGE_KEY)) return stored;
  return normalizeLocale(window.navigator.language);
}

export function DayTabsI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<DayTabsLocale>(() => detectInitialLocale());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale: (nextLocale: DayTabsLocale) => setLocaleState(normalizeLocale(nextLocale)),
    copy: mergeCopy(baseCopy, localeOverrides[locale]),
  }), [locale]);

  return <DayTabsI18nContext.Provider value={value}>{children}</DayTabsI18nContext.Provider>;
}

export function useDayTabsI18n() {
  const context = useContext(DayTabsI18nContext);
  if (!context) throw new Error("useDayTabsI18n must be used within DayTabsI18nProvider");
  return context;
}
