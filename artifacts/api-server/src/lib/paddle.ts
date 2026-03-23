const PADDLE_API_KEY = process.env.PADDLE_API_KEY || "";
const PADDLE_BASE = "https://api.paddle.com";

const PRICE_IDS = {
  premium: process.env.PADDLE_PRICE_PREMIUM || "",
  professional: process.env.PADDLE_PRICE_PROFESSIONAL || "",
};

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
  scheduledChange: {
    action: "cancel" | "pause" | "resume";
    effectiveAt: string;
  } | null;
  managementUrls: {
    updatePaymentMethod: string | null;
    cancel: string | null;
  };
}

async function paddleFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${PADDLE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${PADDLE_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paddle API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPaddlePrice(priceId: string): Promise<PaddlePrice | null> {
  if (!priceId || !PADDLE_API_KEY) return null;
  try {
    const data = await paddleFetch<{ data: Record<string, unknown> }>(`/prices/${priceId}`);
    const d = data.data;
    const unitPrice = d.unit_price as { amount: string; currency_code: string };
    const billingCycle = d.billing_cycle as { interval: string; frequency: number };
    return {
      id: d.id as string,
      name: d.name as string,
      unitAmount: parseInt(unitPrice.amount, 10),
      currency: unitPrice.currency_code,
      interval: billingCycle.interval,
      frequency: billingCycle.frequency,
    };
  } catch {
    return null;
  }
}

export async function fetchAllPrices(): Promise<Record<string, PaddlePrice>> {
  const [premium, professional] = await Promise.all([
    fetchPaddlePrice(PRICE_IDS.premium),
    fetchPaddlePrice(PRICE_IDS.professional),
  ]);
  const result: Record<string, PaddlePrice> = {};
  if (premium) result.premium = premium;
  if (professional) result.professional = professional;
  return result;
}

function mapSubscription(d: Record<string, unknown>): PaddleSubscription {
  const items = d.items as Array<{ price: { id: string; name: string } }>;
  const priceId = items?.[0]?.price?.id ?? "";
  const planName = items?.[0]?.price?.name ?? "";
  const mgmt = d.management_urls as { update_payment_method?: string; cancel?: string } | null;
  const sc = d.scheduled_change as { action?: string; effective_at?: string } | null;
  return {
    id: d.id as string,
    status: d.status as PaddleSubscription["status"],
    priceId,
    planName,
    nextBilledAt: (d.next_billed_at as string) || null,
    canceledAt: (d.canceled_at as string) || null,
    scheduledChange: sc?.action && sc.effective_at
      ? { action: sc.action as PaddleSubscription["scheduledChange"]["action"], effectiveAt: sc.effective_at }
      : null,
    managementUrls: {
      updatePaymentMethod: mgmt?.update_payment_method ?? null,
      cancel: mgmt?.cancel ?? null,
    },
  };
}

export async function fetchSubscriptionById(subscriptionId: string): Promise<PaddleSubscription | null> {
  if (!subscriptionId || !PADDLE_API_KEY) return null;
  try {
    const data = await paddleFetch<{ data: Record<string, unknown> }>(`/subscriptions/${subscriptionId}`);
    return mapSubscription(data.data);
  } catch {
    return null;
  }
}

export async function fetchSubscriptionsByCustomerId(customerId: string): Promise<PaddleSubscription[]> {
  if (!customerId || !PADDLE_API_KEY) return [];
  try {
    const data = await paddleFetch<{ data: Array<Record<string, unknown>> }>(
      `/subscriptions?customer_id=${customerId}&status=active&per_page=10`
    );
    return (data.data ?? []).map(mapSubscription);
  } catch {
    return [];
  }
}

export async function fetchCustomerByEmail(email: string): Promise<{ id: string } | null> {
  if (!email || !PADDLE_API_KEY) return null;
  try {
    const data = await paddleFetch<{ data: Array<{ id: string }> }>(
      `/customers?email=${encodeURIComponent(email)}&per_page=1`
    );
    return data.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function reactivateSubscription(
  subscriptionId: string
): Promise<{ success: boolean; forbidden: boolean }> {
  if (!subscriptionId || !PADDLE_API_KEY) return { success: false, forbidden: false };
  const res = await fetch(`${PADDLE_BASE}/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scheduled_change: null }),
  });
  if (res.status === 403) {
    return { success: false, forbidden: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paddle reactivate error ${res.status}: ${text}`);
  }
  return { success: true, forbidden: false };
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<{ success: boolean; effectiveAt: string | null; forbidden: boolean }> {
  if (!subscriptionId || !PADDLE_API_KEY) return { success: false, effectiveAt: null, forbidden: false };
  const res = await fetch(`${PADDLE_BASE}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ effective_from: "next_billing_period" }),
  });
  if (res.status === 403) {
    return { success: false, effectiveAt: null, forbidden: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paddle cancel error ${res.status}: ${text}`);
  }
  const data = await res.json() as { data: Record<string, unknown> };
  const sc = data.data?.scheduled_change as { effective_at?: string } | null;
  return { success: true, effectiveAt: sc?.effective_at ?? null, forbidden: false };
}
