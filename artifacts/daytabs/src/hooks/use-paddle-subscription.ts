import { useState, useEffect, useCallback } from "react";

export interface PaddlePrice {
  id: string;
  name: string;
  unitAmount: number;
  currency: string;
  interval: string;
  frequency: number;
}

export interface PaddleSubscription {
  id: string;
  status: "active" | "canceled" | "paused" | "past_due" | "trialing";
  priceId: string;
  planName: string;
  nextBilledAt: string | null;
  canceledAt: string | null;
  managementUrls: {
    updatePaymentMethod: string | null;
    cancel: string | null;
  };
}

let cachedPrices: Record<string, PaddlePrice> | null = null;

export function usePaddlePrices() {
  const [prices, setPrices] = useState<Record<string, PaddlePrice>>(cachedPrices ?? {});
  const [loading, setLoading] = useState(!cachedPrices);

  useEffect(() => {
    if (cachedPrices) { setPrices(cachedPrices); return; }
    setLoading(true);
    fetch("/api/paddle/prices")
      .then((r) => r.json())
      .then((data: { prices: Record<string, PaddlePrice> }) => {
        cachedPrices = data.prices ?? {};
        setPrices(cachedPrices);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function formatPrice(plan: "premium" | "professional"): string {
    const p = prices[plan];
    if (!p) return "—";
    const dollars = p.unitAmount / 100;
    return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
  }

  return { prices, loading, formatPrice };
}

export function usePaddleSubscription() {
  const [subscription, setSubscription] = useState<PaddleSubscription | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    const token = localStorage.getItem("daytabs_token");
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/paddle/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { subscription: PaddleSubscription | null };
        setSubscription(data.subscription);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const handler = () => fetch_();
    window.addEventListener("daytabs:plan-updated", handler);
    return () => window.removeEventListener("daytabs:plan-updated", handler);
  }, [fetch_]);

  function formatNextBilling(): string | null {
    if (!subscription?.nextBilledAt) return null;
    return new Date(subscription.nextBilledAt).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  return { subscription, loading, refetch: fetch_, formatNextBilling };
}
