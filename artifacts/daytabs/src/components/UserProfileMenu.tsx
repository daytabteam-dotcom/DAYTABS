import { useState, useRef, useEffect } from "react";
import { LogOut, Crown, ChevronDown, Loader2, Tag, AlertCircle } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { usePaddle, PADDLE_PRICES } from "@/hooks/use-paddle";
import { usePlan, getPlanLabel, getPlanColor } from "@/hooks/use-plan";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function UserProfileMenu() {
  const { user, logout } = useUser();
  const { openCheckout, discountCode, setDiscountCode, checkoutError } = usePaddle();
  const { plan, loading } = usePlan();
  const [open, setOpen] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const initials = getInitials(user.name);
  const displayName = user.name.length > 18 ? user.name.slice(0, 18) + "…" : user.name;
  const planLabel = getPlanLabel(plan.plan);
  const planColor = getPlanColor(plan.plan);

  const handleUpgrade = () => {
    const priceId = PADDLE_PRICES.premium;
    if (priceId) {
      openCheckout(priceId, user.email);
    } else {
      window.location.href = "/pricing";
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/5 transition-colors group cursor-pointer"
        data-testid="button-user-profile"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center text-xs font-bold text-white shadow-md shadow-violet-500/30 shrink-0">
          {initials}
        </div>
        <span className="text-sm font-medium text-white/80 hidden sm:block max-w-[120px] truncate">
          {displayName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/40 transition-transform duration-200 hidden sm:block ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/10 bg-[#1a1025] shadow-2xl shadow-black/50 z-50 overflow-hidden"
          data-testid="panel-user-profile"
        >
          {/* Profile header */}
          <div className="px-4 py-4 border-b border-white/8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-violet-500/20 shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate" data-testid="text-user-name">
                  {displayName}
                </p>
                <p className="text-xs text-white/40 truncate" data-testid="text-user-email">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Plan badge */}
          <div className="px-4 py-3 border-b border-white/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs text-white/50">Subscription</span>
              </div>
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
              ) : (
                <span className={`text-xs font-semibold ${planColor}`} data-testid="text-user-plan">
                  {planLabel}
                </span>
              )}
            </div>

            {!plan.isPaid && (
              <div className="mt-2 space-y-2">
                {/* Discount code toggle */}
                <button
                  onClick={() => setShowCodeInput((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 transition-colors"
                >
                  <Tag className="w-3 h-3" />
                  Have a discount code?
                </button>

                {showCodeInput && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="Enter discount code"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50 font-mono tracking-wider"
                      onKeyDown={(e) => e.key === "Enter" && handleUpgrade()}
                    />
                    {checkoutError && (
                      <div className="flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-400">{checkoutError}</p>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleUpgrade}
                  className="w-full py-1.5 text-xs font-medium rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  data-testid="button-upgrade-plan"
                >
                  Upgrade Plan
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
