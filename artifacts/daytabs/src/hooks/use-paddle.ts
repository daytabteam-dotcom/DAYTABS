import { useEffect, useState, useCallback } from "react";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

const CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string;
const ENVIRONMENT = (import.meta.env.VITE_PADDLE_ENVIRONMENT ?? "production") as "production" | "sandbox";
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

export const PADDLE_PRICES = {
  free: import.meta.env.VITE_PADDLE_PRICE_FREE as string,
  premium: import.meta.env.VITE_PADDLE_PRICE_PREMIUM as string,
  professional: import.meta.env.VITE_PADDLE_PRICE_PROFESSIONAL as string,
} as const;

// Module-level singletons — shared across all hook instances
let paddleInstance: Paddle | null = null;
let globalDiscountCode = "";
const discountListeners = new Set<(code: string) => void>();

function notifyDiscountListeners(code: string) {
  discountListeners.forEach((fn) => fn(code));
}

export function usePaddle() {
  const [paddle, setPaddle] = useState<Paddle | null>(paddleInstance);
  const [discountCode, _setDiscountCode] = useState(() => globalDiscountCode);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Sync with the global discount code
  useEffect(() => {
    const listener = (code: string) => _setDiscountCode(code);
    discountListeners.add(listener);
    return () => { discountListeners.delete(listener); };
  }, []);

  // Initialize Paddle once
  useEffect(() => {
    if (paddleInstance) { setPaddle(paddleInstance); return; }
    if (!CLIENT_TOKEN) return;
    initializePaddle({
      token: CLIENT_TOKEN,
      environment: ENVIRONMENT,
      checkout: {
        settings: { displayMode: "overlay", theme: "dark", locale: "en" },
      },
    }).then((instance) => {
      if (instance) { paddleInstance = instance; setPaddle(instance); }
    });
  }, []);

  const setDiscountCode = useCallback((code: string) => {
    globalDiscountCode = code;
    notifyDiscountListeners(code);
    setCheckoutError(null);
  }, []);

  const openCheckout = useCallback((priceId: string, userEmail?: string) => {
    if (!paddle) return;
    setCheckoutError(null);

    // Auto-apply FREE100 for configured admin email
    const autoCode = ADMIN_EMAIL && userEmail === ADMIN_EMAIL ? "FREE100" : undefined;
    const userCode = globalDiscountCode.trim() !== "" ? globalDiscountCode.trim().toUpperCase() : undefined;
    const resolvedCode = autoCode ?? userCode;

    try {
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: userEmail ? { email: userEmail } : undefined,
        ...(resolvedCode ? { discountCode: resolvedCode } : {}),
      });
    } catch {
      setCheckoutError("Failed to open checkout. Please try again.");
    }
  }, [paddle]);

  return { paddle, openCheckout, discountCode, setDiscountCode, checkoutError };
}
