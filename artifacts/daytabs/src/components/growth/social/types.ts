export type SocialPlatform = "linkedin" | "tiktok" | "instagram";

export type SocialPostStatus = "posted" | "skipped" | "not_finished";
export type SocialPostPerformance = "great" | "good" | "average" | "poor" | "unknown";

export type SocialPostingMode = "manual" | "ai_optimized";
export type SocialWeekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type SocialGrowthTaskType =
  | "comment"
  | "connect"
  | "follow"
  | "reply"
  | "dm"
  | "research"
  | "save"
  | "engage_with_hashtag"
  | "join_conversation";

export interface GrowthTask {
  id?: string;
  platform: SocialPlatform;
  taskType: SocialGrowthTaskType;
  title: string;
  description: string;
  suggestedTiming: string;
  reason: string;
  relatedToIdea?: string;
  targetProfileType?: string;
  targetTopicOrHashtag?: string;
  completed?: boolean;
}

export interface CarouselSlide {
  slide: number;
  title: string;
  text: string;
  visual: string;
}

export interface StorySequenceStep {
  step: number;
  type: "question" | "poll" | "photo" | "video" | "text" | "link";
  content: string;
  visualDirection?: string;
}

export interface SocialPlanDay {
  id: string;
  day: number;
  date: string;
  contentIdea: string;
  contentType?: string;
  ideaOrigin?: "ai" | "manual";
  aiImproved?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  hook: string;
  outline: string[];
  postContext?: string;
  postDraft?: string;
  script?: string;
  shotList?: string[];
  visualDirection?: string;
  carouselSlides?: CarouselSlide[];
  storySequence?: StorySequenceStep[];
  recordingSuggestions?: string[];
  textOverlays?: string[];
  bestPostingTime: string;
  rationale: string;
  tags: string[];
  descriptionSuggestion: string;
  thumbnailConcept: string;
  caption?: string;
  cta?: string;
  growthTasks?: GrowthTask[];
  soundSuggestion?: string | null;
  status?: SocialPostStatus;
}

export interface PlanPayload {
  summary?: string;
  recommendedPostingStrategy?: string;
  days?: SocialPlanDay[];
}

export interface SocialWeeklyPlan {
  id: number;
  platform: SocialPlatform;
  weekNumber: number;
  startDate: string;
  endDate: string;
  topic: string;
  postsPerWeek: number;
  postingMode?: SocialPostingMode;
  preferredWeekdays?: SocialWeekday[];
  audience?: string | null;
  goal?: string | null;
  tone?: string | null;
  formatPreference?: string | null;
  plan: PlanPayload;
  createdAt?: string;
  updatedAt?: string;
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
