import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { LogOut, Crown, ChevronDown, Loader2, Tag, AlertCircle, CreditCard, Calendar, XCircle, AlertTriangle, X } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { usePaddle } from "@/hooks/use-paddle";
import { usePlan, getPlanLabel, getPlanColor } from "@/hooks/use-plan";
import { usePaddleSubscription } from "@/hooks/use-paddle-subscription";
import { PlanPickerModal } from "@/components/PlanPickerModal";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface CancelConfirmModalProps {
  planName: string;
  activeUntil: string | null;
  onConfirm: () => Promise<{ effectiveAt: string | null; requiresPortal: boolean; portalUrl: string | null } | void>;
  onClose: () => void;
}

function CancelConfirmModal({ planName, activeUntil, onConfirm, onClose }: CancelConfirmModalProps) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setCancelling(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result?.requiresPortal && result.portalUrl) {
        window.open(result.portalUrl, "_blank", "noopener,noreferrer");
        onClose();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#1a1025] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>

          <h3 className="text-lg font-bold text-white text-center mb-1">Cancel subscription?</h3>
          <p className="text-sm text-white/50 text-center mb-5">
            Your <span className="text-white/70 font-medium">{planName}</span> plan will stay active
            {activeUntil ? (
              <> until <span className="text-white/70 font-medium">{activeUntil}</span></>
            ) : (
              " until the end of your current billing period"
            )}
            , then reset to Free automatically.
          </p>

          <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/15 rounded-xl px-3 py-2.5 mb-5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-400/70">No refund will be issued for the remaining billing period.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={cancelling}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 transition-colors cursor-pointer"
            >
              Keep plan
            </button>
            <button
              onClick={handleConfirm}
              disabled={cancelling}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600/80 hover:bg-red-600 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {cancelling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  Confirm cancel
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function UserProfileMenu() {
  const { user, logout } = useUser();
  const { discountCode, setDiscountCode, checkoutError } = usePaddle();
  const { plan, loading: planLoading } = usePlan();
  const { subscription, formatNextBilling, formatCancelsOn, cancelSubscription } = usePaddleSubscription();
  const [open, setOpen] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
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
  const nextBilling = formatNextBilling();
  const cancelsOn = formatCancelsOn();
  const isPendingCancellation = !!cancelsOn;

  const handleUpgrade = () => {
    setOpen(false);
    setShowPlanPicker(true);
  };

  const handleCancelClick = () => {
    setOpen(false);
    setShowCancelConfirm(true);
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

          {/* Subscription section */}
          <div className="px-4 py-3 border-b border-white/8 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs text-white/50">Subscription</span>
              </div>
              {planLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
              ) : (
                <span className={`text-xs font-semibold ${planColor}`} data-testid="text-user-plan">
                  {planLabel}
                </span>
              )}
            </div>

            {/* Active subscription details */}
            {plan.isPaid && subscription?.status === "active" && (
              <div className="space-y-1.5">
                {isPendingCancellation ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400/70">
                    <XCircle className="w-3 h-3 shrink-0" />
                    <span>Cancels {cancelsOn} — reverts to Free</span>
                  </div>
                ) : (
                  nextBilling && (
                    <div className="flex items-center gap-1.5 text-xs text-white/35">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>Renews {nextBilling}</span>
                    </div>
                  )
                )}

                <div className="flex items-center gap-2">
                  {subscription.managementUrls.updatePaymentMethod && !isPendingCancellation && (
                    <a
                      href={subscription.managementUrls.updatePaymentMethod}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-white/35 hover:text-white/60 transition-colors"
                    >
                      <CreditCard className="w-3 h-3" />
                      Update payment
                    </a>
                  )}
                  {!isPendingCancellation && (
                    <button
                      onClick={handleCancelClick}
                      className="flex items-center gap-1 text-xs text-white/25 hover:text-red-400/70 transition-colors ml-auto cursor-pointer"
                      data-testid="button-cancel-subscription"
                    >
                      <XCircle className="w-3 h-3" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Free plan — upgrade CTA */}
            {!plan.isPaid && (
              <div className="space-y-2">
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

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} />
      )}

      {showCancelConfirm && subscription && (
        <CancelConfirmModal
          planName={subscription.planName || planLabel}
          activeUntil={nextBilling}
          onConfirm={cancelSubscription}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
