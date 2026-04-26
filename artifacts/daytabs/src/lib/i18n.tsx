import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

export const SUPPORTED_DAYTABS_LOCALES = [
  "en",
  "tr",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "ru",
  "ar",
  "hi",
  "ja",
  "ko",
  "zh",
] as const;

export type DayTabsLocale = (typeof SUPPORTED_DAYTABS_LOCALES)[number];

export const DAYTABS_LOCALE_LABELS: Record<DayTabsLocale, string> = {
  en: "English",
  tr: "Turkce",
  es: "Espanol",
  fr: "Francais",
  de: "Deutsch",
  pt: "Portugues",
  it: "Italiano",
  nl: "Nederlands",
  ru: "Russkiy",
  ar: "Arabic",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

export const DAYTABS_LOCALE_STORAGE_KEY = "daytabs_ui_locale";

export type DayTabsCopy = {
  languageLabel: string;
  tabs: {
    dashboard: { label: string; desc: string };
    "video-analyzer": { label: string; desc: string };
    "script-planner": { label: string; desc: string };
    "growth-planner": { label: string; desc: string };
    "youtube-audit": { label: string; desc: string };
    "youtube-transcript": { label: string; desc: string };
    teleprompter: { label: string; desc: string };
  };
  notifications: {
    button: string;
    title: string;
    active: string;
    empty: string;
    dueToday: (count: number) => string;
    dueTodayHelper: string;
    overdue: (count: number) => string;
    overdueHelper: string;
  };
  dashboard: {
    welcome: (name: string) => string;
    subtitle: string;
    used: string;
    remaining: string;
    thisMonth: string;
    analysesLeft: string;
    monthlyUsageUsed: (used: number, total: number) => string;
    remainingInline: (remaining: number) => string;
    upgrade: string;
    monthlyUsageProgress: string;
    monthlyLimitNote: (limit: number) => string;
    statUsageUsed: string;
    statUsageLeft: string;
    statScriptGenerations: string;
    statMaxDuration: string;
    perVideo: string;
    quickActions: string;
    actions: {
      analyze: { title: string; desc: string };
      script: { title: string; desc: string };
      teleprompter: { title: string; desc: string };
      growth: { title: string; desc: string; badge: string };
      audit: { title: string; desc: string; badge: string };
      upgrade: { title: string; desc: string };
    };
    capabilities: string;
    features: {
      quality: { label: string; desc: string };
      editing: { label: string; desc: string };
      publish: { label: string; desc: string; locked: boolean };
    };
  };
  growthPlanner: {
    header: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    subtabs: {
      overview: string;
      plan: string;
      competitors: string;
      insights: string;
      tasks: string;
    };
    viewModes: {
      calendar: string;
      planner: string;
    };
    stages: {
      idea: string;
      recording: string;
      editing: string;
      published: string;
      draft: string;
    };
    actions: {
      generatePlan: string;
      settings: string;
      refreshChannel: string;
    };
    commandCenter: {
      eyebrow: string;
      connectedChannelFallback: string;
      nicheProfileFallback: string;
      subscribersLabel: string;
      totalViewsLabel: string;
      videosLabel: string;
    };
    stats: {
      weeklyTargetLabel: string;
      weeklyTargetCaption: string;
      uploadsLabel: (count: number) => string;
      progressLabel: string;
      progressCaption: string;
      publishedLabel: (count: number) => string;
      bestSlotLabel: string;
      bestSlotNoData: string;
      bestSlotAvgViewsSuffix: string;
      bestSlotMoreUploads: string;
    };
    overview: {
      insightCardsLabel: string;
      openTasks: string;
      openCompetitors: string;
      openInsights: string;
    };
    overviewPanel: {
      todayEyebrow: string;
      todaysPlannedCardsTitle: string;
      todaysPlannedCardsSubtitle: string;
      noPendingUploadTitle: string;
      noPendingUploadSubtitle: string;
      addIdeaButton: string;
      publishButton: string;
      moveButton: string;
      planAtGlanceTitle: string;
      planAtGlanceSubtitle: string;
      plannedCardsLabel: string;
      publishedThisWeekLabel: string;
      bestNextSlotLabel: string;
      openPlanningWorkspaceButton: string;
      needsAttentionTitle: string;
      needsAttentionSubtitle: string;
      tasksWaitingLabel: string;
      competitorsSavedLabel: string;
      actionQueueEyebrow: string;
      actionQueueTitle: string;
      actionQueueSubtitle: string;
      syncUploadsButton: string;
      newIdeaButton: string;
      linkItHere: string;
      noMatchingPlanCard: string;
      reviewUploadsLabel: string;
      reviewUploadsCaption: string;
      linkToPlanLabel: string;
      linkToPlanCaption: string;
      createNewIdeaLabel: string;
      createNewIdeaCaption: string;
      uploadsWaitingForReview: (count: number) => string;
      reviewUploadChip: string;
    };
    planner: {
      thisWeekPlanTitle: string;
      weeklyPlanTitle: string;
      plannedThisWeekSummary: (planned: number, published: number) => string;
      ideaOriginManual: string;
      ideaOriginAi: string;
      descriptionFallback: string;
      thumbnailFallback: string;
      regenerateThumbnailButton: string;
      createThumbnailButton: string;
      openButton: string;
      linkedButton: string;
      emptyPlan: (count: number) => string;
      openBrief: string;
      delete: string;
      publishedChip: string;
      plannedChip: (count: number) => string;
      openChip: string;
      videoTitleLabel: string;
      videoDescriptionLabel: string;
      tagsLabel: string;
      thumbnailIdeaLabel: string;
      aiImproveTagsHint: string;
      hookLabel: string;
      publishPackageLabel: string;
      outlineLabel: string;
      competitorReferenceLabel: string;
      publishSyncLabel: string;
      changeButton: string;
      savedLabel: string;
      generateNewIdea: string;
      whyThisMightWork: string;
      notes: string;
      generatedThumbnailLabel: string;
      generatedThumbnailReady: string;
      generateAgain: string;
      generateThumbnail: string;
      moveIdeaTitle: string;
      moveIdeaSubtitle: string;
      fullBriefSubtitle: string;
    };
    consistencyTracker: {
      title: string;
      subtitle: string;
      confidenceHigh: string;
      confidenceMedium: string;
      helpText: string;
      weekLabel: (week: number) => string;
      scheduledLabel: string;
      postedLabel: string;
      missedLabel: string;
      legendPublished: string;
      legendScheduledMissed: string;
      legendScheduled: string;
      legendNotScheduled: string;
      emptyNoUploads: string;
      emptyRefreshHint: string;
      noChartableData: string;
      needMoreUploads: string;
      summaryPublishedDaysLabel: string;
      summaryPublishedDaysCaption: (uploads: number) => string;
      summaryStillPlannedLabel: string;
      summaryStillPlannedCaption: string;
      summaryMissedLabel: string;
      summaryMissedCaption: string;
      summaryOpenDaysLabel: string;
      summaryOpenDaysCaption: string;
      statusNoSchedule: string;
      statusExcellent: string;
      statusGood: string;
      statusNeedsFocus: string;
      statusMissed: string;
    };
    repeatOrFix: {
      title: string;
      subtitle: string;
      contextLabel: string;
      whatWorkedTitle: string;
      whatWorkedSubtitle: string;
      needsWorkTitle: string;
      needsWorkSubtitle: string;
      repeatThisLabel: string;
      suggestedFixLabel: string;
      repeatLabel: string;
      fixLabel: string;
      diagnosticHookLabel: string;
      diagnosticTagsLabel: string;
      diagnosticTitleLengthLabel: string;
      diagnosticConceptLabel: string;
      diagnosticTimingLabel: string;
    };
    performanceSignals: {
      title: string;
      subtitle: string;
      bestTimesTitle: string;
      bestTimesSubtitle: string;
      hooksTitle: string;
      hooksSubtitle: string;
      optimalTitleLengthTitle: string;
      optimalTitleLengthSubtitle: string;
      topTitlesHeader: string;
      bottomTitlesHeader: string;
      charsViewsHeader: string;
      subscriberGrowthTitle: string;
      subscriberGrowthSubtitle: string;
      estimatedSubscriberGainLabel: string;
      tagsTitle: string;
      tagsSubtitle: string;
      tagsLegend: string;
      nicheTagsTitle: string;
      nicheTagsSubtitle: string;
      signalLabel: (count: number) => string;
      noChartableData: string;
      needMoreUploadsHeatmap: string;
      heatmapDayHeader: string;
      lowerViewDensity: string;
      higherViewDensity: string;
      avgViewsLabel: string;
      viewsLabel: string;
      uploadsLabel: string;
      subscribersLabel: string;
      heatmapTooltip: (day: string, hourRange: string, avgViews: string, uploads: number) => string;
      heatmapTooltipEmpty: (day: string, hourRange: string) => string;
    };
    competitorsPanel: {
      title: string;
      subtitle: string;
      refreshCompetitors: string;
      addCompetitorPlaceholder: string;
      addCompetitorButton: string;
      channelsYouCanBeatTitle: string;
      channelsYouCanBeatSubtitle: string;
      emptyReachableCompetitors: string;
      friendlyLeaderboardTitle: string;
      addedByYou: (fromUrl: boolean) => string;
      competitorTierUnknown: string;
      competitorTierComparable: string;
      competitorTierAspirational: string;
    };
    thumbnailDialog: {
      title: string;
      subtitle: string;
      ideaLabel: string;
      sourceImagesLabel: string;
      sourceImagesHelp: string;
      requirementsLabel: string;
      addImageButton: string;
      preserveMyImageTitle: string;
      preserveMyImageSubtitle: string;
      allowRedesignTitle: string;
      allowRedesignSubtitle: string;
      textOnThumbnailLabel: string;
      textOnThumbnailPlaceholder: string;
    };
    channelDetailsDialog: {
      subtitle: string;
      subscribersLabel: string;
      totalViewsLabel: string;
      videosLabel: string;
      descriptionLabel: string;
    };
    customIdeaDialog: {
      title: string;
      subtitle: string;
      aiImproveButton: string;
      addIdeaButton: string;
      titlePlaceholder: string;
      anglePlaceholder: string;
      descriptionPlaceholder: string;
      tagsPlaceholder: string;
      thumbnailPlaceholder: string;
    };
    connect: {
      secureConnection: string;
      title: string;
      body: string;
      bullets: {
        channelProfile: string;
        realTrends: string;
        weeklyResults: string;
      };
      readyTitle: string;
      readyBody: string;
      connectButton: string;
    };
  };
};

const baseCopy: DayTabsCopy = {
  languageLabel: "Language",
  tabs: {
    dashboard: { label: "Home", desc: "Overview" },
    "video-analyzer": { label: "Video Analyzer", desc: "Full Analysis" },
    "script-planner": { label: "Script Planner", desc: "AI Scripts" },
    "growth-planner": { label: "YouTube Growth", desc: "Studio" },
    "youtube-audit": { label: "YouTube Audit", desc: "Studio" },
    "youtube-transcript": { label: "YouTube Transcript", desc: "Studio" },
    teleprompter: { label: "Teleprompter", desc: "Read Live" },
  },
  notifications: {
    button: "Notifications",
    title: "Notifications",
    active: "active",
    empty: "No scheduled posts need attention right now.",
    dueToday: (count: number) => `${count} post${count === 1 ? "" : "s"} should be posted today.`,
    dueTodayHelper: "Click to see which cards are due.",
    overdue: (count: number) => `${count} overdue post${count === 1 ? "" : "s"} need an update.`,
    overdueHelper: "Click to see which cards need a posted URL or skipped status.",
  },
  dashboard: {
    welcome: (name: string) => `Welcome back, ${name}`,
    subtitle: "Here's what's ready for you today.",
    used: "Used",
    remaining: "Remaining",
    thisMonth: "this month",
    analysesLeft: "analyses left",
    monthlyUsageUsed: (used: number, total: number) => `${used} of ${total} monthly usage used`,
    remainingInline: (remaining: number) => `${remaining} remaining`,
    upgrade: "Upgrade",
    monthlyUsageProgress: "Monthly usage progress",
    monthlyLimitNote: (limit: number) => `Up to ${limit} video analyses each month. Longer videos may use more of your monthly usage.`,
    statUsageUsed: "Usage used",
    statUsageLeft: "Usage left",
    statScriptGenerations: "Script generations",
    statMaxDuration: "Max duration",
    perVideo: "per video",
    quickActions: "Quick Actions",
    actions: {
      analyze: { title: "Analyze a Video", desc: "Quality, editing, and publish insights" },
      script: { title: "Plan a Script", desc: "AI-powered script and shot planning" },
      teleprompter: { title: "Use Teleprompter", desc: "Read your script live on screen" },
      growth: { title: "Build Growth Calendar", desc: "Studio social strategy and weekly plans", badge: "Studio" },
      audit: { title: "Audit a YouTube Video", desc: "Paste a URL and compare it to stronger competitors", badge: "Studio" },
      upgrade: { title: "Upgrade Your Plan", desc: "Unlock more analyses and features" },
    },
    capabilities: "What DayTabs can do",
    features: {
      quality: { label: "Video Quality Analysis", desc: "Lighting, audio, framing, and pacing scores" },
      editing: { label: "Editing Suggestions", desc: "Hook moments, cut points, and B-roll cues" },
      publish: { label: "Publish Package", desc: "Optimized titles, descriptions, and tags", locked: true },
    },
  },
  growthPlanner: {
    header: {
      eyebrow: "YouTube Growth",
      title: "Grow your next upload week.",
      subtitle: "A focused workspace for channel patterns, weekly planning, competitor context, and publishing follow-through.",
    },
    subtabs: {
      overview: "Overview",
      plan: "Plan",
      competitors: "Competitors",
      insights: "Insights",
      tasks: "Tasks",
    },
    viewModes: {
      calendar: "Calendar",
      planner: "Planner",
    },
    stages: {
      idea: "Ideas",
      recording: "Recording",
      editing: "Editing",
      published: "Published",
      draft: "Archived / Draft",
    },
    actions: {
      generatePlan: "Generate next week's plan",
      settings: "Settings",
      refreshChannel: "Refresh channel",
    },
    commandCenter: {
      eyebrow: "Command Center",
      connectedChannelFallback: "Connected channel",
      nicheProfileFallback: "Niche profile ready",
      subscribersLabel: "subscribers",
      totalViewsLabel: "total views",
      videosLabel: "videos",
    },
    stats: {
      weeklyTargetLabel: "Weekly target",
      weeklyTargetCaption: "Used when generating plans",
      uploadsLabel: (count: number) => `${count} upload${count === 1 ? "" : "s"}`,
      progressLabel: "Progress",
      progressCaption: "Linked uploads this week",
      publishedLabel: (count: number) => `${count} published`,
      bestSlotLabel: "Best slot",
      bestSlotNoData: "Needs more data",
      bestSlotAvgViewsSuffix: "avg views",
      bestSlotMoreUploads: "More uploads improve this",
    },
    overview: {
      insightCardsLabel: "Insight cards",
      openTasks: "Open tasks",
      openCompetitors: "Open competitors",
      openInsights: "Open insights",
    },
    overviewPanel: {
      todayEyebrow: "Today",
      todaysPlannedCardsTitle: "Today's planned cards",
      todaysPlannedCardsSubtitle: "Publish what shipped, or move an idea to a better day without opening the full planner.",
      noPendingUploadTitle: "No pending upload",
      noPendingUploadSubtitle: "Add an idea or generate a plan to set your next move.",
      addIdeaButton: "Add idea",
      publishButton: "Publish",
      moveButton: "Move",
      planAtGlanceTitle: "Plan at a glance",
      planAtGlanceSubtitle: "Your next week should feel actionable, not crowded. Jump into the planner when you are ready to shape titles, thumbnails, and publish timing.",
      plannedCardsLabel: "Planned cards",
      publishedThisWeekLabel: "Published this week",
      bestNextSlotLabel: "Best next slot",
      openPlanningWorkspaceButton: "Open planning workspace",
      needsAttentionTitle: "What needs attention",
      needsAttentionSubtitle: "A simple triage view so you know where to go next without scanning the whole page.",
      tasksWaitingLabel: "Tasks waiting",
      competitorsSavedLabel: "Competitors saved",
      actionQueueEyebrow: "Action queue",
      actionQueueTitle: "Sort this week's unlinked uploads",
      actionQueueSubtitle: "These videos are already live in the current schedule week, but they are not attached to an idea yet. Clearing this list keeps your plan accurate and makes the rest of the week easier to trust.",
      syncUploadsButton: "Refresh uploaded videos",
      newIdeaButton: "This is a new idea",
      linkItHere: "Yes, link it here",
      noMatchingPlanCard: "No matching plan card was found for this date. The easiest next step is saving it as a new idea.",
      reviewUploadsLabel: "Review uploads",
      reviewUploadsCaption: "Videos need a decision",
      linkToPlanLabel: "Link to plan",
      linkToPlanCaption: "Can match an existing idea",
      createNewIdeaLabel: "Create new idea",
      createNewIdeaCaption: "No plan card found yet",
      uploadsWaitingForReview: (count: number) => `${count} upload${count === 1 ? "" : "s"} waiting for review`,
      reviewUploadChip: "Review upload",
    },
    planner: {
      thisWeekPlanTitle: "This Week Plan",
      weeklyPlanTitle: "Weekly Plan",
      plannedThisWeekSummary: (planned: number, published: number) => `${planned} planned this week · ${published} published`,
      ideaOriginManual: "Manual",
      ideaOriginAi: "AI",
      descriptionFallback: "AI improve can generate a ready-to-paste description in your channel voice.",
      thumbnailFallback: "AI improve can generate a thumbnail idea based on your niche and top performers.",
      regenerateThumbnailButton: "Regenerate thumbnail",
      createThumbnailButton: "Create thumbnail",
      openButton: "Open",
      linkedButton: "Linked",
      emptyPlan: (count: number) => `Generate a plan to create exactly ${count} YouTube ideas grounded in your channel data and strongest posting windows.`,
      openBrief: "Open brief",
      delete: "Delete",
      publishedChip: "Published",
      plannedChip: (count: number) => `${count} planned`,
      openChip: "Open",
      videoTitleLabel: "Video Title",
      videoDescriptionLabel: "Video Description",
      tagsLabel: "Tags",
      thumbnailIdeaLabel: "Thumbnail Idea",
      aiImproveTagsHint: "AI improve can generate niche tags.",
      hookLabel: "Hook",
      publishPackageLabel: "Publish package",
      outlineLabel: "Outline",
      competitorReferenceLabel: "Competitor reference",
      publishSyncLabel: "Publish sync",
      changeButton: "Change",
      savedLabel: "Saved",
      generateNewIdea: "Generate new idea",
      whyThisMightWork: "Why this might work",
      notes: "Notes",
      generatedThumbnailLabel: "Generated thumbnail",
      generatedThumbnailReady: "Saved on this idea card and ready to download.",
      generateAgain: "Generate again",
      generateThumbnail: "Generate thumbnail",
      moveIdeaTitle: "Move idea",
      moveIdeaSubtitle: "Choose a new day for this card, or delete it if it no longer fits the week.",
      fullBriefSubtitle: "Full content brief for this planned upload.",
    },
    consistencyTracker: {
      title: "Consistency Tracker",
      subtitle: "Four weeks of publishing behavior so you can see if growth is a consistency issue, a performance issue, or both.",
      confidenceHigh: "high",
      confidenceMedium: "medium",
      helpText: "Four-week consistency view. Green means published, red means scheduled but missed, grey means no post was scheduled.",
      weekLabel: (week: number) => `Week ${week}`,
      scheduledLabel: "Scheduled",
      postedLabel: "Posted",
      missedLabel: "Missed",
      legendPublished: "Published",
      legendScheduledMissed: "Scheduled but missed",
      legendScheduled: "Scheduled",
      legendNotScheduled: "Not scheduled",
      emptyNoUploads: "No synced YouTube uploads found yet.",
      emptyRefreshHint: "Refresh uploaded videos and try again.",
      noChartableData: "No chartable data was returned for this insight.",
      needMoreUploads: "Need more uploads across different publish windows to draw a reliable heatmap.",
      summaryPublishedDaysLabel: "Published Days",
      summaryPublishedDaysCaption: (uploads: number) => `${uploads} upload${uploads === 1 ? "" : "s"} landed this week`,
      summaryStillPlannedLabel: "Still Planned",
      summaryStillPlannedCaption: "Scheduled days still on track",
      summaryMissedLabel: "Missed",
      summaryMissedCaption: "Scheduled days with no live upload",
      summaryOpenDaysLabel: "Open Days",
      summaryOpenDaysCaption: "No schedule and no upload yet",
      statusNoSchedule: "No schedule",
      statusExcellent: "Excellent",
      statusGood: "Good",
      statusNeedsFocus: "Needs focus",
      statusMissed: "Missed",
    },
    repeatOrFix: {
      title: "Repeat or Fix",
      subtitle: "Pick one proven move to repeat and one underperforming video to repair. Each card shows the source upload, the signal behind it, and the next action to try.",
      contextLabel: "Channel context for these recommendations",
      whatWorkedTitle: "What worked",
      whatWorkedSubtitle: "Your strongest recent videos, broken into the exact creative signals worth repeating.",
      needsWorkTitle: "Needs work",
      needsWorkSubtitle: "The weakest recent uploads, shown as specific hook, tag, title, concept, and timing issues.",
      repeatThisLabel: "Repeat this",
      suggestedFixLabel: "Suggested fix",
      repeatLabel: "Repeat",
      fixLabel: "Fix",
      diagnosticHookLabel: "Hook",
      diagnosticTagsLabel: "Tags",
      diagnosticTitleLengthLabel: "Title length",
      diagnosticConceptLabel: "Concept",
      diagnosticTimingLabel: "Timing",
    },
    performanceSignals: {
      title: "Performance Signals",
      subtitle: "Signals from your uploads, analytics, and competitors.",
      bestTimesTitle: "Best Times to Post",
      bestTimesSubtitle: "Average views by weekday and publish window from your real upload history.",
      hooksTitle: "Hooks That Pull Views",
      hooksSubtitle: "Average views by hook style across your actual video titles.",
      optimalTitleLengthTitle: "Optimal Title Length",
      optimalTitleLengthSubtitle: "Average views by title-length bucket so the winning range is obvious.",
      topTitlesHeader: "Top 5 titles",
      bottomTitlesHeader: "Bottom 5 titles",
      charsViewsHeader: "Chars · Views",
      subscriberGrowthTitle: "Subscriber Growth Chart",
      subscriberGrowthSubtitle: "Net subscriber gain with publish markers from your recent uploads.",
      estimatedSubscriberGainLabel: "Estimated subscriber gain",
      tagsTitle: "Tags That Help or Hurt",
      tagsSubtitle: "Tags pulled from your real uploaded videos and grouped by average performance.",
      tagsLegend: "Green = above average performance · Grey = neutral · Red = below average.",
      nicheTagsTitle: "Niche Tags to Test",
      nicheTagsSubtitle: "Trend tags that do not overlap with your current tag set.",
      signalLabel: (count: number) => `signal ${count}`,
      noChartableData: "No chartable data was returned for this insight.",
      needMoreUploadsHeatmap: "Need more uploads across different publish windows to draw a reliable heatmap.",
      heatmapDayHeader: "Day",
      lowerViewDensity: "Lower view density",
      higherViewDensity: "Higher view density",
      avgViewsLabel: "Average views",
      viewsLabel: "Views",
      uploadsLabel: "Uploads",
      subscribersLabel: "Subscribers",
      heatmapTooltip: (day: string, hourRange: string, avgViews: string, uploads: number) => `${day} ${hourRange}: ${avgViews} avg views across ${uploads} uploads`,
      heatmapTooltipEmpty: (day: string, hourRange: string) => `${day} ${hourRange}: no uploads yet`,
    },
    competitorsPanel: {
      title: "Competitor Playbook",
      subtitle: "Use this like a coach's scouting report: who you can catch now, who is just ahead, and who defines the playbook for your niche.",
      refreshCompetitors: "Refresh competitors",
      addCompetitorPlaceholder: "Add competitor (URL, @handle, or channel name)",
      addCompetitorButton: "Add competitor",
      channelsYouCanBeatTitle: "Competitors",
      channelsYouCanBeatSubtitle: "Saved competitors show as cards. Weekly charts include comparable channels (and anything you added manually).",
      emptyReachableCompetitors: "No competitors yet. Refresh competitors or add one manually.",
      friendlyLeaderboardTitle: "This Week's Friendly Leaderboard",
      addedByYou: (fromUrl: boolean) => `Added by you${fromUrl ? " from a channel URL" : ""}.`,
      competitorTierUnknown: "Unknown",
      competitorTierComparable: "Comparable",
      competitorTierAspirational: "Aspirational",
    },
    thumbnailDialog: {
      title: "Create Thumbnail",
      subtitle: "Upload optional source images, set optional text, and generate a saved thumbnail for this idea card.",
      ideaLabel: "Idea",
      sourceImagesLabel: "Source images",
      sourceImagesHelp: "Add up to 4 images. Preserve mode uses your upload as the base image and only edits lighting, clarity, text, overlays, and focus.",
      requirementsLabel: "Requirements: JPG, 16:9 thumbnail output, 1280 x 720px, minimum source width 640px, max 2 MB.",
      addImageButton: "Add image",
      preserveMyImageTitle: "Preserve my image",
      preserveMyImageSubtitle: "Recommended. Keeps the exact subject, pose, scene, and composition.",
      allowRedesignTitle: "Allow AI to redesign",
      allowRedesignSubtitle: "Uses uploads as references, but can create a new thumbnail scene.",
      textOnThumbnailLabel: "Text on thumbnail",
      textOnThumbnailPlaceholder: "Optional. Leave empty and AI will generate the strongest thumbnail text.",
    },
    channelDetailsDialog: {
      subtitle: "Full connected channel details.",
      subscribersLabel: "Subscribers",
      totalViewsLabel: "Total Views",
      videosLabel: "Videos",
      descriptionLabel: "Description",
    },
    customIdeaDialog: {
      title: "Add custom idea",
      subtitle: "Add your own concept, then let AI sharpen it for your niche and current plan.",
      aiImproveButton: "AI improve",
      addIdeaButton: "Add idea",
      titlePlaceholder: "Idea title",
      anglePlaceholder: "Angle, rough hook, or notes",
      descriptionPlaceholder: "Video description",
      tagsPlaceholder: "Tags, separated by commas",
      thumbnailPlaceholder: "Thumbnail idea",
    },
    connect: {
      secureConnection: "Secure connection",
      title: "Connect the channel you want to grow.",
      body: "Your DayTabs login and YouTube channel can be different Google accounts. DayTabs stores tokens on the backend and refreshes access silently.",
      bullets: {
        channelProfile: "Channel profile",
        realTrends: "Real trends",
        weeklyResults: "Weekly results",
      },
      readyTitle: "Ready when you are.",
      readyBody: "Google will ask for read-only YouTube and Analytics access.",
      connectButton: "Connect to YouTube",
    },
  },
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const localeOverrides: Partial<Record<DayTabsLocale, DeepPartial<DayTabsCopy>>> = {
  tr: {
    languageLabel: "Dil",
    tabs: {
      dashboard: { label: "Ana Sayfa", desc: "Genel Bakis" },
      "video-analyzer": { label: "Video Analizi", desc: "Tam Analiz" },
      "script-planner": { label: "Script Planner", desc: "YZ Scriptleri" },
      "growth-planner": { label: "YouTube Buyume", desc: "Studio" },
      "youtube-audit": { label: "YouTube Denetimi", desc: "Studio" },
      "youtube-transcript": { label: "YouTube Transkript", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Canli Oku" },
    },
    dashboard: {
      subtitle: "Bugun senin icin hazir olanlar burada.",
      quickActions: "Hizli Islemler",
    },
    growthPlanner: {
      header: {
        eyebrow: "YouTube Buyume",
        title: "Bir sonraki yukleme haftani buyut.",
        subtitle: "Kanal kaliplari, haftalik plan, rakipler ve yayin takibi icin odakli bir calisma alani.",
      },
      subtabs: {
        overview: "Genel Bakis",
        plan: "Plan",
        competitors: "Rakipler",
        insights: "Icgoruler",
        tasks: "Gorevler",
      },
      viewModes: {
        calendar: "Takvim",
        planner: "Planlayici",
      },
      stages: {
        idea: "Fikirler",
        recording: "Kayit",
        editing: "Kurgu",
        published: "Yayinlandi",
        draft: "Arsiv / Taslak",
      },
      actions: {
        generatePlan: "Gelecek haftanin planini uret",
        settings: "Ayarlar",
        refreshChannel: "Kanali yenile",
      },
      commandCenter: {
        eyebrow: "Komuta Merkezi",
        connectedChannelFallback: "Bagli kanal",
        nicheProfileFallback: "Nis profili hazir",
        subscribersLabel: "abone",
        totalViewsLabel: "toplam izlenme",
        videosLabel: "video",
      },
      stats: {
        weeklyTargetLabel: "Haftalik hedef",
        weeklyTargetCaption: "Plan uretirken kullanilir",
        uploadsLabel: (count: number) => `${count} yukleme`,
        progressLabel: "Ilerleme",
        progressCaption: "Bu hafta baglanan yuklemeler",
        publishedLabel: (count: number) => `${count} yayinlandi`,
        bestSlotLabel: "En iyi saat",
        bestSlotNoData: "Daha fazla veri gerekli",
        bestSlotAvgViewsSuffix: "ort. izlenme",
        bestSlotMoreUploads: "Daha cok yukleme daha iyi onerir",
      },
      overview: {
        insightCardsLabel: "Icerik kartlari",
        openTasks: "Gorevleri ac",
        openCompetitors: "Rakipleri ac",
        openInsights: "Icgoruleri ac",
      },
      overviewPanel: {
        todayEyebrow: "Bugun",
        todaysPlannedCardsTitle: "Bugunun planli kartlari",
        todaysPlannedCardsSubtitle: "Yayinlananlari isaretle veya bir fikri daha iyi bir gune tasi; tum planlayiciyi acmadan ilerle.",
        noPendingUploadTitle: "Bekleyen yukleme yok",
        noPendingUploadSubtitle: "Bir fikir ekle veya plan uret ve sonraki adimi belirle.",
        addIdeaButton: "Fikir ekle",
        publishButton: "Yayinla",
        moveButton: "Tasi",
        planAtGlanceTitle: "Plan ozeti",
        planAtGlanceSubtitle: "Gelecek hafta kalabalik degil, uygulanabilir hissettirmeli. Baslik, thumbnail ve yayin zamanini sekillendirmek icin planlayiciya gir.",
        plannedCardsLabel: "Planli kartlar",
        publishedThisWeekLabel: "Bu hafta yayinlandi",
        bestNextSlotLabel: "Sonraki en iyi saat",
        openPlanningWorkspaceButton: "Planlama alanini ac",
        needsAttentionTitle: "Neye bakmali",
        needsAttentionSubtitle: "Tum sayfayi taramadan nereye gidecegini goren basit bir oncelik gorunumu.",
        tasksWaitingLabel: "Bekleyen gorev",
        competitorsSavedLabel: "Kayitli rakip",
        actionQueueEyebrow: "Aksiyon sirasi",
        actionQueueTitle: "Bu haftanin baglanmamis yuklemelerini sirala",
        actionQueueSubtitle: "Bu videolar mevcut haftada zaten canli, ama henuz bir fikre bagli degil. Bu listeyi temizlemek planini dogru tutar ve haftayi daha guvenilir yapar.",
        syncUploadsButton: "Yuklenen videolari yenile",
        newIdeaButton: "Bu yeni bir fikir",
        linkItHere: "Evet, buraya bagla",
        noMatchingPlanCard: "Bu tarih icin eslesen plan karti bulunamadi. En kolay sonraki adim yeni bir fikir olarak kaydetmek.",
        reviewUploadsLabel: "Yuklemeleri incele",
        reviewUploadsCaption: "Karar bekleyen videolar",
        linkToPlanLabel: "Plana bagla",
        linkToPlanCaption: "Mevcut bir fikirle eslesebilir",
        createNewIdeaLabel: "Yeni fikir olustur",
        createNewIdeaCaption: "Henuz plan karti yok",
        uploadsWaitingForReview: (count: number) => `${count} yukleme inceleme bekliyor`,
        reviewUploadChip: "Yuklemeyi incele",
      },
      planner: {
        thisWeekPlanTitle: "Bu Haftanin Plani",
        weeklyPlanTitle: "Haftalik Plan",
        plannedThisWeekSummary: (planned: number, published: number) => `Bu hafta ${planned} planli · ${published} yayinlandi`,
        ideaOriginManual: "Manuel",
        ideaOriginAi: "YZ",
        descriptionFallback: "AI improve, kanal tonuna uygun yapistir-hazir bir aciklama uretebilir.",
        thumbnailFallback: "AI improve, nis ve en iyi performanslara gore bir thumbnail fikri uretebilir.",
        regenerateThumbnailButton: "Thumbnail'i yeniden uret",
        createThumbnailButton: "Thumbnail olustur",
        openButton: "Ac",
        linkedButton: "Baglandi",
        emptyPlan: (count: number) => `Kanal verine ve en guclu yayin saatlerine dayali tam ${count} YouTube fikri icin bir plan uret.`,
        openBrief: "Brifi ac",
        delete: "Sil",
        publishedChip: "Yayinlandi",
        plannedChip: (count: number) => `${count} planli`,
        openChip: "Acik",
        videoTitleLabel: "Video Basligi",
        videoDescriptionLabel: "Video Aciklamasi",
        tagsLabel: "Etiketler",
        thumbnailIdeaLabel: "Thumbnail Fikri",
        aiImproveTagsHint: "AI improve nis etiketler uretebilir.",
        hookLabel: "Hook",
        publishPackageLabel: "Yayin paketi",
        outlineLabel: "Taslak",
        competitorReferenceLabel: "Rakip referansi",
        publishSyncLabel: "Yayin senkronu",
        changeButton: "Degistir",
        savedLabel: "Kaydedildi",
        generateNewIdea: "Yeni fikir uret",
        whyThisMightWork: "Neden ise yarayabilir",
        notes: "Notlar",
        generatedThumbnailLabel: "Uretilen thumbnail",
        generatedThumbnailReady: "Bu kartta kayitli ve indirmeye hazir.",
        generateAgain: "Tekrar uret",
        generateThumbnail: "Thumbnail uret",
        moveIdeaTitle: "Fikri tasi",
        moveIdeaSubtitle: "Bu kart icin yeni bir gun sec veya hafta icin artik uygun degilse sil.",
        fullBriefSubtitle: "Bu planli yukleme icin tam icerik brifi.",
      },
      consistencyTracker: {
        title: "Tutarlilik Takibi",
        subtitle: "Buyumenin tutarlilik mi, performans mi, yoksa ikisi mi oldugunu gormek icin 4 haftalik yayin davranisi.",
        confidenceHigh: "yuksek",
        confidenceMedium: "orta",
        helpText: "4 haftalik tutarlilik gorunumu. Yesil = yayinlandi, kirmizi = planliydi ama kacirildi, gri = plan yok.",
        weekLabel: (week: number) => `Hafta ${week}`,
        scheduledLabel: "Planli",
        postedLabel: "Yayinlandi",
        missedLabel: "Kacirildi",
        legendPublished: "Yayinlandi",
        legendScheduledMissed: "Planli ama kacirildi",
        legendScheduled: "Planli",
        legendNotScheduled: "Plan yok",
        emptyNoUploads: "Henuz senkronlanmis YouTube yuklemesi bulunmadi.",
        emptyRefreshHint: "Yuklenen videolari yenile ve tekrar dene.",
        noChartableData: "Bu icgoru icin grafiklenebilir veri donmedi.",
        needMoreUploads: "Guvenilir bir heatmap icin farkli yayin pencerelerinde daha fazla yukleme gerekli.",
        summaryPublishedDaysLabel: "Yayinlanan Gun",
        summaryPublishedDaysCaption: (uploads: number) => `Bu hafta ${uploads} yukleme yayinlandi`,
        summaryStillPlannedLabel: "Hala Planli",
        summaryStillPlannedCaption: "Planli gunler yolunda",
        summaryMissedLabel: "Kacirildi",
        summaryMissedCaption: "Planli gun ama canli yukleme yok",
        summaryOpenDaysLabel: "Bos Gun",
        summaryOpenDaysCaption: "Plan yok ve yukleme yok",
        statusNoSchedule: "Plan yok",
        statusExcellent: "Harika",
        statusGood: "Iyi",
        statusNeedsFocus: "Odak gerek",
        statusMissed: "Kacirildi",
      },
      repeatOrFix: {
        title: "Tekrarla veya Duzelt",
        subtitle: "Bir kanitli hamleyi tekrarla ve bir dusuk performansi onar. Her kart kaynak videoyu, sinyali ve denenecek sonraki adimi gosterir.",
        contextLabel: "Bu oneriler icin kanal baglami",
        whatWorkedTitle: "Ise yaradi",
        whatWorkedSubtitle: "En guclu videolarin; tekrar etmeye deger net sinyallere ayrildi.",
        needsWorkTitle: "Gelismeli",
        needsWorkSubtitle: "En zayif videolar; hook, etiket, baslik, fikir ve zamanlama sorunlariyla gosterilir.",
        repeatThisLabel: "Bunu tekrarla",
        suggestedFixLabel: "Onerilen duzeltme",
        repeatLabel: "Tekrarla",
        fixLabel: "Duzelt",
        diagnosticHookLabel: "Hook",
        diagnosticTagsLabel: "Etiketler",
        diagnosticTitleLengthLabel: "Baslik uzunlugu",
        diagnosticConceptLabel: "Konsept",
        diagnosticTimingLabel: "Zamanlama",
      },
      performanceSignals: {
        title: "Performans Sinyalleri",
        subtitle: "Yuklemelerinden, analizlerden ve rakiplerden gelen sinyaller.",
        bestTimesTitle: "En Iyi Yayin Saatleri",
        bestTimesSubtitle: "Gercek yukleme gecmisine gore gun ve zaman araligina gore ortalama izlenme.",
        hooksTitle: "Izlenme Ceken Hooklar",
        hooksSubtitle: "Gercek video basliklarina gore hook turune gore ortalama izlenme.",
        optimalTitleLengthTitle: "Ideal Baslik Uzunlugu",
        optimalTitleLengthSubtitle: "Kazanan araligi net gormek icin baslik uzunlugu kovalarina gore ortalama izlenme.",
        topTitlesHeader: "En iyi 5 baslik",
        bottomTitlesHeader: "En kotu 5 baslik",
        charsViewsHeader: "Karakter · Izlenme",
        subscriberGrowthTitle: "Abone Buyume Grafegi",
        subscriberGrowthSubtitle: "Son yuklemelerinden yayin isaretleriyle net abone artisi.",
        estimatedSubscriberGainLabel: "Tahmini abone artisi",
        tagsTitle: "Yardim Eden / Zarar Veren Etiketler",
        tagsSubtitle: "Gercek yuklenen videolardan cekilen etiketler ve ortalama performansa gore gruplandi.",
        tagsLegend: "Yesil = ortalamanin ustu · Gri = notr · Kirmizi = ortalamanin alti.",
        nicheTagsTitle: "Test Edilecek Nis Etiketler",
        nicheTagsSubtitle: "Mevcut etiket setinle cakismayan trend etiketler.",
        signalLabel: (count: number) => `sinyal ${count}`,
        noChartableData: "Bu icgoru icin grafiklenebilir veri donmedi.",
        needMoreUploadsHeatmap: "Guvenilir bir heatmap icin farkli yayin pencerelerinde daha fazla yukleme gerekli.",
        heatmapDayHeader: "Gun",
        lowerViewDensity: "Daha dusuk yogunluk",
        higherViewDensity: "Daha yuksek yogunluk",
        avgViewsLabel: "Ortalama izlenme",
        viewsLabel: "Izlenme",
        uploadsLabel: "Yukleme",
        subscribersLabel: "Abone",
        heatmapTooltip: (day: string, hourRange: string, avgViews: string, uploads: number) => `${day} ${hourRange}: ${avgViews} ort. izlenme (${uploads} yukleme)`,
        heatmapTooltipEmpty: (day: string, hourRange: string) => `${day} ${hourRange}: henuz yukleme yok`,
      },
      competitorsPanel: {
        title: "Rakip Oyun Plani",
        subtitle: "Bunu bir koçun raporu gibi kullan: simdi yakalayabileceklerin, az onde olanlar ve nisinin oyun kitabini yazanlar.",
        refreshCompetitors: "Rakipleri yenile",
        addCompetitorPlaceholder: "Rakip ekle (URL, @handle veya kanal adi)",
        addCompetitorButton: "Rakip ekle",
        channelsYouCanBeatTitle: "Rakipler",
        channelsYouCanBeatSubtitle: "Kayitli rakipler kart olarak gorunur. Haftalik grafikler benzer kanallari (ve manuel eklediklerini) dahil eder.",
        emptyReachableCompetitors: "Henuz rakip yok. Rakipleri yenile veya manuel ekle.",
        friendlyLeaderboardTitle: "Bu Haftanin Dostca Siralamasi",
        addedByYou: (fromUrl: boolean) => `Sen ekledin${fromUrl ? " (kanal URL'sinden)" : ""}.`,
        competitorTierUnknown: "Bilinmiyor",
        competitorTierComparable: "Benzer",
        competitorTierAspirational: "Hedef",
      },
      thumbnailDialog: {
        title: "Thumbnail Olustur",
        subtitle: "Istersen kaynak gorseller yukle, metin ekle ve bu kart icin kayitli thumbnail uret.",
        ideaLabel: "Fikir",
        sourceImagesLabel: "Kaynak gorseller",
        sourceImagesHelp: "En fazla 4 gorsel ekle. Koruma modu yuklemeni temel alir ve sadece isik, netlik, metin, overlay ve odagi duzenler.",
        requirementsLabel: "Gereksinimler: JPG, 16:9, 1280 x 720px, minimum kaynak genisligi 640px, max 2 MB.",
        addImageButton: "Gorsel ekle",
        preserveMyImageTitle: "Gorselimi koru",
        preserveMyImageSubtitle: "Onerilir. Tam konuyu, pozu, sahneyi ve kompozisyonu korur.",
        allowRedesignTitle: "YZ yeniden tasarlasın",
        allowRedesignSubtitle: "Yuklemeleri referans alir ama yeni bir thumbnail sahnesi olusturabilir.",
        textOnThumbnailLabel: "Thumbnail metni",
        textOnThumbnailPlaceholder: "Istege bagli. Bos birakirsan YZ en guclu metni uretir.",
      },
      channelDetailsDialog: {
        subtitle: "Bagli kanal detaylari.",
        subscribersLabel: "Abone",
        totalViewsLabel: "Toplam Izlenme",
        videosLabel: "Videolar",
        descriptionLabel: "Aciklama",
      },
      customIdeaDialog: {
        title: "Ozel fikir ekle",
        subtitle: "Kendi konseptini ekle, sonra YZ nis ve mevcut planina gore guclendirsin.",
        aiImproveButton: "AI improve",
        addIdeaButton: "Fikir ekle",
        titlePlaceholder: "Fikir basligi",
        anglePlaceholder: "Aci, kaba hook veya notlar",
        descriptionPlaceholder: "Video aciklamasi",
        tagsPlaceholder: "Etiketler, virgul ile ayir",
        thumbnailPlaceholder: "Thumbnail fikri",
      },
      connect: {
        secureConnection: "Guvenli baglanti",
        title: "Buyutmek istedigin kanali bagla.",
        body: "DayTabs girisin ve YouTube kanalin farkli Google hesaplari olabilir. DayTabs tokenlari backend'de saklar ve erisimi sessizce yeniler.",
        bullets: {
          channelProfile: "Kanal profili",
          realTrends: "Gercek trendler",
          weeklyResults: "Haftalik sonuclar",
        },
        readyTitle: "Hazir oldugunda basla.",
        readyBody: "Google, salt-okunur YouTube ve Analytics erisimi isteyecek.",
        connectButton: "YouTube'a baglan",
      },
    },
  },
  es: {
    languageLabel: "Idioma",
    tabs: {
      dashboard: { label: "Inicio", desc: "Resumen" },
      "video-analyzer": { label: "Analizador de Video", desc: "Analisis Completo" },
      "script-planner": { label: "Planificador de Guiones", desc: "Guiones IA" },
      "growth-planner": { label: "Crecimiento en YouTube", desc: "Studio" },
      "youtube-audit": { label: "Auditoria de YouTube", desc: "Studio" },
      "youtube-transcript": { label: "Transcripcion YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Leer en Vivo" },
    },
  },
  fr: {
    languageLabel: "Langue",
    tabs: {
      dashboard: { label: "Accueil", desc: "Vue d'ensemble" },
      "video-analyzer": { label: "Analyse Video", desc: "Analyse Complete" },
      "script-planner": { label: "Planificateur de Script", desc: "Scripts IA" },
      "growth-planner": { label: "Croissance YouTube", desc: "Studio" },
      "youtube-audit": { label: "Audit YouTube", desc: "Studio" },
      "youtube-transcript": { label: "Transcription YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompteur", desc: "Lire en Direct" },
    },
  },
  de: {
    languageLabel: "Sprache",
    tabs: {
      dashboard: { label: "Start", desc: "Ubersicht" },
      "video-analyzer": { label: "Videoanalyse", desc: "Vollanalyse" },
      "script-planner": { label: "Skriptplaner", desc: "KI Skripte" },
      "growth-planner": { label: "YouTube Wachstum", desc: "Studio" },
      "youtube-audit": { label: "YouTube Audit", desc: "Studio" },
      "youtube-transcript": { label: "YouTube Transkript", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Live Lesen" },
    },
  },
  pt: {
    languageLabel: "Idioma",
    tabs: {
      dashboard: { label: "Inicio", desc: "Visao Geral" },
      "video-analyzer": { label: "Analisador de Video", desc: "Analise Completa" },
      "script-planner": { label: "Planejador de Roteiro", desc: "Roteiros IA" },
      "growth-planner": { label: "Crescimento no YouTube", desc: "Studio" },
      "youtube-audit": { label: "Auditoria do YouTube", desc: "Studio" },
      "youtube-transcript": { label: "Transcricao YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Ler ao Vivo" },
    },
  },
  it: {
    languageLabel: "Lingua",
    tabs: {
      dashboard: { label: "Home", desc: "Panoramica" },
      "video-analyzer": { label: "Analizzatore Video", desc: "Analisi Completa" },
      "script-planner": { label: "Pianificatore Script", desc: "Script IA" },
      "growth-planner": { label: "Crescita YouTube", desc: "Studio" },
      "youtube-audit": { label: "Audit YouTube", desc: "Studio" },
      "youtube-transcript": { label: "Trascrizione YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Leggi dal Vivo" },
    },
  },
  nl: {
    languageLabel: "Taal",
    tabs: {
      dashboard: { label: "Home", desc: "Overzicht" },
      "video-analyzer": { label: "Video Analyzer", desc: "Volledige Analyse" },
      "script-planner": { label: "Scriptplanner", desc: "AI Scripts" },
      "growth-planner": { label: "YouTube Groei", desc: "Studio" },
      "youtube-audit": { label: "YouTube Audit", desc: "Studio" },
      "youtube-transcript": { label: "YouTube Transcript", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Live Lezen" },
    },
  },
  ru: {
    languageLabel: "Yazyk",
    tabs: {
      dashboard: { label: "Glavnaya", desc: "Obzor" },
      "video-analyzer": { label: "Analiz Video", desc: "Polnyy Analiz" },
      "script-planner": { label: "Planner Stsenariya", desc: "AI Skripty" },
      "growth-planner": { label: "Rost YouTube", desc: "Studio" },
      "youtube-audit": { label: "Audit YouTube", desc: "Studio" },
      "youtube-transcript": { label: "Transkript YouTube", desc: "Studio" },
      teleprompter: { label: "Teleprompter", desc: "Chitat V Pryamom Efire" },
    },
  },
  ar: {
    languageLabel: "اللغة",
    tabs: {
      dashboard: { label: "الرئيسية", desc: "نظرة عامة" },
      "video-analyzer": { label: "محلل الفيديو", desc: "تحليل كامل" },
      "script-planner": { label: "مخطط السكربت", desc: "سكريبتات الذكاء الاصطناعي" },
      "growth-planner": { label: "نمو يوتيوب", desc: "الاستوديو" },
      "youtube-audit": { label: "تدقيق يوتيوب", desc: "الاستوديو" },
      "youtube-transcript": { label: "نص يوتيوب", desc: "الاستوديو" },
      teleprompter: { label: "التلقين", desc: "قراءة مباشرة" },
    },
  },
  hi: {
    languageLabel: "भाषा",
    tabs: {
      dashboard: { label: "होम", desc: "सारांश" },
      "video-analyzer": { label: "वीडियो विश्लेषक", desc: "पूर्ण विश्लेषण" },
      "script-planner": { label: "स्क्रिप्ट प्लानर", desc: "एआई स्क्रिप्ट्स" },
      "growth-planner": { label: "यूट्यूब ग्रोथ", desc: "स्टूडियो" },
      "youtube-audit": { label: "यूट्यूब ऑडिट", desc: "स्टूडियो" },
      "youtube-transcript": { label: "यूट्यूब ट्रांसक्रिप्ट", desc: "स्टूडियो" },
      teleprompter: { label: "टेलीप्रॉम्प्टर", desc: "लाइव पढ़ें" },
    },
  },
  ja: {
    languageLabel: "言語",
    tabs: {
      dashboard: { label: "ホーム", desc: "概要" },
      "video-analyzer": { label: "動画分析", desc: "完全分析" },
      "script-planner": { label: "スクリプトプランナー", desc: "AIスクリプト" },
      "growth-planner": { label: "YouTube成長", desc: "スタジオ" },
      "youtube-audit": { label: "YouTube監査", desc: "スタジオ" },
      "youtube-transcript": { label: "YouTube文字起こし", desc: "スタジオ" },
      teleprompter: { label: "テレプロンプター", desc: "ライブ表示" },
    },
  },
  ko: {
    languageLabel: "언어",
    tabs: {
      dashboard: { label: "홈", desc: "개요" },
      "video-analyzer": { label: "비디오 분석기", desc: "전체 분석" },
      "script-planner": { label: "스크립트 플래너", desc: "AI 스크립트" },
      "growth-planner": { label: "유튜브 성장", desc: "스튜디오" },
      "youtube-audit": { label: "유튜브 감사", desc: "스튜디오" },
      "youtube-transcript": { label: "유튜브 트랜스크립트", desc: "스튜디오" },
      teleprompter: { label: "텔레프롬프터", desc: "라이브 읽기" },
    },
  },
  zh: {
    languageLabel: "语言",
    tabs: {
      dashboard: { label: "首页", desc: "概览" },
      "video-analyzer": { label: "视频分析", desc: "完整分析" },
      "script-planner": { label: "脚本规划", desc: "AI 脚本" },
      "growth-planner": { label: "YouTube 增长", desc: "工作室" },
      "youtube-audit": { label: "YouTube 审核", desc: "工作室" },
      "youtube-transcript": { label: "YouTube 转录", desc: "工作室" },
      teleprompter: { label: "提词器", desc: "实时阅读" },
    },
  },
};

function mergeCopy<T extends Record<string, unknown>>(base: T, override?: DeepPartial<T>): T {
  if (!override) return base;
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideValue = override[key];
    if (overrideValue === undefined) continue;
    const baseValue = base[key];
    if (
      overrideValue
      && baseValue
      && typeof overrideValue === "object"
      && typeof baseValue === "object"
      && !Array.isArray(overrideValue)
      && !Array.isArray(baseValue)
    ) {
      result[key as string] = mergeCopy(baseValue as Record<string, unknown>, overrideValue as DeepPartial<Record<string, unknown>>);
    } else {
      result[key as string] = overrideValue;
    }
  }
  return result as T;
}

const DayTabsI18nContext = createContext<{
  locale: DayTabsLocale;
  setLocale: (locale: DayTabsLocale) => void;
  copy: DayTabsCopy;
} | null>(null);

function normalizeLocale(input?: string | null): DayTabsLocale {
  return "en";
}

function detectInitialLocale(): DayTabsLocale {
  return normalizeLocale();
}

export function DayTabsI18nProvider({ children }: { children: ReactNode }) {
  const locale = detectInitialLocale();

  useEffect(() => {
    window.localStorage.setItem(DAYTABS_LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale: () => {},
    copy: mergeCopy(baseCopy, localeOverrides[locale]),
  }), [locale]);

  return <DayTabsI18nContext.Provider value={value}>{children}</DayTabsI18nContext.Provider>;
}

export function useDayTabsI18n() {
  const context = useContext(DayTabsI18nContext);
  if (!context) throw new Error("useDayTabsI18n must be used within DayTabsI18nProvider");
  return context;
}
