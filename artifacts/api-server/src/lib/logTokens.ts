import { db, tokenLogsTable, userUsageTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUsage } from "./usageService";
import { getTokenProductArea } from "./tokenUsageProducts";

const COST_RATES: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005 / 1000, output: 0.015 / 1000 },
  "gpt-4o-mini": { input: 0.00015 / 1000, output: 0.0006 / 1000 },
};

export async function logTokenUsage({
  userId,
  feature,
  model,
  inputTokens,
  outputTokens,
}: {
  userId: number;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const rates = COST_RATES[model] ?? COST_RATES["gpt-4o"];
  const costUsd = inputTokens * rates.input + outputTokens * rates.output;
  const totalTokens = inputTokens + outputTokens;
  const productArea = getTokenProductArea(feature);
  const usage = userId && productArea ? await getOrCreateUsage(userId) : null;

  await db.insert(tokenLogsTable).values({
    userId,
    feature,
    model,
    inputTokens,
    outputTokens,
    costUsd: costUsd.toFixed(6),
  });

  if (userId && productArea && usage) {
    await db.update(userUsageTable).set({
      videoAnalysisTokensUsed: productArea === "videoAnalysis"
        ? (usage.videoAnalysisTokensUsed ?? 0) + totalTokens
        : (usage.videoAnalysisTokensUsed ?? 0),
      contentPlannerTokensUsed: productArea === "contentPlanner"
        ? (usage.contentPlannerTokensUsed ?? 0) + totalTokens
        : (usage.contentPlannerTokensUsed ?? 0),
      youtubeGrowthTokensUsed: productArea === "youtubeGrowth"
        ? (usage.youtubeGrowthTokensUsed ?? 0) + totalTokens
        : (usage.youtubeGrowthTokensUsed ?? 0),
      lastUpdated: new Date(),
    }).where(eq(userUsageTable.userId, userId));
  }
}

export function usageTokens(usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null) {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}
