import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  fetchSubscriptionById,
  fetchSubscriptionsByCustomerId,
  fetchCustomerByEmail,
  type PaddleSubscription,
} from "./paddle";

const PRICE_PREMIUM = process.env.PADDLE_PRICE_PREMIUM || process.env.VITE_PADDLE_PRICE_PREMIUM || "";
const PRICE_PRO = process.env.PADDLE_PRICE_PRO || process.env.VITE_PADDLE_PRICE_PRO || "";
const PRICE_PROFESSIONAL = process.env.PADDLE_PRICE_PROFESSIONAL || process.env.VITE_PADDLE_PRICE_PROFESSIONAL || "";
const PRICE_FREE = process.env.PADDLE_PRICE_FREE || process.env.VITE_PADDLE_PRICE_FREE || "";

const PRICE_TO_PLAN: Record<string, string> = {
  [PRICE_PREMIUM]: "creator",
  [PRICE_PRO]: "pro",
  [PRICE_PROFESSIONAL]: "studio",
  [PRICE_FREE]: "free",
};

function priceIdToPlan(priceId: string): string | null {
  return PRICE_TO_PLAN[priceId] ?? null;
}

interface LoggerLike {
  info: (obj: Record<string, unknown>, message: string) => void;
}

type UserRecord = typeof usersTable.$inferSelect;

export interface PaddlePlanSyncResult {
  subscription: PaddleSubscription | null;
  planToStore: string;
  synced: boolean;
  freshUser: UserRecord;
}

export async function syncUserPlanFromPaddle(user: UserRecord, log?: LoggerLike): Promise<PaddlePlanSyncResult> {
  let subscription: PaddleSubscription | null = null;
  let syncedPlan: string | null = null;
  let syncedSubscriptionId: string | null = null;
  let syncedCustomerId: string | null = null;
  let clearCancelsAt = false;

  if (user.paddleSubscriptionId) {
    subscription = await fetchSubscriptionById(user.paddleSubscriptionId);
    if (subscription?.status === "active" || subscription?.status === "trialing") {
      syncedPlan = priceIdToPlan(subscription.priceId) ?? null;
      syncedSubscriptionId = subscription.id;
    }

    if (subscription?.status === "canceled") {
      const cancelsAt = user.subscriptionCancelsAt;
      if (cancelsAt && cancelsAt > new Date()) {
        if (!subscription.scheduledChange) {
          subscription = {
            ...subscription,
            status: "active",
            scheduledChange: { action: "cancel", effectiveAt: cancelsAt.toISOString() },
          };
        } else {
          subscription = { ...subscription, status: "active" };
        }
      } else {
        subscription = null;
        syncedPlan = "free";
        syncedSubscriptionId = "";
        clearCancelsAt = true;
      }
    } else if (subscription?.status === "active" && !subscription.scheduledChange && user.subscriptionCancelsAt) {
      const cancelsAt = user.subscriptionCancelsAt;
      if (cancelsAt > new Date()) {
        subscription = {
          ...subscription,
          scheduledChange: { action: "cancel", effectiveAt: cancelsAt.toISOString() },
        };
      }
    } else if (subscription?.status === "active" && subscription.scheduledChange?.action !== "cancel" && user.subscriptionCancelsAt) {
      clearCancelsAt = true;
    }
  }

  if (!subscription && user.paddleCustomerId) {
    const subs = await fetchSubscriptionsByCustomerId(user.paddleCustomerId);
    subscription = subs.find((s) => s.status === "active" || s.status === "trialing") ?? subs[0] ?? null;
    if (subscription) {
      syncedPlan = priceIdToPlan(subscription.priceId) ?? null;
      syncedSubscriptionId = subscription.id;
    }
  }

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

  const planToStore = syncedPlan ?? user.plan;
  const synced =
    (syncedPlan !== null && syncedPlan !== user.plan) ||
    (syncedSubscriptionId !== null && syncedSubscriptionId !== user.paddleSubscriptionId) ||
    (syncedCustomerId !== null && syncedCustomerId !== user.paddleCustomerId) ||
    clearCancelsAt;

  let freshUser = user;
  if (synced) {
    const updates: Record<string, unknown> = { plan: planToStore };
    if (syncedSubscriptionId !== null) updates.paddleSubscriptionId = syncedSubscriptionId || null;
    if (syncedCustomerId !== null) updates.paddleCustomerId = syncedCustomerId;
    if (clearCancelsAt) updates.subscriptionCancelsAt = null;
    const [updatedUser] = await db
      .update(usersTable)
      .set(updates as never)
      .where(eq(usersTable.id, user.id))
      .returning();
    freshUser = updatedUser ?? ({ ...user, ...updates } as UserRecord);
    log?.info({ userId: user.id, planToStore, syncedSubscriptionId, syncedCustomerId, clearCancelsAt }, "Synced plan from Paddle");
  }

  return { subscription, planToStore, synced, freshUser };
}
