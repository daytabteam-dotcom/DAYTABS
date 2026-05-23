export type CineStylePreset =
  | "Hollywood Realism"
  | "Documentary Realism"
  | "Dark Cinematic"
  | "Anime Cinematic"
  | "Historical Realism"
  | "Educational YouTube"
  | "Fantasy Realism";

export type CineAngle =
  | "front view"
  | "side view"
  | "3/4 left"
  | "3/4 right"
  | "back view"
  | "full body"
  | "face close-up"
  | "over-the-shoulder"
  | "low angle"
  | "top view";

export type CineProvider = "openai" | "gemini" | "seedance" | "fal" | "openai+gemini";

export type CineProject = {
  id: string;
  userId: number;
  title: string;
  description: string | null;
  styleId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CineCharacter = {
  id: string;
  projectId: string;
  userId: number;
  name: string;
  basePrompt: string;
  identityPrompt: string | null;
  stylePreset: CineStylePreset | string;
  styleId?: string | null;
  lockedIdentity: boolean;
  referenceImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CineAsset = {
  id: string;
  projectId: string;
  characterId: string | null;
  styleId?: string | null;
  userId: number;
  type: "image" | "video" | string;
  category: "character_sheet" | "angle" | "scene" | "shot" | "final_video" | string;
  url: string;
  prompt: string;
  provider: CineProvider | string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CineJob = {
  id: string;
  userId: number;
  projectId: string;
  characterId: string | null;
  provider: CineProvider | string;
  jobType: string;
  status: "queued" | "processing" | "completed" | "failed" | string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  costCredits: number;
  createdAt: string;
  updatedAt: string;
};

export type CineStyle = {
  id: string;
  userId: number;
  name: string;
  description: string | null;
  stylePrompt: string;
  negativePrompt: string | null;
  colorPalette: string[] | null;
  moodKeywords: string[] | null;
  textureKeywords: string[] | null;
  lightingKeywords: string[] | null;
  referenceImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CineShot = {
  title: string;
  description: string;
  camera_angle: string;
  composition: string;
  lighting: string;
  emotion: string;
  image_prompt: string;
  video_motion_prompt: string;
};

export type CineVideoSettings = {
  duration: "5s" | "10s" | "15s";
  quality: "fast" | "standard" | "HD";
  aspectRatio: "16:9" | "9:16" | "1:1";
  cameraMotion:
    | "static"
    | "slow zoom in"
    | "slow zoom out"
    | "slow pan left"
    | "slow pan right"
    | "dolly in"
    | "handheld subtle";
  customMotionPrompt?: string;
};
