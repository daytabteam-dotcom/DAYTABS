import { db, tokenLogsTable } from "@workspace/db";

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

  await db.insert(tokenLogsTable).values({
    userId,
    feature,
    model,
    inputTokens,
    outputTokens,
    costUsd: costUsd.toFixed(6),
  });
}

export function usageTokens(usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null) {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}
