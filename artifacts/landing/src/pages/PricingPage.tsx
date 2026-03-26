import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Star, Flame, Building2, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";

type PlanKey = "free" | "creator" | "pro" | "studio";
type Feature = { text: string; badge?: string };

const plans = [
  {
    key: "free" as PlanKey,
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Zap,
    description: "Get started and explore what DayTabs can do.",
    color: "from-slate-600 to-slate-500",
    borderColor: "border-white/10",
    popular: false,
    features: [
      { text: "3 video analyses / month" },
      { text: "Up to 200 MB per video" },
      { text: "Up to 5 min video duration" },
      { text: "Quality and editing reports" },
      { text: "Teleprompter" },
      { text: "1 script planner chat" },
    ] as Feature[],
    missing: ["Publish package", "Short clip ideas", "AI Dubbing"] as string[],
    cta: "Get Started Free",
    ctaStyle: "border border-white/20 hover:border-violet-500/40 hover:bg-white/5",
  },
  {
    key: "creator" as PlanKey,
    name: "Creator",
    price: "$19",
    period: "per month",
    icon: Star,
    description: "For solo creators ready to grow their channel.",
    color: "from-violet-600 to-purple-500",
    borderColor: "border-violet-500/50",
    popular: true,
    features: [
      { text: "15 video analyses / month" },
      { text: "Up to 500 MB per video" },
      { text: "Up to 15 min video duration" },
      { text: "Quality and editing reports" },
      { text: "Publish package (titles, descriptions, tags)" },
      { text: "Short clip ideas" },
      { text: "Teleprompter" },
      { text: "15 script planner chats / month" },
    ] as Feature[],
    missing: ["AI Dubbing"] as string[],
    cta: "Start Creator",
    ctaStyle: "bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-lg shadow-violet-500/30",
  },
  {
    key: "pro" as PlanKey,
    name: "Pro",
    price: "$39",
    period: "per month",
    icon: Flame,
    description: "For serious creators publishing multiple times a week.",
    color: "from-emerald-600 to-teal-500",
    borderColor: "border-emerald-500/30",
    popular: false,
    features: [
      { text: "40 video analyses / month" },
      { text: "Up to 1 GB per video" },
      { text: "Up to 30 min video duration" },
      { text: "All Creator features included" },
      { text: "Subtitle file download" },
      { text: "40 script planner chats / month" },
      { text: "Priority processing" },
    ] as Feature[],
    missing: ["AI Dubbing"] as string[],
    cta: "Start Pro",
    ctaStyle: "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/20",
  },
  {
    key: "studio" as PlanKey,
    name: "Studio",
    price: "$89",
    period: "per month",
    icon: Building2,
    description: "For agencies and power creators at scale.",
    color: "from-purple-600 to-pink-500",
    borderColor: "border-white/10",
    popular: false,
    features: [
      { text: "Unlimited video analyses" },
      { text: "Up to 2 GB per video" },
      { text: "Up to 60 min video duration" },
      { text: "All Pro features included" },
      { text: "Unlimited script planner chats" },
      { text: "AI Dubbing", badge: "Coming Soon" },
      { text: "Priority support" },
    ] as Feature[],
    missing: [] as string[],
    cta: "Contact us",
    ctaStyle: "border border-white/20 hover:border-violet-500/40 hover:bg-white/5",
  },
];

interface LivePrice { unitAmount: number; currency: string; }

function formatLivePrice(p: LivePrice | undefined): string {
  if (!p) return "";
  const dollars = p.unitAmount / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

export default function PricingPage() {
  const [, navigate] = useLocation();
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [pricesLoading, setPricesLoading] = useState(true);

  useEffect(() => {
    fetch("/api/paddle/prices")
      .then((r) => r.json())
      .then((d: { prices: Record<string, LivePrice> }) => setLivePrices(d.prices ?? {}))
      .catch(() => {})
      .finally(() => setPricesLoading(false));
  }, []);

  const handlePlanClick = (key: PlanKey) => {
    if (key === "studio") {
      navigate("/contact");
    } else {
      navigate("/signup");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              Simple, <span className="gradient-text">Transparent</span> Pricing
            </h1>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              Start free, upgrade when you're ready. No hidden fees, cancel anytime.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative glass rounded-3xl p-7 border ${plan.borderColor} ${
                  plan.popular ? "ring-1 ring-violet-500/50 shadow-xl shadow-violet-500/20" : ""
                } transition-all hover:scale-[1.02] hover:shadow-xl`}
                data-testid={`card-plan-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-purple-500 rounded-full text-xs font-bold text-white shadow-lg shadow-violet-500/30 whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-5 shadow-lg`}>
                  <plan.icon className="w-5 h-5 text-white" />
                </div>

                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-white/40 text-xs mb-5">{plan.description}</p>

                <div className="mb-6">
                  {plan.key !== "free" && pricesLoading ? (
                    <Loader2 className="w-7 h-7 text-white/30 animate-spin" />
                  ) : (
                    <>
                      <span className="text-4xl font-black">
                        {plan.key === "free"
                          ? plan.price
                          : (formatLivePrice(livePrices[plan.key]) || plan.price)}
                      </span>
                      <span className="text-white/40 text-xs ml-2">/{plan.period}</span>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handlePlanClick(plan.key)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all mb-6 cursor-pointer ${plan.ctaStyle}`}
                  data-testid={`button-plan-${plan.name.toLowerCase()}`}
                >
                  {plan.cta}
                </button>

                <div className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <div key={feature.text} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                      <span className="flex items-center gap-1.5 flex-wrap text-xs leading-relaxed">
                        {feature.text}
                        {feature.badge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 leading-none">
                            {feature.badge}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {plan.missing.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5 text-xs text-white/25 line-through">
                      <div className="w-3.5 h-3.5 rounded-full border border-white/15 shrink-0 mt-0.5" />
                      {feature}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-16 text-center"
          >
            <p className="text-white/30 text-sm">
              All plans include access to the full analysis dashboard.
              Questions? <button onClick={() => navigate("/contact")} className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">Contact us</button>
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
