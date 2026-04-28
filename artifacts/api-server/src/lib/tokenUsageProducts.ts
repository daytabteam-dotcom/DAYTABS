export const TOKEN_PRODUCT_AREAS = [
  "videoAnalysis",
  "contentPlanner",
  "youtubeGrowth",
] as const;

export type TokenProductArea = (typeof TOKEN_PRODUCT_AREAS)[number];

export const TOKEN_PRODUCT_AREA_SQL_CASE = `
  CASE
    WHEN feature IN ('videoAnalysis', 'chartGeneration') THEN 'videoAnalysis'
    WHEN feature IN ('contentCreation', 'scriptPlanner', 'growthPlanner', 'socialGrowthPlan', 'socialGrowthRegenerate') THEN 'contentPlanner'
    WHEN feature IN ('ytPlanGenerate', 'ytPlanRegenerate', 'channelSync', 'improveIdea', 'perfSummary') THEN 'youtubeGrowth'
    ELSE NULL
  END
`;

export function getTokenProductArea(feature: string): TokenProductArea | null {
  if (feature === "videoAnalysis" || feature === "chartGeneration") return "videoAnalysis";
  if (feature === "contentCreation" || feature === "scriptPlanner" || feature === "growthPlanner" || feature === "socialGrowthPlan" || feature === "socialGrowthRegenerate") {
    return "contentPlanner";
  }
  if (feature === "ytPlanGenerate" || feature === "ytPlanRegenerate" || feature === "channelSync" || feature === "improveIdea" || feature === "perfSummary") {
    return "youtubeGrowth";
  }
  return null;
}
