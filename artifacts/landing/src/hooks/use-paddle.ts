import { useEffect, useState } from "react";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

const CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string;
const ENVIRONMENT = (import.meta.env.VITE_PADDLE_ENVIRONMENT ?? "production") as "production" | "sandbox";

export const PADDLE_PRICES = {
  free: import.meta.env.VITE_PADDLE_PRICE_FREE as string,
  premium: import.meta.env.VITE_PADDLE_PRICE_PREMIUM as string,
  professional: import.meta.env.VITE_PADDLE_PRICE_PROFESSIONAL as string,
} as const;

let paddleInstance: Paddle | null = null;

export function usePaddle() {
  const [paddle, setPaddle] = useState<Paddle | null>(paddleInstance);

  useEffect(() => {
    if (paddleInstance) {
      setPaddle(paddleInstance);
      return;
    }
    if (!CLIENT_TOKEN) return;

    initializePaddle({
      token: CLIENT_TOKEN,
      environment: ENVIRONMENT,
      checkout: {
        settings: {
          displayMode: "overlay",
          theme: "dark",
          locale: "en",
        },
      },
    }).then((instance) => {
      if (instance) {
        paddleInstance = instance;
        setPaddle(instance);
      }
    });
  }, []);

  const openCheckout = (priceId: string, userEmail?: string) => {
    if (!paddle) return;
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: userEmail ? { email: userEmail } : undefined,
    });
  };

  return { paddle, openCheckout };
}
