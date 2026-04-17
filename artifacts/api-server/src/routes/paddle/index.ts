import { Router } from "express";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { requireAuth } from "../../middlewares/auth";
import {
  fetchAllPrices,
  fetchSubscriptionById,
  fetchSubscriptionsByCustomerId,
  fetchCustomerByEmail,
  cancelSubscription,
  reactivateSubscription,
  createPortalSession,
} from "../../lib/paddle";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || "";
const PADDLE_CLIENT_TOKEN = process.env.PADDLE_CLIENT_TOKEN || process.env.VITE_PADDLE_CLIENT_TOKEN || "";
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || process.env.VITE_PADDLE_ENVIRONMENT || "production";
const PRICE_PREMIUM = process.env.PADDLE_PRICE_PREMIUM || process.env.VITE_PADDLE_PRICE_PREMIUM || "";
const PRICE_PRO = process.env.PADDLE_PRICE_PRO || process.env.VITE_PADDLE_PRICE_PRO || "";
const PRICE_PROFESSIONAL = process.env.PADDLE_PRICE_PROFESSIONAL || process.env.VITE_PADDLE_PRICE_PROFESSIONAL || "";
const PRICE_FREE = process.env.PADDLE_PRICE_FREE || process.env.VITE_PADDLE_PRICE_FREE || "";

const PRICE_TO_PLAN: Record<string, string> = {
  [PRICE_PREMIUM]: "creator",
  [PRICE_PROFESSIONAL]: "studio",
  [PRICE_PRO]: "pro",
  [PRICE_FREE]: "free",
};

function priceIdToPlan(priceId: string): string | null {
  return PRICE_TO_PLAN[priceId] ?? null;
}

function signToken(userId: number, email: string, name: string | null, plan: string) {
  return jwt.sign(
    { user_id: userId, email, name: name || email.split("@")[0], plan },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  try {
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(";")) {
      const [k, v] = part.split("=", 2);
      if (k && v) parts[k.trim()] = v.trim();
    }
    const ts = parts["ts"];
    const h1 = parts["h1"];
    if (!ts || !h1) return false;
    const payload = `${ts}:${rawBody}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(h1, "hex"));
  } catch {
    return false;
  }
}

/**
 * GET /api/paddle/config
 * Returns public Paddle JS configuration for the static frontend.
 * The client token is intentionally public and is not the Paddle API key.
 */
router.get("/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    clientToken: PADDLE_CLIENT_TOKEN,
    environment: PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
    configured: Boolean(PADDLE_CLIENT_TOKEN),
  });
});

/**
 * GET /api/paddle/prices
 * Returns live price data (amount, currency, billing period) from Paddle.
 * Public — no auth required.
 */
router.get("/prices", async (req, res) => {
  try {
    const prices = await fetchAllPrices();
    res.json({ prices });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Paddle prices");
    res.status(500).json({ error: "Failed to fetch prices" });
  }
});

/**
 * GET /api/paddle/subscription
 * Returns the authenticated user's active Paddle subscription (if any).
 */
router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.user_id))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    let subscription = null;
    let syncedPlan: string | null = null;
    let syncedSubscriptionId: string | null = null;
    let syncedCustomerId: string | null = null;
    let clearCancelsAt = false;

    // 1. Try by stored subscription ID first (fastest)
    if (user.paddleSubscriptionId) {
      subscription = await fetchSubscriptionById(user.paddleSubscriptionId);
      if (subscription?.status === "canceled") {
        // Subscription is fully cancelled in Paddle.
        // Check if user still has access (subscriptionCancelsAt is in the future).
        const cancelsAt = user.subscriptionCancelsAt;
        if (cancelsAt && cancelsAt > new Date()) {
          // Access period still active — keep paid plan, show as "cancels on [date]"
          // Inject scheduledChange if Paddle didn't return one
          if (!subscription.scheduledChange) {
            subscription = {
              ...subscription,
              status: "active" as const,
              scheduledChange: { action: "cancel" as const, effectiveAt: cancelsAt.toISOString() },
            };
          } else {
            // Keep as-is but override status to active so frontend shows correctly
            subscription = { ...subscription, status: "active" as const };
          }
        } else {
          // Period has ended, downgrade to free
          subscription = null;
          syncedPlan = "free";
          syncedSubscriptionId = "";
          clearCancelsAt = true;
        }
      } else if (subscription?.status === "active" && !subscription.scheduledChange && user.subscriptionCancelsAt) {
        // Paddle API hasn't reflected the scheduled cancellation yet (eventual consistency).
        // Fall back to what we stored in the DB.
        const cancelsAt = user.subscriptionCancelsAt;
        if (cancelsAt > new Date()) {
          subscription = {
            ...subscription,
            scheduledChange: { action: "cancel" as const, effectiveAt: cancelsAt.toISOString() },
          };
        }
      } else if (subscription?.status === "active" && subscription.scheduledChange?.action !== "cancel") {
        // Subscription is active without pending cancellation — clear any stale cancelsAt
        if (user.subscriptionCancelsAt) clearCancelsAt = true;
      }
    }

    // 2. Fall back to customer ID lookup
    if (!subscription && user.paddleCustomerId) {
      const subs = await fetchSubscriptionsByCustomerId(user.paddleCustomerId);
      subscription = subs.find((s) => s.status === "active" || s.status === "trialing") ?? subs[0] ?? null;
      if (subscription) {
        syncedPlan = priceIdToPlan(subscription.priceId) ?? null;
        syncedSubscriptionId = subscription.id;
      }
    }

    // 3. Email-based fallback — catches users whose Paddle IDs were never stored
    if (!subscription) {
      const customer = await fetchCustomerByEmail(user.email);
      if (customer) {
        syncedCustomerId = customer.id;
        const subs = await fetchSubscriptionsByCustomerId(customer.id);
        subscription = subs.find((s) => s.status === "active" || s.status === "trialing") ?? subs[0] ?? null;
        if (subscription) {
          syncedPlan = priceIdToPlan(subscription.priceId) ?? null;
          syncedSubscriptionId = subscription.id;
        }
      }
    }

    // 4. Persist any discovered changes
    const planToStore = syncedPlan ?? user.plan;
    const needsUpdate =
      (syncedPlan !== null && syncedPlan !== user.plan) ||
      (syncedSubscriptionId !== null && syncedSubscriptionId !== user.paddleSubscriptionId) ||
      (syncedCustomerId !== null && syncedCustomerId !== user.paddleCustomerId) ||
      clearCancelsAt;

    if (needsUpdate) {
      const updates: Record<string, unknown> = { plan: planToStore };
      if (syncedSubscriptionId !== null) updates.paddleSubscriptionId = syncedSubscriptionId || null;
      if (syncedCustomerId !== null) updates.paddleCustomerId = syncedCustomerId;
      if (clearCancelsAt) updates.subscriptionCancelsAt = null;
      await db.update(usersTable).set(updates as never).where(eq(usersTable.id, user.id));
      req.log.info({ userId: user.id, planToStore, syncedSubscriptionId, clearCancelsAt }, "Synced plan from Paddle");
    }

    // 5. Return fresh JWT so the client can update its token immediately
    const freshToken = needsUpdate
      ? signToken(user.id, user.email, user.name, planToStore)
      : null;

    res.json({ subscription, plan: planToStore, freshToken });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch subscription");
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * POST /api/paddle/cancel-subscription
 * Cancel the user's subscription at the end of the current billing period.
 * No immediate refund — the plan stays active until next_billed_at, then resets to free.
 */
router.post("/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.user_id))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.paddleSubscriptionId) {
      res.status(400).json({ error: "No active subscription found" });
      return;
    }

    const result = await cancelSubscription(user.paddleSubscriptionId);

    if (result.forbidden) {
      // API key lacks cancel permission — fall back to Paddle's self-serve portal
      const subscription = await fetchSubscriptionById(user.paddleSubscriptionId);
      const portalUrl = subscription?.managementUrls?.cancel ?? null;
      req.log.warn({ userId: user.id }, "Paddle cancel forbidden — returning portal URL fallback");
      res.json({ success: false, requiresPortal: true, portalUrl, effectiveAt: null });
      return;
    }

    // Store the cancels-at date in DB so we have it even if Paddle API is slow to reflect it
    if (result.effectiveAt) {
      try {
        await db
          .update(usersTable)
          .set({ subscriptionCancelsAt: new Date(result.effectiveAt) } as never)
          .where(eq(usersTable.id, user.id));
        req.log.info({ userId: user.id, effectiveAt: result.effectiveAt }, "Stored subscriptionCancelsAt");
      } catch (dbErr) {
        req.log.error({ dbErr }, "Failed to store subscriptionCancelsAt");
      }
    }

    res.json({ success: result.success, effectiveAt: result.effectiveAt, requiresPortal: false, portalUrl: null });
  } catch (err) {
    req.log.error({ err }, "Failed to cancel subscription");
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

/**
 * POST /api/paddle/reactivate-subscription
 * Remove a pending cancellation so the subscription continues normally.
 */
router.post("/reactivate-subscription", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.user_id))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.paddleSubscriptionId) {
      res.status(400).json({ error: "No active subscription found" });
      return;
    }

    const result = await reactivateSubscription(user.paddleSubscriptionId);

    if (result.forbidden) {
      const subscription = await fetchSubscriptionById(user.paddleSubscriptionId);
      const portalUrl = subscription?.managementUrls?.cancel ?? null;
      req.log.warn({ userId: user.id }, "Paddle reactivate forbidden — returning portal URL fallback");
      res.json({ success: false, requiresPortal: true, portalUrl });
      return;
    }

    // Clear the stored cancellation date since the user is keeping their plan
    if (result.success) {
      try {
        await db
          .update(usersTable)
          .set({ subscriptionCancelsAt: null } as never)
          .where(eq(usersTable.id, user.id));
        req.log.info({ userId: user.id }, "Cleared subscriptionCancelsAt on reactivation");
      } catch (dbErr) {
        req.log.error({ dbErr }, "Failed to clear subscriptionCancelsAt");
      }
    }

    res.json({ success: result.success, requiresPortal: false, portalUrl: null });
  } catch (err) {
    req.log.error({ err }, "Failed to reactivate subscription");
    res.status(500).json({ error: "Failed to reactivate subscription" });
  }
});

/**
 * POST /api/paddle/portal
 * Generate a Paddle customer portal session URL for the authenticated user.
 * The portal lets them update payment methods, view invoices, and manage billing.
 */
router.post("/portal", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.user_id))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Ensure we have a Paddle customer ID — look it up by email if not stored
    let customerId = user.paddleCustomerId;
    if (!customerId) {
      const customer = await fetchCustomerByEmail(user.email);
      if (customer) {
        customerId = customer.id;
        await db
          .update(usersTable)
          .set({ paddleCustomerId: customerId } as never)
          .where(eq(usersTable.id, user.id));
      }
    }

    if (!customerId) {
      res.status(400).json({ error: "No billing account found. Please subscribe first." });
      return;
    }

    const session = await createPortalSession(customerId, user.paddleSubscriptionId ?? undefined);
    if (!session) {
      res.status(500).json({ error: "Could not generate portal session" });
      return;
    }

    req.log.info({ userId: user.id }, "Paddle portal session created");
    res.json({ portalUrl: session.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create portal session");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

/**
 * POST /api/paddle/webhook
 * Paddle sends subscription lifecycle events here.
 */
router.post("/webhook", async (req, res) => {
  const rawBody = JSON.stringify(req.body);
  const signatureHeader = req.headers["paddle-signature"] as string | undefined;

  if (WEBHOOK_SECRET && signatureHeader) {
    if (!verifyPaddleSignature(rawBody, signatureHeader, WEBHOOK_SECRET)) {
      req.log.warn("Paddle webhook signature verification failed");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const eventType: string = req.body?.event_type ?? req.body?.notification_type ?? "";
  const data = req.body?.data ?? req.body;

  req.log.info({ eventType }, "Paddle webhook received");

  if (
    eventType === "subscription.activated" ||
    eventType === "subscription.resumed" ||
    eventType === "subscription.updated" ||
    eventType === "transaction.completed"
  ) {
    const customerEmail: string | undefined =
      data?.customer?.email ?? data?.custom_data?.user_email;
    const userId: number | undefined =
      data?.custom_data?.user_id ? Number(data.custom_data.user_id) : undefined;
    const customerId: string | undefined = data?.customer_id ?? data?.customer?.id;
    const subscriptionId: string | undefined = data?.id ?? data?.subscription_id;
    const priceId: string | undefined =
      data?.items?.[0]?.price?.id ?? data?.price?.id;
    const plan = priceId ? priceIdToPlan(priceId) : null;

    // If this is a subscription.updated with a scheduled cancellation, store the cancels-at date
    const scheduledChange = data?.scheduled_change;
    const isScheduledCancel =
      eventType === "subscription.updated" &&
      scheduledChange?.action === "cancel" &&
      scheduledChange?.effective_at;

    if (plan && plan !== "free" && (customerEmail || userId)) {
      try {
        const where = userId
          ? eq(usersTable.id, userId)
          : eq(usersTable.email, customerEmail!);

        const updates: Record<string, unknown> = { plan: plan as string };
        if (customerId) updates.paddleCustomerId = customerId;
        if (subscriptionId) updates.paddleSubscriptionId = subscriptionId;
        // Reset billing cycle anchor and clear flags on fresh activation
        if (eventType === "subscription.activated") {
          updates.cycleStartAt = new Date();
          updates.subscriptionCancelsAt = null;
          updates.subscriptionPastDue = false;
        }
        // resumed = payment recovered after past_due; clear the past-due flag and any pending cancel
        if (eventType === "subscription.resumed") {
          updates.subscriptionCancelsAt = null;
          updates.subscriptionPastDue = false;
        }
        // If this update has a scheduled cancellation, persist the effective date
        if (isScheduledCancel) {
          updates.subscriptionCancelsAt = new Date(scheduledChange.effective_at as string);
        }

        await db.update(usersTable).set(updates as never).where(where);
        req.log.info({ plan, customerEmail, userId, eventType, isScheduledCancel }, "Plan updated via webhook");
      } catch (err) {
        req.log.error({ err }, "Failed to update plan via webhook");
      }
    }
  }

  // subscription.past_due — payment failed, Paddle will retry automatically.
  // Flag the user without downgrading their plan.
  if (eventType === "subscription.past_due") {
    const customerEmail: string | undefined =
      data?.customer?.email ?? data?.custom_data?.user_email;
    const userId: number | undefined =
      data?.custom_data?.user_id ? Number(data.custom_data.user_id) : undefined;

    if (customerEmail || userId) {
      try {
        const where = userId
          ? eq(usersTable.id, userId)
          : eq(usersTable.email, customerEmail!);
        await db
          .update(usersTable)
          .set({ subscriptionPastDue: true } as never)
          .where(where);
        req.log.info({ customerEmail, userId }, "Subscription past_due flagged");
      } catch (err) {
        req.log.error({ err }, "Failed to flag subscription past_due");
      }
    }
  }

  if (
    eventType === "subscription.canceled" ||
    eventType === "subscription.paused"
  ) {
    const customerEmail: string | undefined =
      data?.customer?.email ?? data?.custom_data?.user_email;
    const userId: number | undefined =
      data?.custom_data?.user_id ? Number(data.custom_data.user_id) : undefined;

    if (customerEmail || userId) {
      try {
        const where = userId
          ? eq(usersTable.id, userId)
          : eq(usersTable.email, customerEmail!);
        await db
          .update(usersTable)
          .set({ plan: "free" as string, paddleSubscriptionId: null, subscriptionCancelsAt: null, subscriptionPastDue: false } as never)
          .where(where);
        req.log.info({ customerEmail, userId }, "Plan reset to free via webhook");
      } catch (err) {
        req.log.error({ err }, "Failed to reset plan via webhook");
      }
    }
  }

  res.json({ received: true });
});

/**
 * POST /api/paddle/checkout-complete
 * Called immediately by the frontend when checkout.completed fires.
 */
router.post("/checkout-complete", requireAuth, async (req, res) => {
  try {
    const { priceId, customerId, subscriptionId } = req.body as {
      priceId?: string;
      customerId?: string;
      subscriptionId?: string;
    };
    if (!priceId) { res.status(400).json({ error: "priceId is required" }); return; }

    const plan = priceIdToPlan(priceId);
    if (!plan || plan === "free") { res.status(400).json({ error: "Invalid priceId" }); return; }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.user_id))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const updates: Record<string, unknown> = { plan: plan as string };
    if (customerId) updates.paddleCustomerId = customerId;
    if (subscriptionId) updates.paddleSubscriptionId = subscriptionId;
    // Set cycle anchor to now — subscriber's month starts from checkout date
    updates.cycleStartAt = new Date();
    // Clear any stale cancellation date on new subscription
    updates.subscriptionCancelsAt = null;

    await db.update(usersTable).set(updates as never).where(eq(usersTable.id, user.id));

    const token = signToken(user.id, user.email, user.name, plan);
    req.log.info({ userId: user.id, plan }, "Plan updated via checkout-complete");
    res.json({ token, plan });
  } catch (err) {
    req.log.error({ err }, "checkout-complete error");
    res.status(500).json({ error: "Failed to update plan" });
  }
});

export default router;
