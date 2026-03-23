import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Check, Zap, Star, Building } from "lucide-react";
import Navbar from "../components/Navbar";

const plans = [
  {
    key: "free" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Zap,
    description: "Perfect to get started and explore the platform.",
    color: "from-slate-600 to-slate-500",
    borderColor: "border-white/10",
    popular: false,
    features: [
      "Upload 1 video",
      "Limited quality report",
      "Limited content report",
      "Limited SEO report",
      "1 transcript",
    ],
    missing: ["Translation", "AI dubbing", "Priority support"],
    cta: "Get Started Free",
    ctaStyle: "border border-white/20 hover:border-violet-500/40 hover:bg-white/5",
  },
  {
    key: "premium" as const,
    name: "Premium",
    price: "$25",
    period: "per month",
    icon: Star,
    description: "Everything you need to grow your content channel.",
    color: "from-violet-600 to-purple-500",
    borderColor: "border-violet-500/50",
    popular: true,
    features: [
      "Upload up to 20 videos",
      "Full quality report",
      "Full content report",
      "Full SEO report",
      "Transcript",
      "Translation",
      "AI dubbing",
    ],
    missing: [],
    cta: "Start Premium",
    ctaStyle: "bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-lg shadow-violet-500/30",
  },
  {
    key: "professional" as const,
    name: "Professional",
    price: "$40",
    period: "per month",
    icon: Building,
    description: "For agencies and power creators at scale.",
    color: "from-purple-600 to-pink-500",
    borderColor: "border-white/10",
    popular: false,
    features: [
      "Upload up to 100 videos",
      "All features included",
      "Priority processing",
      "Priority support",
      "API access",
      "Custom integrations",
    ],
    missing: [],
    cta: "Start Professional",
    ctaStyle: "border border-white/20 hover:border-violet-500/40 hover:bg-white/5",
  },
];

export default function PricingPage() {
  const [, navigate] = useLocation();

  const handlePlanClick = (_key: "free" | "premium" | "professional") => {
    navigate("/signup");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto">
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

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className={`relative glass rounded-3xl p-8 border ${plan.borderColor} ${
                  plan.popular ? "ring-1 ring-violet-500/50 scale-105 shadow-xl shadow-violet-500/20" : ""
                } transition-all hover:scale-[1.02] hover:shadow-xl`}
                data-testid={`card-plan-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-purple-500 rounded-full text-xs font-bold text-white shadow-lg shadow-violet-500/30">
                    Most Popular
                  </div>
                )}

                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-6 shadow-lg`}>
                  <plan.icon className="w-6 h-6 text-white" />
                </div>

                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <p className="text-white/40 text-sm mb-6">{plan.description}</p>

                <div className="mb-8">
                  <span className="text-5xl font-black">{plan.price}</span>
                  <span className="text-white/40 text-sm ml-2">/{plan.period}</span>
                </div>

                <button
                  onClick={() => handlePlanClick(plan.key)}
                  className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all mb-8 cursor-pointer ${plan.ctaStyle}`}
                  data-testid={`button-plan-${plan.name.toLowerCase()}`}
                >
                  {plan.cta}
                </button>

                <div className="space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-sm text-white/70">
                      <Check className="w-4 h-4 text-violet-400 shrink-0" />
                      {feature}
                    </div>
                  ))}
                  {plan.missing.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-sm text-white/25 line-through">
                      <div className="w-4 h-4 rounded-full border border-white/15 shrink-0" />
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
              All plans include access to the core analysis dashboard.
              Questions? <button onClick={() => navigate("/contact")} className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">Contact us</button>
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
