import { Router } from "express";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { requireAuth } from "../../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "daytabs-dev-secret-change-in-production";
const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || "";

const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.PADDLE_PRICE_PREMIUM || ""]: "premium",
  [process.env.PADDLE_PRICE_PROFESSIONAL || ""]: "professional",
  [process.env.PADDLE_PRICE_FREE || ""]: "free",
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
 * POST /api/paddle/webhook
 * Paddle sends subscription lifecycle events here.
 * Configure in Paddle Dashboard → Notifications → New Notification.
 * Set PADDLE_WEBHOOK_SECRET env var to the webhook secret from the dashboard.
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
    eventType === "subscription.updated" ||
    eventType === "transaction.completed"
  ) {
    const customerEmail: string | undefined =
      data?.customer?.email ?? data?.custom_data?.user_email;

    const userId: number | undefined =
      data?.custom_data?.user_id ? Number(data.custom_data.user_id) : undefined;

    const priceId: string | undefined =
      data?.items?.[0]?.price?.id ?? data?.price?.id;

    const plan = priceId ? priceIdToPlan(priceId) : null;

    if (plan && plan !== "free" && (customerEmail || userId)) {
      try {
        const where = userId
          ? eq(usersTable.id, userId)
          : eq(usersTable.email, customerEmail!);

        await db.update(usersTable).set({ plan: plan as string }).where(where);
        req.log.info({ plan, customerEmail, userId }, "Plan updated via webhook");
      } catch (err) {
        req.log.error({ err }, "Failed to update plan via webhook");
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
        await db.update(usersTable).set({ plan: "free" as string }).where(where);
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
 * Called immediately by the frontend when the Paddle checkout.completed event fires.
 * Requires auth. Updates the plan in DB and issues a fresh JWT.
 */
router.post("/checkout-complete", requireAuth, async (req, res) => {
  try {
    const { priceId } = req.body as { priceId?: string };
    if (!priceId) { res.status(400).json({ error: "priceId is required" }); return; }

    const plan = priceIdToPlan(priceId);
    if (!plan || plan === "free") { res.status(400).json({ error: "Invalid priceId" }); return; }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.user_id))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    await db.update(usersTable).set({ plan } as never).where(eq(usersTable.id, user.id));

    const token = signToken(user.id, user.email, user.name, plan);
    req.log.info({ userId: user.id, plan }, "Plan updated via checkout-complete");
    res.json({ token, plan });
  } catch (err) {
    req.log.error({ err }, "checkout-complete error");
    res.status(500).json({ error: "Failed to update plan" });
  }
});

export default router;
