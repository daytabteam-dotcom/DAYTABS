import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type LandingLocale = "en" | "tr";

const STORAGE_KEY = "daytabs_marketing_locale";

const copy = {
  en: {
    languageLabel: "Language",
    nav: {
      features: "Features",
      howItWorks: "How It Works",
      blog: "Blog",
      pricing: "Pricing",
      refunds: "Refunds",
      contact: "Contact",
      login: "Login",
      getStarted: "Get Started",
    },
    hero: {
      badge: "AI-Powered Video Analysis Platform",
      titleLead: "DayTabs AI Video Analysis for",
      titleAccent: "Content Creators",
      description:
        "DayTabs gives YouTube, TikTok, and Instagram creators AI video analysis, YouTube SEO help, title and tag suggestions, short clip ideas, and content planning in one workflow.",
      primaryCta: "Get Started Free",
      secondaryCta: "See How It Works",
    },
    howItWorks: {
      titleLead: "How",
      titleAccent: "DayTabs Works",
      subtitle: "From upload to insight in three simple steps.",
      link: "How it works ->",
      steps: [
        {
          title: "Upload Your Video",
          desc: "Drop long-form or short-form videos and get plan-aware upload support up to 5GB on Pro.",
        },
        {
          title: "AI Analyzes Every Detail",
          desc: "Our AI extracts audio, transcribes speech, analyzes frames, and generates comprehensive insights in minutes.",
        },
        {
          title: "Get Actionable Insights",
          desc: "Receive a full dashboard with Quality, Content, SEO, and Subtitle tabs, each with specific, actionable recommendations.",
        },
      ],
    },
    advanced: {
      titleLead: "Advanced",
      titleAccent: "Capabilities",
      subtitle: "Go beyond analysis with trend-aware planning and publishing support",
      cards: [
        { title: "Transcript Generation", desc: "Full speech-to-text with timestamps, perfect for captions and subtitles." },
        { title: "Growth Planner", desc: "Build weekly content calendars from niche trends, profile signals, and platform cadence." },
        { title: "Competitor Insights", desc: "Spot real accounts and formats worth learning from before planning your next posts." },
      ],
    },
    featuresSection: {
      titleLead: "Everything You Need to",
      titleAccent: "Grow Your Channel",
      subtitle:
        "A complete toolkit for serious YouTube, TikTok, and Instagram creators, with AI video analysis, YouTube SEO guidance, title and tag suggestions, and content planning built into one dashboard.",
      link: "See all features ->",
      features: [
        { title: "Quality Analysis", desc: "Lighting, sound clarity, video resolution, and technical performance scored instantly." },
        { title: "Content Feedback", desc: "AI-powered hooks, storytelling analysis, pacing, and audience engagement insights." },
        { title: "SEO Intelligence", desc: "Title suggestions, keywords, hashtags, and discoverability scores for every platform." },
        { title: "Content Growth", desc: "Turn trend signals into weekly content plans for every platform you publish on." },
        { title: "Multi-Platform", desc: "Optimized analysis for YouTube, TikTok, Instagram, LinkedIn, and X." },
        { title: "Privacy First", desc: "Your videos are processed securely and never stored longer than needed." },
      ],
    },
    receive: {
      titleLead: "What You",
      titleAccent: "Receive",
      subtitle:
        "DayTabs is a web-based subscription product for creators who want visible, actionable AI video analysis, publish-ready title and tag suggestions, and ongoing content planning help.",
      cards: [
        {
          title: "Per-video analysis report",
          desc: "A structured report in your DayTabs dashboard covering quality, editing, pacing, content feedback, and platform-ready recommendations.",
        },
        {
          title: "Publish package outputs",
          desc: "Depending on your plan, DayTabs can generate title and tag suggestions, descriptions, hooks, and short clip ideas to speed up publishing.",
        },
        {
          title: "Monthly usage limits by plan",
          desc: "Each subscription clearly states how many videos you can analyze, your file-size limits, duration limits, and planning capacity.",
        },
      ],
    },
    platformsSection: {
      titleLead: "Built for",
      titleAccent: "Every Platform",
      subtitle:
        "Whether you publish long-form on YouTube or short-form on TikTok, Instagram Reels, LinkedIn, or Twitter, DayTabs adapts AI video analysis, YouTube SEO recommendations, and content planning to each platform in a single report.",
    },
    termsSection: {
      titleLead: "Built Around the",
      titleAccent: "Terms Creators Search For",
      subtitle:
        "If you are looking for AI video analysis, YouTube SEO, title and tag suggestions, or content planning for YouTube, TikTok, and Instagram creators, DayTabs brings those workflows together in one creator dashboard.",
      cards: [
        { title: "AI video analysis for real uploads", desc: "Review actual videos for quality, pacing, hooks, clarity, and editing issues instead of relying on generic prompts alone." },
        { title: "YouTube SEO and metadata support", desc: "Generate stronger titles, descriptions, timestamps, and tag suggestions based on what is actually inside your video." },
        { title: "Short-form planning for TikTok and Instagram", desc: "Find clip-worthy moments, angles, and publishing ideas tailored to short-form creators and repurposing workflows." },
        { title: "Weekly content planning", desc: "Turn performance data, trends, and competitor signals into a weekly content planning workflow you can publish from." },
      ],
    },
    blog: {
      eyebrow: "From the blog",
      cta: "Read our YouTube SEO guide ->",
    },
    faq: {
      titleLead: "Frequently Asked",
      titleAccent: "Questions",
      subtitle: "Everything you need to know before getting started.",
      items: [
        {
          q: "How does DayTabs analyze my video?",
          a: "You upload your video and DayTabs analyzes it with top models and platform algorithms in mind, then gives you a complete report with clear feedback to help improve your videos.",
        },
        {
          q: "Is my video stored on your servers?",
          a: "No. Videos are deleted immediately after analysis completes. Only your transcript and report results are saved so you can access them later. Your raw video file is never retained.",
        },
        {
          q: "How is DayTabs different from AI tools?",
          a: "Most AI tools can help you write ideas, but they cannot analyze your actual full video. DayTabs reviews the full upload for you and turns it into a complete report with clear improvements, stronger publish assets, and next steps you can use right away.",
        },
        {
          q: "Can I use DayTabs for free?",
          a: "Yes. DayTabs offers a free plan with 1 video analysis per month, teleprompter access, and basic quality reports. No credit card required. Upgrade to Creator, Pro, or Studio for more analyses, deeper workflows, and more planning capacity.",
        },
      ],
    },
    finalCta: {
      titleLead: "Simple, Transparent",
      titleAccent: "Pricing",
      subtitle: "Start free. No credit card required. Upgrade only when you're ready to publish more.",
      primaryCta: "Sign Up Free",
      secondaryCta: "View Pricing",
      bullets: ["No credit card required", "Free plan available", "Cancel anytime"],
    },
    footer: {
      rights: (year: number) => `© ${year} DayTabs. All rights reserved.`,
      privacy: "Privacy Policy",
      refund: "Refund Policy",
      terms: "Terms",
    },
    auth: {
      loginTitle: "Welcome back",
      loginSubtitle: "Sign in to your account",
      signupTitle: "Create your account",
      signupSubtitle: "Start analyzing your videos for free",
      continueGoogle: "Continue with Google",
      orContinueEmail: "or continue with email",
      orSignupEmail: "or sign up with email",
      email: "Email",
      password: "Password",
      fullName: "Full Name",
      signIn: "Sign In",
      createAccount: "Create Account",
      noAccount: "Don't have an account?",
      signupFree: "Sign up free",
      alreadyHave: "Already have an account?",
      loginLink: "Sign in",
      freePlanNote: "Free plan available. No credit card required.",
      passwordMin: "At least 6 characters",
      weak: "Weak",
      good: "Good",
      strong: "Strong",
      loginFailed: "Login failed",
      signupFailed: "Signup failed",
      passwordLength: "Password must be at least 6 characters",
    },
    pricing: {
      pageTitleLead: "Simple,",
      pageTitleAccent: "Transparent",
      pageTitleTail: "Pricing",
      subtitle: "Start free, upgrade when you're ready. No hidden fees, cancel anytime.",
    },
  },
  tr: {
    languageLabel: "Dil",
    nav: {
      features: "Ozellikler",
      howItWorks: "Nasil Calisir",
      blog: "Blog",
      pricing: "Fiyatlar",
      refunds: "Iadeler",
      contact: "Iletisim",
      login: "Giris Yap",
      getStarted: "Basla",
    },
    hero: {
      badge: "YZ Destekli Video Analiz Platformu",
      titleLead: "DayTabs YZ Video Analizi",
      titleAccent: "Icerik Ureticileri Icin",
      description:
        "DayTabs; YouTube, TikTok ve Instagram ureticilerine tek bir is akisi icinde YZ video analizi, YouTube SEO destegi, baslik ve etiket onerileri, kisa klip fikirleri ve icerik planlamasi sunar.",
      primaryCta: "Ucretsiz Basla",
      secondaryCta: "Nasil Calistigini Gor",
    },
    howItWorks: {
      titleLead: "",
      titleAccent: "DayTabs Nasil Calisir",
      subtitle: "Yuklemeden icgoruye uc basit adimda ulasin.",
      link: "Nasil calisir ->",
      steps: [
        {
          title: "Videonu Yukle",
          desc: "Uzun veya kisa format videolarini ekle; Pro planda 5 GB'a kadar plan odakli yukleme destegi al.",
        },
        {
          title: "YZ Her Detayi Analiz Eder",
          desc: "YZ ses cikartir, konusmayi yaziya doker, kareleri analiz eder ve dakikalar icinde kapsamli icgoruler uretir.",
        },
        {
          title: "Aksiyon Alinabilir Icgoruler Al",
          desc: "Kalite, Icerik, SEO ve Altyazi sekmeleriyle net ve uygulanabilir oneriler sunan tam bir panel al.",
        },
      ],
    },
    advanced: {
      titleLead: "Gelismis",
      titleAccent: "Yetenekler",
      subtitle: "Trend odakli planlama ve yayin destegiyle analizden daha fazlasina gecin",
      cards: [
        { title: "Transkript Olusturma", desc: "Altyazi ve caption icin zaman damgali tam konusma metni." },
        { title: "Buyume Planlayici", desc: "Nis trendleri, profil sinyalleri ve platform ritminden haftalik icerik takvimi olusturun." },
        { title: "Rakip Icgoruleri", desc: "Bir sonraki paylasimindan once ogrenmeye deger gercek hesaplari ve formatlari gor." },
      ],
    },
    featuresSection: {
      titleLead: "Kanalini Buyutmek Icin",
      titleAccent: "Ihtiyacin Olan Her Sey",
      subtitle:
        "Ciddi YouTube, TikTok ve Instagram ureticileri icin; YZ video analizi, YouTube SEO rehberligi, baslik ve etiket onerileri ve icerik planlamasini tek panelde birlestiren eksiksiz arac seti.",
      link: "Tum ozellikleri gor ->",
      features: [
        { title: "Kalite Analizi", desc: "Isik, ses netligi, video cozunurlugu ve teknik performans aninda puanlanir." },
        { title: "Icerik Geri Bildirimi", desc: "YZ destekli hook, hikaye anlatimi, tempo ve izleyici etkilesimi icgoruleri." },
        { title: "SEO Zekasi", desc: "Her platform icin baslik onerileri, anahtar kelimeler, hashtagler ve kesfedilebilirlik puanlari." },
        { title: "Icerik Buyumesi", desc: "Trend sinyallerini her platform icin haftalik icerik planlarina donustur." },
        { title: "Coklu Platform", desc: "YouTube, TikTok, Instagram, LinkedIn ve X icin optimize edilmis analiz." },
        { title: "Gizlilik Once Gelir", desc: "Videolariniz guvenli sekilde islenir ve gerekenden uzun sure saklanmaz." },
      ],
    },
    receive: {
      titleLead: "Elde",
      titleAccent: "Edeceklerin",
      subtitle:
        "DayTabs; gorunur ve aksiyona donuk YZ video analizi, yayina hazir baslik ve etiket onerileri ve surekli icerik planlama yardimi isteyen ureticiler icin web tabanli bir abonelik urunudur.",
      cards: [
        {
          title: "Video bazli analiz raporu",
          desc: "DayTabs panelinde kalite, kurgu, tempo, icerik geri bildirimi ve platforma hazir onerileri kapsayan yapilandirilmis rapor.",
        },
        {
          title: "Yayin paketi ciktilari",
          desc: "Planina gore DayTabs yayin hizini arttirmak icin baslik, etiket, aciklama, hook ve kisa klip fikirleri uretebilir.",
        },
        {
          title: "Plana gore aylik kullanim limitleri",
          desc: "Her abonelik; kac video analiz edebilecegini, dosya boyutu ve sure limitlerini ve planlama kapasitesini acikca gosterir.",
        },
      ],
    },
    platformsSection: {
      titleLead: "Her",
      titleAccent: "Platform Icin Uretildi",
      subtitle:
        "Ister YouTube'da uzun format ister TikTok, Instagram Reels, LinkedIn veya Twitter'da kisa format yayinlayin, DayTabs tek raporda YZ video analizini, YouTube SEO onerilerini ve icerik planlamasini platforma gore uyarlar.",
    },
    termsSection: {
      titleLead: "Ureticilerin Aradigi",
      titleAccent: "Terimlerin Etrafinda Kuruldu",
      subtitle:
        "YZ video analizi, YouTube SEO, baslik ve etiket onerileri veya YouTube, TikTok ve Instagram ureticileri icin icerik planlamasi ariyorsaniz DayTabs bu is akislari tek bir panelde bir araya getirir.",
      cards: [
        { title: "Gercek videolar icin YZ video analizi", desc: "Sadece genel promptlara guvenmek yerine gercek videolari kalite, tempo, hook, netlik ve kurgu sorunlari icin inceleyin." },
        { title: "YouTube SEO ve metadata destegi", desc: "Videonun icinde gercekten ne olduguna gore daha guclu baslik, aciklama, zaman damgasi ve etiket onerileri uretin." },
        { title: "TikTok ve Instagram icin kisa format planlama", desc: "Kisa format ureticileri ve yeniden kullanim is akislari icin uygun klip anlarini, acilari ve yayin fikirlerini bulun." },
        { title: "Haftalik icerik planlama", desc: "Performans verilerini, trendleri ve rakip sinyallerini yayinlayabilecegin haftalik bir planlama sistemine donustur." },
      ],
    },
    blog: {
      eyebrow: "Blogdan",
      cta: "YouTube SEO rehberimizi oku ->",
    },
    faq: {
      titleLead: "Sikca Sorulan",
      titleAccent: "Sorular",
      subtitle: "Baslamadan once bilmeniz gereken her sey.",
      items: [
        {
          q: "DayTabs videomu nasil analiz ediyor?",
          a: "Videonuzu yuklersiniz; DayTabs onu ust duzey modeller ve platform algoritmalarini dikkate alarak analiz eder, sonra videolarinizi gelistirmenize yardimci olacak net geri bildirimlerle tam bir rapor sunar.",
        },
        {
          q: "Videom sunucularinizda saklaniyor mu?",
          a: "Hayir. Analiz tamamlanir tamamlanmaz videolar silinir. Sonuclara daha sonra erisebilmeniz icin yalnizca transkriptiniz ve rapor sonuclari kaydedilir. Ham video dosyaniz tutulmaz.",
        },
        {
          q: "DayTabs, diger YZ araclarindan nasil ayriliyor?",
          a: "Bir cok YZ araci fikir yazmaniza yardimci olabilir ama gercek videonuzu tam olarak analiz edemez. DayTabs tum videoyu inceler ve size hemen kullanabileceginiz net iyilestirmeler, daha guclu yayin varliklari ve sonraki adimlarla dolu tam bir rapor verir.",
        },
        {
          q: "DayTabs'i ucretsiz kullanabilir miyim?",
          a: "Evet. DayTabs; ayda 1 video analizi, teleprompter erisimi ve temel kalite raporlari iceren ucretsiz bir plan sunar. Kredi karti gerekmez. Daha fazla analiz ve gelismis is akislari icin Creator, Pro veya Studio planina gecebilirsiniz.",
        },
      ],
    },
    finalCta: {
      titleLead: "Basit, Seffaf",
      titleAccent: "Fiyatlandirma",
      subtitle: "Ucretsiz baslayin. Kredi karti gerekmez. Daha fazla yayinlamaya hazir oldugunuzda yukseltin.",
      primaryCta: "Ucretsiz Kayit Ol",
      secondaryCta: "Fiyatlari Gor",
      bullets: ["Kredi karti gerekmez", "Ucretsiz plan mevcut", "Istegin zaman iptal et"],
    },
    footer: {
      rights: (year: number) => `© ${year} DayTabs. Tum haklari saklidir.`,
      privacy: "Gizlilik Politikasi",
      refund: "Iade Politikasi",
      terms: "Kosullar",
    },
    auth: {
      loginTitle: "Tekrar hos geldin",
      loginSubtitle: "Hesabina giris yap",
      signupTitle: "Hesabini olustur",
      signupSubtitle: "Videolarini ucretsiz analiz etmeye basla",
      continueGoogle: "Google ile devam et",
      orContinueEmail: "veya e-posta ile devam et",
      orSignupEmail: "veya e-posta ile kayit ol",
      email: "E-posta",
      password: "Sifre",
      fullName: "Ad Soyad",
      signIn: "Giris Yap",
      createAccount: "Hesap Olustur",
      noAccount: "Hesabin yok mu?",
      signupFree: "Ucretsiz kayit ol",
      alreadyHave: "Zaten hesabin var mi?",
      loginLink: "Giris yap",
      freePlanNote: "Ucretsiz plan mevcut. Kredi karti gerekmez.",
      passwordMin: "En az 6 karakter",
      weak: "Zayif",
      good: "Iyi",
      strong: "Guclu",
      loginFailed: "Giris basarisiz oldu",
      signupFailed: "Kayit basarisiz oldu",
      passwordLength: "Sifre en az 6 karakter olmali",
    },
    pricing: {
      pageTitleLead: "Basit,",
      pageTitleAccent: "Seffaf",
      pageTitleTail: "Fiyatlandirma",
      subtitle: "Ucretsiz baslayin, hazir oldugunuzda yukseltin. Gizli ucret yok, istediginiz zaman iptal edin.",
    },
  },
} as const;

type LandingCopy = (typeof copy)[LandingLocale];

const LandingI18nContext = createContext<{
  locale: LandingLocale;
  setLocale: (locale: LandingLocale) => void;
  copy: LandingCopy;
} | null>(null);

function detectInitialLocale(): LandingLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "tr") return stored;
  return window.navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function LandingI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LandingLocale>(() => detectInitialLocale());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale: (nextLocale: LandingLocale) => setLocaleState(nextLocale),
    copy: copy[locale],
  }), [locale]);

  return <LandingI18nContext.Provider value={value}>{children}</LandingI18nContext.Provider>;
}

export function useLandingI18n() {
  const context = useContext(LandingI18nContext);
  if (!context) throw new Error("useLandingI18n must be used within LandingI18nProvider");
  return context;
}
