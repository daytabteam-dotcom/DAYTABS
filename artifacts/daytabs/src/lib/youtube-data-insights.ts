export type InsightConfidence = "high" | "medium" | "low";

export interface RecentVideo {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  publishedAt?: string | null;
  visibility?: string | null;
  duration?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  thumbnailUrl?: string | null;
  channelId?: string | null;
  channelTitle?: string | null;
  url: string;
}

export interface YoutubeAnalyticsPoint {
  date: string;
  views: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
}

export interface YoutubeWeeklyPlanLite {
  startDate: string;
  endDate: string;
  plan?: { days?: Array<{ day: number; date: string }> };
}

export interface YoutubePlanResultLite {
  dayIndex: number;
  videoId: string;
  videoUrl: string;
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const HOUR_BUCKETS = [
  { label: "00:00-06:00", start: 0, end: 6 },
  { label: "06:00-12:00", start: 6, end: 12 },
  { label: "12:00-18:00", start: 12, end: 18 },
  { label: "18:00-24:00", start: 18, end: 24 },
] as const;

function confidenceFromSamples(input: { videoCount: number; analyticsDayCount: number }): InsightConfidence {
  const { videoCount, analyticsDayCount } = input;
  if (videoCount >= 10 || analyticsDayCount >= 14) return "high";
  if (videoCount >= 5 || analyticsDayCount >= 7) return "medium";
  return "low";
}

function bucketLabelFromHour(hour: number) {
  const bucket = HOUR_BUCKETS.find((item) => hour >= item.start && hour < item.end);
  return bucket?.label ?? "18:00-24:00";
}

function toLocalWeekdayAndHourBucket(publishedAt: string) {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = DAYS_OF_WEEK[date.getDay()] ?? "Mon";
  const hourBucket = bucketLabelFromHour(date.getHours());
  return { weekday, hourBucket };
}

function hookType(title: string) {
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith("?")) return "question";
  if (/^(how|what|why|can|will|should|did|is)\b/i.test(trimmed)) return "question";
  if (/\b(story|struggle|fear|anxiety|healing|burnout|feelings?|mistake|failed|honest|vulnerable|lonely|sad)\b/i.test(lower)) return "emotional";
  if (/\b(tested|tried|reveal|result|what happened|finally|secret|surprising|unexpected|before|after)\b/i.test(lower)) return "curiosity";
  return "descriptive";
}

function isoFromPublishedAt(value?: string | null) {
  const iso = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inPlanWindow(iso: string, plan: YoutubeWeeklyPlanLite | null) {
  if (!plan?.startDate || !plan?.endDate) return false;
  return iso >= plan.startDate && iso <= plan.endDate;
}

function titleLengthBucketLabel(length: number) {
  if (length < 20) return "Under 20";
  if (length <= 35) return "20-35";
  if (length <= 50) return "35-50";
  if (length <= 70) return "50-70";
  return "Over 70";
}

export function deriveYoutubeDataInsights(input: {
  recentVideos: RecentVideo[];
  analyticsDaily: YoutubeAnalyticsPoint[];
  latestPlan: YoutubeWeeklyPlanLite | null;
  latestResults: YoutubePlanResultLite[];
}) {
  const { recentVideos, analyticsDaily, latestPlan, latestResults } = input;

  const visibleVideos = recentVideos.filter((video) => parseNumber(video.viewCount) > 0 && Boolean(video.publishedAt));
  const channelAverageViews = visibleVideos.length
    ? Math.round(visibleVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / visibleVideos.length)
    : 0;

  const baseConfidence = confidenceFromSamples({
    videoCount: visibleVideos.length,
    analyticsDayCount: analyticsDaily.length,
  });

  const bestTimesToPost = (() => {
    const cellsMap = new Map<string, { day: string; hour: string; total: number; count: number }>();
    for (const day of DAYS_OF_WEEK) {
      for (const bucket of HOUR_BUCKETS) {
        cellsMap.set(`${day}|${bucket.label}`, { day, hour: bucket.label, total: 0, count: 0 });
      }
    }

    for (const video of visibleVideos) {
      const publishedAt = video.publishedAt;
      if (!publishedAt) continue;
      const local = toLocalWeekdayAndHourBucket(publishedAt);
      if (!local) continue;
      const key = `${local.weekday}|${local.hourBucket}`;
      const cell = cellsMap.get(key);
      if (!cell) continue;
      cell.total += parseNumber(video.viewCount);
      cell.count += 1;
    }

    const cells = [...cellsMap.values()].map((cell) => ({
      day: cell.day,
      hour: cell.hour,
      value: cell.count ? Math.round(cell.total / cell.count) : 0,
      count: cell.count,
    }));

    const nonEmpty = cells.filter((cell) => cell.count > 0);
    const highest = nonEmpty.length
      ? [...nonEmpty].sort((a, b) => b.value - a.value)[0]!
      : null;

    const sampleVideos = (() => {
      if (!highest) return [];
      const matches = visibleVideos
        .filter((video) => {
          if (!video.publishedAt) return false;
          const local = toLocalWeekdayAndHourBucket(video.publishedAt);
          if (!local) return false;
          return local.weekday === highest.day && local.hourBucket === highest.hour;
        })
        .sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))
        .slice(0, 2);
      return matches.map((video) => ({ title: video.title, viewCount: parseNumber(video.viewCount) }));
    })();

    const percentAbove = highest && channelAverageViews
      ? Math.round(((highest.value - channelAverageViews) / channelAverageViews) * 100)
      : 0;

    const enoughData = visibleVideos.length >= 5;
    const summary = enoughData && highest
      ? `Your strongest slot is ${highest.day} ${highest.hour} at ${highest.value.toLocaleString()} average views, ${percentAbove}% above your channel average.`
      : "You do not have enough uploads yet for a reliable best posting time. This chart will become more useful after more uploads.";

    const evidence = sampleVideos.length
      ? [`Evidence: ${sampleVideos.map((video) => `"${video.title}" (${video.viewCount.toLocaleString()} views)`).join(", ")}`]
      : [];

    const recommendation = enoughData && highest
      ? `Post your next high-effort video during ${highest.day} ${highest.hour}. Keep testing nearby windows until more data is available.`
      : "Keep publishing consistently; after a few more uploads, this will identify your strongest posting windows.";

    return {
      confidence: baseConfidence,
      chartData: {
        cells: cells.map((cell) => ({ day: cell.day, hour: cell.hour === "00:00-06:00" ? "00:00" : cell.hour === "06:00-12:00" ? "06:00" : cell.hour === "12:00-18:00" ? "12:00" : "18:00", value: cell.value, count: cell.count })),
        highest: highest
          ? { day: highest.day, hour: highest.hour === "00:00-06:00" ? "00:00" : highest.hour === "06:00-12:00" ? "06:00" : highest.hour === "12:00-18:00" ? "12:00" : "18:00", value: highest.value, count: highest.count }
          : null,
        average: channelAverageViews,
        sampleVideos,
      },
      summary,
      evidence,
      recommendation,
    };
  })();

  const optimalTitleLength = (() => {
    const buckets = [
      { label: "Under 20", min: 0, max: 19 },
      { label: "20-35", min: 20, max: 35 },
      { label: "35-50", min: 36, max: 50 },
      { label: "50-70", min: 51, max: 70 },
      { label: "Over 70", min: 71, max: Infinity },
    ];

    const stats = buckets.map((bucket) => {
      const items = visibleVideos
        .filter((video) => video.title.length >= bucket.min && video.title.length <= bucket.max)
        .map((video) => ({ title: video.title, views: parseNumber(video.viewCount), titleLength: video.title.length }))
        .sort((a, b) => b.views - a.views);
      const averageViews = items.length ? Math.round(items.reduce((sum, video) => sum + video.views, 0) / items.length) : 0;
      const topTitles = items.slice(0, 5);
      const bottomTitles = items.slice().reverse().slice(0, 5);
      return { ...bucket, averageViews, count: items.length, topTitles, bottomTitles };
    });

    const winner = [...stats].sort((a, b) => b.averageViews - a.averageViews)[0] ?? null;
    const deltaPercent = winner && channelAverageViews
      ? Math.round(((winner.averageViews - channelAverageViews) / channelAverageViews) * 100)
      : 0;

    const summary = winner && winner.count >= 2
      ? `Videos with titles in the ${winner.label} range average ${winner.averageViews.toLocaleString()} views, ${deltaPercent}% compared with your channel average.`
      : "Title length insights need more uploads to be reliable. Keep testing clear, specific titles with curiosity and tension.";

    return {
      confidence: baseConfidence,
      chartData: {
        buckets: stats.map((item) => ({
          label: item.label,
          min: item.min,
          max: item.max,
          averageViews: item.averageViews,
          count: item.count,
          topTitles: item.topTitles,
          bottomTitles: item.bottomTitles,
        })),
        winningBucket: winner ? { label: winner.label, min: winner.min, max: winner.max, averageViews: winner.averageViews, count: winner.count } : null,
        channelAverageViews,
      },
      summary,
      evidence: [],
      recommendation: "Keep upcoming titles near this range, but prioritize clarity, curiosity, and emotional tension over exact character count.",
    };
  })();

  const subscriberGrowth = (() => {
    const points = [...analyticsDaily].filter((point) => point.date).sort((a, b) => a.date.localeCompare(b.date));
    const todayIso = new Date().toISOString().slice(0, 10);
    const padded = points.length ? (() => {
      const byDate = new Map(points.map((p) => [p.date, p]));
      const start = points[0]!.date;
      const out: YoutubeAnalyticsPoint[] = [];
      for (let cursor = start; cursor <= todayIso; cursor = addDaysIso(cursor, 1)) {
        const hit = byDate.get(cursor);
        out.push(hit ?? {
          date: cursor,
          views: 0,
          subscribersGained: 0,
          subscribersLost: 0,
          subscribersNet: 0,
          estimatedMinutesWatched: 0,
          averageViewDuration: 0,
        });
      }
      return out;
    })() : [];
    const spike = padded.length ? [...padded].sort((a, b) => b.subscribersNet - a.subscribersNet)[0] : null;
    const spikeIso = spike?.date ?? null;
    const spikeVideo = spikeIso
      ? [...visibleVideos].find((video) => isoFromPublishedAt(video.publishedAt) === spikeIso)
        ?? [...visibleVideos].find((video) => {
          const iso = isoFromPublishedAt(video.publishedAt);
          if (!iso) return false;
          const dayDiff = Math.abs(new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${spikeIso}T00:00:00Z`).getTime());
          return dayDiff <= 86400000;
        })
      : null;

    const markerByDate = new Map<string, Array<{ title: string; views: number }>>();
    for (const video of visibleVideos) {
      const iso = isoFromPublishedAt(video.publishedAt);
      if (!iso) continue;
      const items = markerByDate.get(iso) ?? [];
      items.push({ title: video.title, views: parseNumber(video.viewCount) });
      markerByDate.set(iso, items);
    }

    const timeline = padded.map((point) => ({
      date: point.date.slice(5),
      rawDate: point.date,
      subscribersNet: point.subscribersNet,
      markerVideos: (markerByDate.get(point.date) ?? []).sort((a, b) => b.views - a.views).slice(0, 2),
    }));

    const summary = spike && spikeIso
      ? `Your biggest subscriber spike was on ${spikeIso} with ${spike.subscribersNet} net subscribers.${spikeVideo ? ` The closest upload was "${spikeVideo.title}".` : ""}`
      : "Subscriber growth is still limited in the selected period. Keep testing topics and formats that increase comments, saves, and watch time.";

    const recommendation = spikeVideo
      ? "Repeat the format, topic, or hook style from the upload closest to your strongest subscriber gain."
      : "Keep publishing consistently and review which uploads correlate with higher watch time and comments.";

    return {
      confidence: confidenceFromSamples({ videoCount: visibleVideos.length, analyticsDayCount: points.length }),
      chartData: { timeline, spike: spike && spikeIso ? { date: spikeIso.slice(5), rawDate: spikeIso, subscribersNet: spike.subscribersNet } : null, spikeVideo: spikeVideo ? { title: spikeVideo.title } : null },
      summary,
      evidence: spikeVideo ? [`Closest upload: "${spikeVideo.title}" (${parseNumber(spikeVideo.viewCount).toLocaleString()} views)`] : [],
      recommendation,
    };
  })();

  const tagsPerformance = (() => {
    const tagMap = new Map<string, { tag: string; total: number; count: number }>();
    for (const video of visibleVideos) {
      for (const tag of video.tags ?? []) {
        const key = tag.trim().toLowerCase();
        if (!key) continue;
        const entry = tagMap.get(key) ?? { tag: key, total: 0, count: 0 };
        entry.total += parseNumber(video.viewCount);
        entry.count += 1;
        tagMap.set(key, entry);
      }
    }

    const rows = [...tagMap.values()]
      .map((entry) => {
        const averageViews = entry.count ? Math.round(entry.total / entry.count) : 0;
        const deltaPercent = channelAverageViews ? Math.round(((averageViews - channelAverageViews) / channelAverageViews) * 100) : 0;
        const classification = averageViews >= channelAverageViews * 1.15
          ? "helpful"
          : averageViews <= channelAverageViews * 0.85
            ? "hurt"
            : "neutral";
        return { tag: entry.tag, averageViews, count: entry.count, classification, deltaPercent };
      })
      .sort((a, b) => b.averageViews - a.averageViews)
      .slice(0, 30);

    return {
      confidence: baseConfidence,
      chartData: rows,
      summary: "Green tags are currently associated with above-average views. Red tags are associated with below-average views. Treat this as a signal, not a guarantee.",
      evidence: [],
      recommendation: "Reuse helpful tags only when they accurately match the video. Avoid forcing tags that do not fit the content.",
    };
  })();

  const hookPatterns = (() => {
    const groups = new Map<string, RecentVideo[]>();
    for (const video of visibleVideos) {
      const type = hookType(video.title);
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(video);
    }
    const rows = [...groups.entries()].map(([type, items]) => ({
      type,
      count: items.length,
      averageViews: items.length ? Math.round(items.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / items.length) : 0,
      evidenceVideos: [...items].sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount)).slice(0, 3).map((video) => ({ title: video.title, viewCount: parseNumber(video.viewCount) })),
    })).sort((a, b) => b.averageViews - a.averageViews);

    const winner = rows[0] ?? null;
    const summary = winner
      ? `Your strongest hook type is ${winner.type}, averaging ${winner.averageViews.toLocaleString()} views across ${winner.count} videos.`
      : "Hook pattern insights need more uploads to be reliable.";

    const recommendation = winner
      ? `Use more ${winner.type} hooks next week, especially for topics similar to your top performers.`
      : "Keep testing different hook patterns. After more uploads, this will identify what wins on your channel.";

    return {
      confidence: baseConfidence,
      chartData: { rows, winner },
      summary,
      evidence: winner?.evidenceVideos?.length ? [`Evidence: ${winner.evidenceVideos.map((video) => `"${video.title}" (${video.viewCount.toLocaleString()} views)`).join(", ")}`] : [],
      recommendation,
    };
  })();

  const uploadConsistency = (() => {
    const sorted = [...visibleVideos].sort((a, b) => (a.publishedAt || "").localeCompare(b.publishedAt || ""));
    const publishedDates = sorted.map((video) => video.publishedAt ? new Date(video.publishedAt).getTime() : 0).filter(Boolean);
    const gaps = publishedDates.slice(1).map((time, index) => Math.max(0, Math.round((time - publishedDates[index]!) / 86400000)));
    const avgGap = gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null;
    const longestGap = gaps.length ? Math.max(...gaps) : null;
    const uploadsPerWeek = publishedDates.length >= 2
      ? Number((publishedDates.length / Math.max(1, (publishedDates[publishedDates.length - 1]! - publishedDates[0]!) / (7 * 86400000))).toFixed(1))
      : publishedDates.length;

    const weekdayCounts = new Map<string, number>();
    for (const video of visibleVideos) {
      if (!video.publishedAt) continue;
      const local = toLocalWeekdayAndHourBucket(video.publishedAt);
      if (!local) continue;
      weekdayCounts.set(local.weekday, (weekdayCounts.get(local.weekday) ?? 0) + 1);
    }
    const mostCommonUploadWeekday = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const latestPlanDays = (latestPlan?.plan?.days ?? []).filter((day) => day && typeof day === "object");
    const plannedCount = latestPlanDays.length;
    const postedCount = latestPlan && plannedCount
      ? latestResults.filter((result) => {
        const match = latestPlanDays.find((day) => Number((day as any).day) === Number(result.dayIndex));
        return Boolean(match);
      }).length
      : 0;

    const summaryBase = `You posted ${uploadsPerWeek} times per week on average.${longestGap != null ? ` Your longest gap was ${longestGap} days.` : ""}`;
    const summary = plannedCount
      ? `${summaryBase} You completed ${postedCount} of ${plannedCount} planned uploads for the latest plan week.`
      : summaryBase;

    const recommendation = "Keep a realistic cadence you can repeat. Consistency matters more than overposting for one week.";

    return {
      confidence: baseConfidence,
      chartData: { uploadsPerWeek, avgGapDays: avgGap, longestGapDays: longestGap, mostCommonUploadWeekday, plannedCount, postedCount },
      summary,
      evidence: [],
      recommendation,
    };
  })();

  const topVideos = (() => {
    const top = [...visibleVideos]
      .sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))
      .slice(0, 5)
      .map((video) => ({
        id: video.id,
        title: video.title,
        views: parseNumber(video.viewCount),
        likes: parseNumber(video.likeCount),
        comments: parseNumber(video.commentCount),
        publishedAt: video.publishedAt ?? null,
        tags: (video.tags ?? []).slice(0, 8),
        hookType: hookType(video.title),
        titleLength: video.title.length,
        url: video.url,
      }));

    const hookCounts = new Map<string, number>();
    const bucketCounts = new Map<string, number>();
    const timeCounts = new Map<string, number>();
    for (const video of top) {
      hookCounts.set(video.hookType, (hookCounts.get(video.hookType) ?? 0) + 1);
      bucketCounts.set(titleLengthBucketLabel(video.titleLength), (bucketCounts.get(titleLengthBucketLabel(video.titleLength)) ?? 0) + 1);
      const publishedAt = visibleVideos.find((v) => v.id === video.id)?.publishedAt;
      if (publishedAt) {
        const local = toLocalWeekdayAndHourBucket(publishedAt);
        if (local) timeCounts.set(`${local.weekday} ${local.hourBucket}`, (timeCounts.get(`${local.weekday} ${local.hourBucket}`) ?? 0) + 1);
      }
    }
    const topHook = [...hookCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "descriptive";
    const topBucket = [...bucketCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "20-35";
    const topTime = [...timeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "varied times";

    return {
      confidence: baseConfidence,
      chartData: top,
      summary: top.length ? `Your top videos are mostly driven by ${topHook} hooks and ${topBucket} title lengths, often posted around ${topTime}.` : "No published videos found yet.",
      evidence: [],
      recommendation: top.length ? "Look for repeatable patterns in your top videos: topic lane, hook type, and title structure." : "Publish a few videos to unlock top-performer patterns.",
    };
  })();

  const underperformingVideos = (() => {
    const now = Date.now();
    const sorted = [...visibleVideos]
      .filter((video) => {
        const publishedAt = video.publishedAt ? new Date(video.publishedAt).getTime() : 0;
        if (!publishedAt) return false;
        // exclude extremely new uploads (first 24h) when possible
        return (now - publishedAt) > 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => parseNumber(a.viewCount) - parseNumber(b.viewCount));

    const bestSlot = bestTimesToPost.chartData.highest
      ? { weekday: bestTimesToPost.chartData.highest.day, hourBucket: bestTimesToPost.chartData.highest.hour === "00:00" ? "00:00-06:00" : bestTimesToPost.chartData.highest.hour === "06:00" ? "06:00-12:00" : bestTimesToPost.chartData.highest.hour === "12:00" ? "12:00-18:00" : "18:00-24:00" }
      : null;
    const bestTitleBucket = optimalTitleLength.chartData.winningBucket?.label ?? null;

    const bottom = sorted.slice(0, 5).map((video) => {
      const reasons: string[] = [];
      const ht = hookType(video.title);
      if (ht === "descriptive") reasons.push("weak hook pattern (descriptive title)");

      if (bestTitleBucket && titleLengthBucketLabel(video.title.length) !== bestTitleBucket) {
        reasons.push(`title outside best range (${bestTitleBucket})`);
      }

      const publishedAt = video.publishedAt ?? null;
      if (publishedAt && bestSlot) {
        const local = toLocalWeekdayAndHourBucket(publishedAt);
        if (local && `${local.weekday} ${local.hourBucket}` !== `${bestSlot.weekday} ${bestSlot.hourBucket}`) {
          reasons.push(`posted outside strongest slot (${bestSlot.weekday} ${bestSlot.hourBucket})`);
        }
      }

      if (!reasons.length) reasons.push("too early to judge or needs a new packaging test");

      return {
        id: video.id,
        title: video.title,
        views: parseNumber(video.viewCount),
        likes: parseNumber(video.likeCount),
        comments: parseNumber(video.commentCount),
        publishedAt: video.publishedAt ?? null,
        tags: (video.tags ?? []).slice(0, 8),
        hookType: ht,
        titleLength: video.title.length,
        url: video.url,
        reason: reasons.join("; "),
      };
    });

    return {
      confidence: baseConfidence,
      chartData: bottom,
      summary: bottom.length ? "Your lowest-performing videos tend to share repeatable packaging or timing patterns. Use this as a test signal, not a final judgment." : "No published videos found yet.",
      evidence: [],
      recommendation: bottom.length ? "When you revisit these topics, test a stronger hook type and a clearer title promise." : "Publish a few videos to unlock underperformer patterns.",
    };
  })();

  const tagsToTest = (() => {
    const tagMap = new Map<string, { tag: string; total: number; count: number; topTitle?: string }>();
    const byViews = [...visibleVideos].sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount));
    for (const video of byViews) {
      for (const tag of video.tags ?? []) {
        const key = tag.trim().toLowerCase();
        if (!key) continue;
        const entry = tagMap.get(key) ?? { tag: key, total: 0, count: 0, topTitle: undefined };
        entry.total += parseNumber(video.viewCount);
        entry.count += 1;
        if (!entry.topTitle) entry.topTitle = video.title;
        tagMap.set(key, entry);
      }
    }

    const candidates = [...tagMap.values()]
      .map((entry) => ({
        tag: entry.tag,
        averageViews: entry.count ? Math.round(entry.total / entry.count) : 0,
        count: entry.count,
        relatedTopVideo: entry.topTitle ?? "",
      }))
      .filter((row) => row.tag && row.count > 0)
      .sort((a, b) => (b.averageViews * 10 - b.count) - (a.averageViews * 10 - a.count));

    const picks = candidates
      .filter((row) => row.count <= 2 && row.averageViews >= channelAverageViews)
      .slice(0, 10)
      .map((row) => ({
        tag: row.tag,
        reason: `Used ${row.count} time(s) but averages ${row.averageViews.toLocaleString()} views.`,
        relatedTopVideo: row.relatedTopVideo,
        confidence: baseConfidence,
      }));

    const summary = picks.length
      ? "These tags appear in stronger videos but are not used often enough yet. Test them only when relevant to the next video."
      : "No clear tags to test yet. As you publish more, this will surface tags with strong performance but low usage.";

    return {
      confidence: baseConfidence,
      chartData: picks,
      summary,
      evidence: [],
      recommendation: "Test one or two of these tags on your next relevant upload; avoid forcing tags that don’t match the content.",
    };
  })();

  return {
    bestTimesToPost,
    optimalTitleLength,
    subscriberGrowth,
    tagsPerformance,
    hookPatterns,
    uploadConsistency,
    topVideos,
    underperformingVideos,
    tagsToTest,
  };
}
