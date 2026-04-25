import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type DayTabsLocale = "en" | "tr";

const STORAGE_KEY = "daytabs_ui_locale";

const copy = {
  en: {
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
  },
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
    notifications: {
      button: "Bildirimler",
      title: "Bildirimler",
      active: "aktif",
      empty: "Su anda ilgilenmeniz gereken planli bir gonderi yok.",
      dueToday: (count: number) => `Bugun paylasilmasi gereken ${count} gonderi var.`,
      dueTodayHelper: "Hangi kartlarin bugun planli oldugunu gormek icin tiklayin.",
      overdue: (count: number) => `Guncellenmesi gereken ${count} gecikmis gonderi var.`,
      overdueHelper: "URL eklenmesi veya atlandi durumuna alinmasi gereken kartlari gormek icin tiklayin.",
    },
    dashboard: {
      welcome: (name: string) => `Tekrar hos geldin, ${name}`,
      subtitle: "Bugun senin icin hazir olanlar burada.",
      used: "Kullanilan",
      remaining: "Kalan",
      thisMonth: "bu ay",
      analysesLeft: "analiz hakki kaldi",
      monthlyUsageUsed: (used: number, total: number) => `Aylik kullanimin ${used} / ${total}`,
      remainingInline: (remaining: number) => `${remaining} hak kaldi`,
      upgrade: "Yukselt",
      monthlyUsageProgress: "Aylik kullanim ilerlemesi",
      monthlyLimitNote: (limit: number) => `Her ay en fazla ${limit} video analizi. Daha uzun videolar aylik kullanimindan daha fazla harcayabilir.`,
      statUsageUsed: "Kullanilan hak",
      statUsageLeft: "Kalan hak",
      statScriptGenerations: "Script uretimi",
      statMaxDuration: "Maks sure",
      perVideo: "video basina",
      quickActions: "Hizli Islemler",
      actions: {
        analyze: { title: "Video Analiz Et", desc: "Kalite, kurgu ve yayin icgoruleri" },
        script: { title: "Script Planla", desc: "YZ destekli script ve cekim plani" },
        teleprompter: { title: "Teleprompter Kullan", desc: "Scriptini ekranda canli oku" },
        growth: { title: "Buyume Takvimi Olustur", desc: "Studio stratejisi ve haftalik planlar", badge: "Studio" },
        audit: { title: "YouTube Videosunu Denetle", desc: "URL yapistir ve daha guclu rakiplerle karsilastir", badge: "Studio" },
        upgrade: { title: "Planini Yukselt", desc: "Daha fazla analiz ve ozelligin kilidini ac" },
      },
      capabilities: "DayTabs neler yapabilir",
      features: {
        quality: { label: "Video Kalite Analizi", desc: "Isik, ses, kadraj ve tempo puanlari" },
        editing: { label: "Kurgu Onerileri", desc: "Hook anlari, kesim noktalari ve B-roll ipuclari" },
        publish: { label: "Yayin Paketi", desc: "Optimize basliklar, aciklamalar ve etiketler", locked: true },
      },
    },
  },
} as const;

type DayTabsCopy = (typeof copy)[DayTabsLocale];

const DayTabsI18nContext = createContext<{
  locale: DayTabsLocale;
  setLocale: (locale: DayTabsLocale) => void;
  copy: DayTabsCopy;
} | null>(null);

function detectInitialLocale(): DayTabsLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "tr") return stored;
  return window.navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function DayTabsI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<DayTabsLocale>(() => detectInitialLocale());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale: (nextLocale: DayTabsLocale) => setLocaleState(nextLocale),
    copy: copy[locale],
  }), [locale]);

  return <DayTabsI18nContext.Provider value={value}>{children}</DayTabsI18nContext.Provider>;
}

export function useDayTabsI18n() {
  const context = useContext(DayTabsI18nContext);
  if (!context) throw new Error("useDayTabsI18n must be used within DayTabsI18nProvider");
  return context;
}
