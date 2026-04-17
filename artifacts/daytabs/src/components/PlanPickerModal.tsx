import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X, Zap, Star, Building, Check, Loader2 } from "lucide-react";
import { usePaddle, PADDLE_PRICES } from "@/hooks/use-paddle";
import { useUser } from "@/hooks/use-user";
import { usePaddlePrices } from "@/hooks/use-paddle-subscription";

interface PlanPickerModalProps {
  onClose: () => void;
  highlightPlan?: "creator" | "pro" | "studio";
}

const PLAN_META = [
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
      "15 video analyses/month",
      "Up to 40 min video length",
      "1 GB upload limit",
      "Quality, Editing, Publish modules",
      "Short Clip Ideas",
      "Full transcript included",
      "15 Script Planner chats/mo",
    ],
    ctaClass: "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20",
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
      "40 video analyses/month",
      "Up to 2 hr video length",
      "5 GB upload limit",
      "All modules unlocked",
      "Advanced AI analysis",
      "Subtitle file download",
      "40 Script Planner chats/mo",
    ],
    ctaClass: "bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-lg shadow-violet-500/20",
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
      "Unlimited video analyses",
      "Up to 3 hr video length",
      "100 GB upload limit",
      "All modules unlocked",
      "Priority processing",
      "Subtitle translation",
      "Unlimited Script Planner",
    ],
    ctaClass: "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-lg shadow-pink-500/20",
  },
];

export function PlanPickerModal({ onClose, highlightPlan }: PlanPickerModalProps) {
  const { user } = useUser();
  const { openCheckout, checkoutError } = usePaddle();
  const { prices, formatPrice, loading: pricesLoading } = usePaddlePrices();
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<"creator" | "pro" | "studio" | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
    if (planKey === "studio") {
      onClose();
      window.location.assign("/contact");
      return;
    }
    if (!user) {
      onClose();
      navigate("/login");
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl">
        <div className="bg-[#110d1a] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
            <div>
              <h2 className="text-lg font-bold text-white">Upgrade your plan</h2>
              <p className="text-xs text-white/40 mt-0.5">Unlock more analyses, longer videos, and advanced AI. Cancel anytime.</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 grid sm:grid-cols-3 gap-4">
            {PLAN_META.map((plan) => {
              const isHighlighted = highlightPlan === plan.key;
              const priceId = getPriceId(plan.key);
              const hasCheckout = !!priceId;

              return (
                <div
                  key={plan.key}
                  className={`relative rounded-xl border ${isHighlighted ? plan.border : "border-white/10"} ${isHighlighted ? plan.ring : ""} p-5 bg-white/[0.03] flex flex-col gap-4`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-violet-600 to-purple-500 rounded-full text-[10px] font-bold text-white shadow-md shadow-violet-500/30 whitespace-nowrap">
                      {plan.badge}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center shrink-0`}>
                      <plan.icon className="w-[18px] h-[18px] text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{plan.name}</p>
                      <div className="flex items-baseline gap-0.5">
                        {pricesLoading ? (
                          <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
                        ) : (
                          <>
                            <span className="text-xl font-black text-white">
                              {formatPrice(plan.key) || plan.price}
                            </span>
                            <span className="text-xs text-white/40">/mo</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-2 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-white/65">
                        <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelect(plan.key)}
                    disabled={selectedPlan !== null || (plan.key !== "studio" && !hasCheckout)}
                    className={`w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${plan.ctaClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                    data-testid={`button-select-plan-${plan.key}`}
                  >
                    {selectedPlan === plan.key ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Opening...
                      </span>
                    ) : plan.key === "studio" ? "Contact us" : "Upgrade"}
                  </button>
                </div>
              );
            })}
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
    document.body
  );
}
