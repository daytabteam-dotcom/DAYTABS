import { db, creditsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

function defaultCreditsForUser(plan: string) {
  const envDefault = Number(process.env.CINE_STUDIO_DEFAULT_CREDITS ?? "0");
  if (Number.isFinite(envDefault) && envDefault > 0) return Math.floor(envDefault);
  // Keep safe by default; operators can raise via env.
  return plan === "studio" ? 100 : 0;
}

export async function getOrCreateCredits(userId: number, rawPlan: string) {
  const [row] = await db.select().from(creditsTable).where(eq(creditsTable.userId, userId)).limit(1);
  if (row) return row;
  const remaining = defaultCreditsForUser(rawPlan);
  const [created] = await db.insert(creditsTable).values({
    userId,
    remainingCredits: remaining,
    updatedAt: new Date(),
  }).returning();
  return created!;
}

export async function requireCredits(userId: number, rawPlan: string, cost: number) {
  const credits = await getOrCreateCredits(userId, rawPlan);
  if ((credits.remainingCredits ?? 0) < cost) {
    const err = new Error("INSUFFICIENT_CREDITS");
    (err as { code?: string; remaining?: number }).code = "INSUFFICIENT_CREDITS";
    (err as { code?: string; remaining?: number }).remaining = credits.remainingCredits ?? 0;
    throw err;
  }
  return credits;
}

export async function deductCredits(userId: number, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await db.update(creditsTable).set({
    remainingCredits: sql`${creditsTable.remainingCredits} - ${Math.floor(amount)}`,
    updatedAt: new Date(),
  }).where(eq(creditsTable.userId, userId));
}

export async function refundCredits(userId: number, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await db.update(creditsTable).set({
    remainingCredits: sql`${creditsTable.remainingCredits} + ${Math.floor(amount)}`,
    updatedAt: new Date(),
  }).where(eq(creditsTable.userId, userId));
}
