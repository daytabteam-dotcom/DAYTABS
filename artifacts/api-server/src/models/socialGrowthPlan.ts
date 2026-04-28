export type SocialPlatform = "linkedin" | "tiktok" | "instagram";

export type SocialPostStatus = "posted" | "skipped" | "not_finished";
export type SocialPostPerformance = "great" | "good" | "average" | "poor" | "unknown";

export interface SocialPlanDay {
  id: string;
  day: number;
  date: string; // ISO YYYY-MM-DD
  contentIdea: string;
  hook: string;
  outline: string[];
  bestPostingTime: string;
  rationale: string;
  tags: string[];
  descriptionSuggestion: string;
  thumbnailConcept: string;
  soundSuggestion?: string | null;
  status?: SocialPostStatus;
}

export interface PlanPayload {
  summary?: string;
  days?: SocialPlanDay[];
}

export interface SocialPostPerformanceFeedback {
  planDayId: string;
  date: string;
  contentIdea: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  performance: SocialPostPerformance;
  engagementNotes?: string;
  viewsOrImpressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  newFollowers?: number;
  whatWorked?: string;
  whatDidNotWork?: string;
  userNotes?: string;
}

export interface SocialWeeklyPlanCreateInput {
  platform: SocialPlatform;
  startDate: string;
  endDate: string;
  topic: string;
  postsPerWeek: number;
  audience?: string;
  goal?: string;
  tone?: string;
  formatPreference?: string;
  plan: PlanPayload;
}

