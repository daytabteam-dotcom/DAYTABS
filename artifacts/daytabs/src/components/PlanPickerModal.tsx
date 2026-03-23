import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Star, Building, Check } from "lucide-react";
import { usePaddle, PADDLE_PRICES } from "@/hooks/use-paddle";
import { useUser } from "@/hooks/use-user";

interface PlanPickerModalProps {
  onClose: () => void;
}

const plans = [
  {
    key: "premium" as const,
    name: "Premium",
    price: "$25",
    period: "/mo",
    icon: Star,
    color: "from-violet-600 to-purple-500",
    border: "border-violet-500/50",
    ring: "ring-1 ring-violet-500/40",
    badge: "Most Popular",
    features: [
      "30 pre-edit analyses/mo",
      "50 editing jobs/mo",
      "30 publish reports/mo",
      "500 MB upload limit",
      "Full reports & transcript",
      "Hashtags & timestamps",
      "Subtitle file download",
    ],
    ctaClass: "bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-lg shadow-violet-500/20",
  },
  {
    key: "professional" as const,
    name: "Professional",
    price: "$40",
    period: "/mo",
    icon: Building,
    color: "from-purple-600 to-pink-500",
    border: "border-white/10",
    ring: "",
    badge: null,
    features: [
      "Unlimited analyses",
      "Unlimited editing jobs",
      "Unlimited publish reports",
      "1 GB upload limit",
      "Everything in Premium",
      "YouTube optimisation",
      "Subtitle translation",
    ],
    ctaClass: "bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 shadow-lg shadow-purple-500/20",
  },
];

export function PlanPickerModal({ onClose }: PlanPickerModalProps) {
  const { user } = useUser();
  const { openCheckout } = usePaddle();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSelect = (planKey: "premium" | "professional") => {
    const priceId = PADDLE_PRICES[planKey];
    if (priceId && user) {
      openCheckout(priceId, user.email);
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      data-testid="modal-plan-picker"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl">
        <div className="bg-[#110d1a] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
            <div>
              <h2 className="text-lg font-bold text-white">Choose your plan</h2>
              <p className="text-xs text-white/40 mt-0.5">Upgrade to unlock all features. Cancel anytime.</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Plans */}
          <div className="p-6 grid sm:grid-cols-2 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.key}
                className={`relative rounded-xl border ${plan.border} ${plan.ring} p-5 bg-white/[0.03] flex flex-col gap-4`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-violet-600 to-purple-500 rounded-full text-[10px] font-bold text-white shadow-md shadow-violet-500/30 whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center shrink-0`}>
                    <plan.icon className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{plan.name}</p>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-xl font-black text-white">{plan.price}</span>
                      <span className="text-xs text-white/40">{plan.period}</span>
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
                  className={`w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${plan.ctaClass}`}
                  data-testid={`button-select-plan-${plan.key}`}
                >
                  Start {plan.name}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-white/25 pb-5">
            Secure checkout via Paddle · Cancel anytime
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
