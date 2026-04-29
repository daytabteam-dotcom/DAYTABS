import type { PlanPayload, SocialPlanDay, SocialPostPerformanceFeedback } from "../models/socialGrowthPlan";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how", "i", "in", "into", "is", "it", "of", "on", "or", "our", "out", "that", "the", "this", "to", "we", "what", "when", "where", "why", "with", "you", "your",
]);

function clampText(value: unknown, maxLen: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && t.length <= 24 && !STOPWORDS.has(t));
}

function topNCounts(items: string[], n: number) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

function dayIdeaSnippet(day: SocialPlanDay) {
  return clampText(day.contentIdea, 90);
}

function summarizeDays(days: SocialPlanDay[]) {
  const manual = days.filter((d) => d.ideaOrigin === "manual" && !d.isDeleted);
  const ai = days.filter((d) => (d.ideaOrigin ?? "ai") === "ai" && !d.isDeleted);
  const deleted = days.filter((d) => Boolean(d.isDeleted));

  const postedManual = manual.filter((d) => d.status === "posted");
  const postedAi = ai.filter((d) => d.status === "posted");
  const skipped = days.filter((d) => !d.isDeleted && d.status === "skipped");
  const notFinished = days.filter((d) => !d.isDeleted && (!d.status || d.status === "not_finished"));

  const manualTypes = topNCounts(manual.map((d) => d.contentType ?? "").filter(Boolean), 6);
  const aiTypes = topNCounts(ai.map((d) => d.contentType ?? "").filter(Boolean), 6);

  const manualKeywords = topNCounts(manual.flatMap((d) => tokenize(`${d.contentIdea} ${(d.tags ?? []).join(" ")}`)), 10);
  const deletedKeywords = topNCounts(deleted.flatMap((d) => tokenize(`${d.contentIdea} ${(d.tags ?? []).join(" ")}`)), 8);

  const tasks = days
    .filter((d) => !d.isDeleted)
    .flatMap((d) => (d.growthTasks ?? []).map((t) => ({ ...t, planDayId: d.id, idea: d.contentIdea })));
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => Boolean(t.completed)).length;
  const taskTypesTop = topNCounts(tasks.map((t) => t.taskType ?? "").filter(Boolean), 8);

  return {
    counts: {
      totalDays: days.length,
      manualIdeas: manual.length,
      aiIdeas: ai.length,
      deletedIdeas: deleted.length,
      postedManual: postedManual.length,
      postedAi: postedAi.length,
      skipped: skipped.length,
      notFinished: notFinished.length,
    },
    topContentTypes: {
      manual: manualTypes,
      ai: aiTypes,
    },
    topKeywords: {
      manual: manualKeywords,
      deleted: deletedKeywords,
    },
    workflow: {
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : null,
        topTaskTypes: taskTypesTop,
      },
    },
    examples: {
      strongestPositive: [
        ...postedManual.slice(0, 2).map((d) => ({ signal: "manual_posted", contentType: d.contentType ?? null, idea: dayIdeaSnippet(d) })),
        ...postedAi.slice(0, 2).map((d) => ({ signal: "ai_posted", contentType: d.contentType ?? null, idea: dayIdeaSnippet(d) })),
      ].slice(0, 4),
      deleted: deleted.slice(0, 3).map((d) => ({ signal: "deleted", origin: d.ideaOrigin ?? "ai", contentType: d.contentType ?? null, idea: dayIdeaSnippet(d) })),
      unfinishedAi: ai.filter((d) => d.status !== "posted").slice(0, 3).map((d) => ({ signal: "unused_ai_idea", contentType: d.contentType ?? null, idea: dayIdeaSnippet(d) })),
    },
  };
}

function summarizeFeedback(feedback: SocialPostPerformanceFeedback[] | null | undefined) {
  const items = Array.isArray(feedback) ? feedback : [];
  const positives = items.flatMap((f) => tokenize(`${f.whatWorked ?? ""} ${f.engagementNotes ?? ""}`));
  const negatives = items.flatMap((f) => tokenize(`${f.whatDidNotWork ?? ""}`));
  const positivePhrases = topNCounts(positives, 10);
  const negativePhrases = topNCounts(negatives, 10);

  const byPerformance = items.reduce<Record<string, number>>((acc, entry) => {
    const key = `${entry.status}:${entry.performance}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    counts: {
      total: items.length,
      byPerformance,
    },
    highlights: {
      whatWorkedKeywords: positivePhrases,
      whatDidNotWorkKeywords: negativePhrases,
    },
    examples: {
      topWhatWorked: items.filter((f) => clampText(f.whatWorked, 1)).slice(0, 3).map((f) => ({
        performance: f.performance,
        idea: clampText(f.contentIdea, 80),
        whatWorked: clampText(f.whatWorked, 140),
      })),
      topWhatDidNotWork: items.filter((f) => clampText(f.whatDidNotWork, 1)).slice(0, 3).map((f) => ({
        performance: f.performance,
        idea: clampText(f.contentIdea, 80),
        whatDidNotWork: clampText(f.whatDidNotWork, 140),
      })),
    },
  };
}

export function buildSocialGrowthBehaviorSummary(input: {
  previousPlan: PlanPayload | null | undefined;
  previousFeedback: SocialPostPerformanceFeedback[] | null | undefined;
  skippedFeedback?: boolean;
}) {
  const days = Array.isArray(input.previousPlan?.days) ? input.previousPlan!.days! : [];
  const daySummary = summarizeDays(days);
  const feedbackSummary = input.skippedFeedback ? { skipped: true } : summarizeFeedback(input.previousFeedback);

  const frictionSignals: string[] = [];
  if ((daySummary.counts.notFinished ?? 0) >= Math.max(2, Math.ceil((daySummary.counts.totalDays ?? 0) / 2))) {
    frictionSignals.push("Many posts were not finished last week. Keep next week lighter and easier to execute.");
  }
  if (typeof (daySummary.workflow.tasks.completionRate) === "number" && daySummary.workflow.tasks.completionRate < 50) {
    frictionSignals.push("Growth tasks had low completion. Reduce task load and split into smaller steps.");
  }

  return {
    priorityRule: "User behavior is the strongest signal. Follow this summary before inventing new directions.",
    signalsByPriority: [
      "Manual ideas created",
      "Posted content",
      "End-of-week feedback",
      "Completed tasks",
      "Deleted ideas/tasks",
      "Incomplete tasks",
      "Unused AI ideas",
    ],
    daySummary,
    feedbackSummary,
    frictionSignals,
  };
}

