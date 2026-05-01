import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Zap, Star, Building, Check, Loader2 } from "lucide-react";
import { usePaddle, PADDLE_PRICES } from "@/hooks/use-paddle";
import { useUser } from "@/hooks/use-user";
import { usePaddlePrices } from "@/hooks/use-paddle-subscription";
import { getPublicSiteUrl } from "@/lib/runtime";

interface PlanPickerModalProps {
  onClose: () => void;
  highlightPlan?: "creator" | "pro" | "studio";
}

const PLAN_META = [
  {
    key: "free" as const,
    name: "Free",
    icon: Check,
    color: "from-white/30 to-white/10",
    border: "border-white/10",
    ring: "",
    badge: null as string | null,
    price: "$0",
    features: [
      "1 video analysis / month",
      "Up to 5 min per video",
      "Basic report with limited insights",
      "Teleprompter",
      "1 script generation",
      "1 week Content Growth plan",
      "1 platform only",
      "3 AI idea improvements",
      "No extra AI idea generation",
    ],
    ctaClass:
      "bg-white/10 hover:bg-white/10 shadow-none",
  },
  {
    key: "creator" as const,
    name: "Creator",
    icon: Zap,
    color: "from-amber-500 to-orange-500",
    border: "border-white/10",
    ring: "",
    badge: null as string | null,
    price: "$19",
    features: [
      "Up to 10 videos per month*",
      "Up to 25 min per video",
      "1 GB upload limit",
      "Full analysis across quality, editing, SEO, and clips",
      "Priority queue over free users",
      "Teleprompter",
      "20 script generations",
      "YouTube Growth tools (Coming Soon)",
      "Content Growth: 2 platforms",
      "Content Growth: monthly planning",
      "Content Growth: 15 AI improvements per platform",
      "Content Growth: 8 extra AI ideas per platform",
      "Content Growth: goal-based next week planning",
    ],
    ctaClass:
      "bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20",
  },
  {
    key: "pro" as const,
    name: "Pro",
    icon: Star,
    color: "from-violet-600 to-purple-500",
    border: "border-violet-500/50",
    ring: "ring-1 ring-violet-500/40",
    badge: "Most Popular",
    price: "$39",
    features: [
      "Up to 25 videos per month*",
      "Up to 60 min per video",
      "5 GB upload limit",
      "All Creator features",
      "Subtitle export",
      "Higher priority processing for less waiting",
      "60 script generations",
      "Content Growth: 3 platforms",
      "Content Growth: behavior-based weekly planning",
      "Content Growth: 30 AI improvements per platform",
      "Content Growth: 20 extra AI ideas per platform",
      "Content Growth: end-of-week performance learning",
    ],
    ctaClass:
      "bg-linear-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-lg shadow-violet-500/20",
  },
  {
    key: "studio" as const,
    name: "Studio",
    icon: Building,
    color: "from-pink-600 to-rose-500",
    border: "border-white/10",
    ring: "",
    badge: null as string | null,
    price: "$89",
    features: [
      "Up to 80 videos per month*",
      "Up to 90 min per video",
      "100 GB upload limit",
      "All Pro features",
      "200 script generations",
      "Highest queue priority",
      "Priority support",
      "Content Growth: 3 platforms",
      "Content Growth: behavior-based weekly planning",
      "Content Growth: unlimited AI improvements",
      "Content Growth: unlimited extra AI ideas",
      "Content Growth: end-of-week performance learning",
    ],
    ctaClass:
      "bg-linear-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-lg shadow-pink-500/20",
  },
];

export function PlanPickerModal({
  onClose,
  highlightPlan,
}: PlanPickerModalProps) {
  const { user } = useUser();
  const { openCheckout, checkoutError } = usePaddle();
  const { prices, formatPrice, loading: pricesLoading } = usePaddlePrices();
  const [selectedPlan, setSelectedPlan] = useState<
    "creator" | "pro" | "studio" | null
  >(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const getPriceId = (planKey: "creator" | "pro" | "studio") => {
    const envPriceId = PADDLE_PRICES[planKey];
    if (envPriceId) return envPriceId;
    if (prices[planKey]?.id) return prices[planKey].id;
    if (planKey === "creator") return prices.premium?.id ?? "";
    if (planKey === "studio") return prices.professional?.id ?? "";
    return "";
  };

  const handleSelect = async (planKey: "creator" | "pro" | "studio") => {
    if (!user) {
      onClose();
      window.location.href = getPublicSiteUrl("/login/");
      return;
    }

    const priceId = getPriceId(planKey);
    setSelectedPlan(planKey);
    try {
      const opened = await openCheckout(priceId, user.email);
      if (opened) onClose();
    } finally {
      setSelectedPlan(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      data-testid="modal-plan-picker"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(168,85,247,0.08),transparent_26%),linear-gradient(180deg,rgba(16,12,25,0.94),rgba(9,10,18,0.9))] shadow-2xl shadow-black/60 backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold text-white">
                Upgrade your plan
              </h2>
              <p className="text-xs text-white/40 mt-0.5">
                More monthly usage, longer uploads, and fuller planning tools.
                Cancel anytime.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {PLAN_META.map((plan) => {
              const isHighlighted = highlightPlan === plan.key;
              const priceId = plan.key === "free" ? "" : getPriceId(plan.key);
              const hasCheckout = !!priceId;

              return (
                <div
                  key={plan.key}
                  className={`relative flex flex-col gap-4 rounded-[22px] border ${isHighlighted ? plan.border : "border-white/10"} ${isHighlighted ? plan.ring : ""} bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_24%),rgba(255,255,255,0.03)] p-5 backdrop-blur-xl`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-linear-to-r from-violet-600 to-purple-500 rounded-full text-[10px] font-bold text-white shadow-md shadow-violet-500/30 whitespace-nowrap">
                      {plan.badge}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg bg-linear-to-br ${plan.color} flex items-center justify-center shrink-0`}
                    >
                      <plan.icon className="w-[18px] h-[18px] text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {plan.name}
                      </p>
                      <div className="flex items-baseline gap-0.5">
                        {pricesLoading ? (
                          <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
                        ) : (
                          <>
                            <span className="text-xl font-black text-white">
                              {plan.key === "free" ? plan.price : formatPrice(plan.key) || plan.price}
                            </span>
                            <span className="text-xs text-white/40">/mo</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-2 flex-1">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-xs text-white/65"
                      >
                        <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.key === "free" ? (
                    <div className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2.5 text-center text-sm font-semibold text-white/60">
                      Current base plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelect(plan.key)}
                      disabled={
                        selectedPlan !== null ||
                        !hasCheckout
                      }
                      className={`w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${plan.ctaClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                      data-testid={`button-select-plan-${plan.key}`}
                    >
                      {selectedPlan === plan.key ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Opening...
                        </span>
                      ) : (
                        "Upgrade"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/45">
              *Longer videos may use more of your monthly usage.
            </div>
          </div>

          {checkoutError && (
            <div className="mx-6 mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {checkoutError}
            </div>
          )}

          <p className="text-center text-xs text-white/25 pb-5">
            Secure checkout via Paddle · Cancel anytime
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
