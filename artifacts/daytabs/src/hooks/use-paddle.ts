import { useEffect, useState, useCallback } from "react";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

const BUILD_CLIENT_TOKEN = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined)?.trim() ?? "";
const BUILD_ENVIRONMENT = (import.meta.env.VITE_PADDLE_ENVIRONMENT ?? "production") as "production" | "sandbox";
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

export const PADDLE_PRICES = {
  creator:      import.meta.env.VITE_PADDLE_PRICE_PREMIUM as string,
  pro:          import.meta.env.VITE_PADDLE_PRICE_PRO as string,
  studio:       import.meta.env.VITE_PADDLE_PRICE_PROFESSIONAL as string,
  premium:      import.meta.env.VITE_PADDLE_PRICE_PREMIUM as string,
  professional: import.meta.env.VITE_PADDLE_PRICE_PROFESSIONAL as string,
} as const;

let paddleInstance: Paddle | null = null;
let paddleInitPromise: Promise<Paddle | null> | null = null;
let runtimeConfigPromise: Promise<{ clientToken: string; environment: "production" | "sandbox" } | null> | null = null;
let clientToken = BUILD_CLIENT_TOKEN;
let environment: "production" | "sandbox" = BUILD_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
let globalDiscountCode = "";
const discountListeners = new Set<(code: string) => void>();

function notifyDiscountListeners(code: string) {
  discountListeners.forEach((fn) => fn(code));
}

async function handleCheckoutComplete(
  priceId: string,
  customerId?: string,
  subscriptionId?: string,
) {
  const token = localStorage.getItem("daytabs_token");
  if (!token) return;
  try {
    const res = await fetch("/api/paddle/checkout-complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ priceId, customerId, subscriptionId }),
    });
    if (res.ok) {
      const { token: newToken } = await res.json() as { token: string; plan: string };
      if (newToken) {
        localStorage.setItem("daytabs_token", newToken);
        window.dispatchEvent(new CustomEvent("daytabs:plan-updated"));
      }
    }
  } catch {
    // Webhook will handle it as fallback
  }
}

async function loadRuntimePaddleConfig() {
  if (clientToken) return { clientToken, environment };
  if (runtimeConfigPromise) return runtimeConfigPromise;

  runtimeConfigPromise = fetch("/api/paddle/config", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const config = await res.json() as {
        clientToken?: string;
        environment?: string;
      };
      const token = config.clientToken?.trim() ?? "";
      if (!token) return null;

      clientToken = token;
      environment = config.environment === "sandbox" ? "sandbox" : "production";
      return { clientToken, environment };
    })
    .catch(() => null);

  return runtimeConfigPromise;
}

async function ensurePaddleInitialized(): Promise<Paddle | null> {
  if (paddleInstance) return paddleInstance;
  const config = await loadRuntimePaddleConfig();
  if (!config) return null;
  if (paddleInitPromise) return paddleInitPromise;

  paddleInitPromise = initializePaddle({
    token: config.clientToken,
    environment: config.environment,
    checkout: {
      settings: { displayMode: "overlay", theme: "dark", locale: "en" },
    },
    eventCallback(event) {
      if (event.name === "checkout.completed") {
        const d = event.data as Record<string, unknown> | undefined;
        const items = Array.isArray(d?.items)
          ? (d!.items as Array<{ price_id?: string }>)
          : [];
        const priceId = items[0]?.price_id;
        const customerId = (d?.customer as Record<string, unknown> | undefined)?.id as string | undefined;
        const subscriptionId = (d?.subscription as Record<string, unknown> | undefined)?.id as string | undefined;
        if (priceId) {
          handleCheckoutComplete(priceId, customerId, subscriptionId).catch(() => {});
        }
      }
    },
  }).then((instance) => {
    paddleInstance = instance ?? null;
    return paddleInstance;
  }).catch(() => {
    paddleInitPromise = null;
    return null;
  });

  return paddleInitPromise;
}

export function usePaddle() {
  const [paddle, setPaddle] = useState<Paddle | null>(paddleInstance);
  const [discountCode, _setDiscountCode] = useState(() => globalDiscountCode);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (code: string) => _setDiscountCode(code);
    discountListeners.add(listener);
    return () => { discountListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (paddleInstance) { setPaddle(paddleInstance); return; }
    ensurePaddleInitialized().then((instance) => {
      if (instance) setPaddle(instance);
    });
    const interval = setInterval(() => {
      if (paddleInstance) { setPaddle(paddleInstance); clearInterval(interval); }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const setDiscountCode = useCallback((code: string) => {
    globalDiscountCode = code;
    notifyDiscountListeners(code);
    setCheckoutError(null);
  }, []);

  const openCheckout = useCallback(async (priceId: string, userEmail?: string): Promise<boolean> => {
    setCheckoutError(null);
    if (!priceId) {
      setCheckoutError("This plan is missing a Paddle price ID. Please check the deployment settings.");
      return false;
    }

    const paddleClient = paddle ?? await ensurePaddleInitialized();
    if (!paddleClient) {
      setCheckoutError("Paddle checkout is not configured. Please check VITE_PADDLE_CLIENT_TOKEN and redeploy.");
      return false;
    }
    setPaddle(paddleClient);

    const autoCode = ADMIN_EMAIL && userEmail === ADMIN_EMAIL ? "FREE100" : undefined;
    const userCode = globalDiscountCode.trim() !== "" ? globalDiscountCode.trim().toUpperCase() : undefined;
    const resolvedCode = autoCode ?? userCode;

    try {
      paddleClient.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: userEmail ? { email: userEmail } : undefined,
        ...(resolvedCode ? { discountCode: resolvedCode } : {}),
      });
      return true;
    } catch {
      setCheckoutError("Failed to open checkout. Please try again.");
      return false;
    }
  }, [paddle]);

  return { paddle, openCheckout, discountCode, setDiscountCode, checkoutError };
}
