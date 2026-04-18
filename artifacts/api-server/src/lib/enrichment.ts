const FETCH_TIMEOUT_MS = 7000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BOT_USER_AGENT = "DayTabs growth-planner-bot/1.0 (+https://daytabs.com)";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_YOUTUBE_API_KEY || "";
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || "";

export interface PublicProfileData {
  platform: string;
  url: string;
  normalizedUrl: string;
  username: string | null;
  rawHtml: string;
  metaDescription: string | null;
  possibleFollowerCount: string | null;
  possiblePostCount: string | null;
  followerCount?: string | number | null;
  subscriberCount?: string | null;
  followingCount?: string | number | null;
  postCount?: string | number | null;
  videoCount?: string | number | null;
  totalLikes?: string | number | null;
  channelName?: string | null;
  authorName?: string | null;
  fullName?: string | null;
  isVerified?: boolean | null;
  bio?: string | null;
  description?: string | null;
  ogTitle?: string | null;
  parseError?: string | null;
  apiSource?: string | null;
  sourceUrl?: string | null;
  fetchedAt: string;
  error?: string | null;
}

export interface RedditTrendItem {
  title: string;
  score: number;
  comments: number;
  url: string;
}

export interface PlatformTrendItem {
  platform: string;
  topic: string;
  title: string;
  creator: string | null;
  url: string;
  source: string;
  format: string;
  metricSignals: Record<string, string | number | null>;
  whyRelevant?: string | null;
}

export interface TrendData {
  googleTrends: string | null;
  googleTrendItems: string[];
  redditHot: RedditTrendItem[];
  youtubeTrending: string[];
  platformTrends: Record<string, PlatformTrendItem[]>;
  platformTrendErrors: Record<string, string[]>;
  subreddit: string;
  fetchedAt: string;
  errors: string[];
}

function withTimeout(ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

type FetchHeaders = Record<string, string>;

function headers(accept: string, userAgent = BROWSER_USER_AGENT): FetchHeaders {
  return {
    "User-Agent": userAgent,
    "Accept": accept,
    "Accept-Language": "en-US,en;q=0.9",
  };
}

async function fetchText(url: string, accept = "text/html,application/xhtml+xml") {
  const { controller, timeout } = withTimeout();
  try {
    const response = await fetch(url, { headers: headers(accept), signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url: string, accept = "application/json", extraHeaders: FetchHeaders = {}) {
  const { controller, timeout } = withTimeout();
  try {
    const response = await fetch(url, {
      headers: { ...headers(accept), ...extraHeaders },
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) as unknown : null;
    return { response, json };
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"));
  return match?.[1] ? stripTags(match[1]) : null;
}

function extractMetaDescription(html: string) {
  return extractMeta(html, "og:description") ?? extractMeta(html, "description");
}

function parseJsonObject(text: string, startIndex: number) {
  const firstBrace = text.indexOf("{", startIndex);
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(firstBrace, index + 1);
    }
  }

  return null;
}

function extractScriptJson(html: string, markers: string[]) {
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex >= 0) {
      const jsonText = parseJsonObject(html, markerIndex + marker.length);
      if (jsonText) return jsonText;
    }
  }
  return null;
}

function extractCount(html: string, labels: string[]) {
  const text = stripTags(html).slice(0, 8000);
  for (const label of labels) {
    const afterCount = new RegExp(`([\\d,.]+\\s*[kKmMbB]?)\\s+${label}`, "i").exec(text);
    if (afterCount?.[1]) return afterCount[1];

    const beforeCount = new RegExp(`${label}\\s*[:\\-]?\\s*([\\d,.]+\\s*[kKmMbB]?)`, "i").exec(text);
    if (beforeCount?.[1]) return beforeCount[1];
  }
  return null;
}

function normalizeProfileUrl(rawUrl: string, platform: string) {
  try {
    const value = rawUrl.trim();
    const u = new URL(value.startsWith("http") ? value : `https://${value}`);
    const hostname = u.hostname.replace(/^www\./, "");
    const origin = `${u.protocol}//${hostname}`;
    const path = u.pathname.replace(/\/+$/, "");

    if (platform === "instagram" && hostname === "instagr.am") {
      return `https://instagram.com${path}`;
    }

    return `${origin}${path || "/"}`;
  } catch {
    return rawUrl;
  }
}

function extractUsername(url: string) {
  try {
    const path = new URL(normalizeProfileUrl(url, "")).pathname;
    const match = path.match(/\/@?([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractYouTubeChannelId(url: string) {
  try {
    const path = new URL(normalizeProfileUrl(url, "youtube")).pathname;
    const match = path.match(/\/channel\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function baseProfile(platform: string, url: string, fetchedAt: string): PublicProfileData {
  return {
    platform,
    url,
    normalizedUrl: normalizeProfileUrl(url, platform),
    username: extractUsername(url),
    rawHtml: "",
    metaDescription: null,
    possibleFollowerCount: null,
    possiblePostCount: null,
    fetchedAt,
    error: null,
  };
}

function mergeHtmlProfile(profile: PublicProfileData, html: string, responseOk: boolean, status: number) {
  return {
    ...profile,
    rawHtml: html.slice(0, 3000),
    metaDescription: extractMetaDescription(html),
    possibleFollowerCount: extractCount(html, ["followers", "follower", "subscribers", "connections"]),
    possiblePostCount: extractCount(html, ["posts", "videos", "tweets", "articles"]),
    error: responseOk ? null : `HTTP ${status}`,
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

async function fetchYouTubeApi(path: string, params: Record<string, string>) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured");
  const search = new URLSearchParams({ ...params, key: YOUTUBE_API_KEY });
  const { response, json } = await fetchJson(`https://www.googleapis.com/youtube/v3/${path}?${search.toString()}`);
  if (!response.ok) throw new Error(`YouTube API HTTP ${response.status}`);
  return getRecord(json);
}

async function fetchXApi(path: string, params: Record<string, string>) {
  if (!X_BEARER_TOKEN) throw new Error("X_BEARER_TOKEN or TWITTER_BEARER_TOKEN is not configured");
  const search = new URLSearchParams(params);
  const { response, json } = await fetchJson(
    `https://api.twitter.com/2/${path}?${search.toString()}`,
    "application/json",
    { Authorization: `Bearer ${X_BEARER_TOKEN}` },
  );
  if (!response.ok) throw new Error(`X API HTTP ${response.status}`);
  return getRecord(json);
}

async function scrapeYouTubeChannelWithApi(profile: PublicProfileData) {
  const channelId = extractYouTubeChannelId(profile.normalizedUrl);
  let resolvedChannelId = channelId;

  if (!resolvedChannelId) {
    const query = profile.username ? `@${profile.username}` : profile.normalizedUrl;
    const search = await fetchYouTubeApi("search", {
      part: "snippet",
      type: "channel",
      q: query,
      maxResults: "1",
    });
    const item = getRecord(getArray(search.items)[0]);
    resolvedChannelId = firstString(getRecord(item.id).channelId);
  }

  if (!resolvedChannelId) throw new Error("YouTube channel could not be resolved from URL");

  const data = await fetchYouTubeApi("channels", {
    part: "snippet,statistics",
    id: resolvedChannelId,
    maxResults: "1",
  });
  const item = getRecord(getArray(data.items)[0]);
  if (!Object.keys(item).length) throw new Error("YouTube channel not found");
  const snippet = getRecord(item.snippet);
  const statistics = getRecord(item.statistics);

  return {
    ...profile,
    normalizedUrl: `https://www.youtube.com/channel/${resolvedChannelId}`,
    channelName: firstString(snippet.title),
    subscriberCount: firstString(statistics.subscriberCount),
    videoCount: firstString(statistics.videoCount),
    description: firstString(snippet.description),
    apiSource: "youtube-data-api",
    sourceUrl: `https://www.googleapis.com/youtube/v3/channels?id=${resolvedChannelId}`,
    parseError: null,
    error: null,
  };
}

async function scrapeXProfileWithApi(profile: PublicProfileData) {
  if (!profile.username) throw new Error("no X username extracted");
  const data = await fetchXApi(`users/by/username/${encodeURIComponent(profile.username)}`, {
    "user.fields": "description,public_metrics,verified,url",
  });
  const user = getRecord(data.data);
  if (!Object.keys(user).length) throw new Error("X user not found");
  const metrics = getRecord(user.public_metrics);

  return {
    ...profile,
    fullName: firstString(user.name),
    followerCount: typeof metrics.followers_count === "number" ? metrics.followers_count : null,
    followingCount: typeof metrics.following_count === "number" ? metrics.following_count : null,
    postCount: typeof metrics.tweet_count === "number" ? metrics.tweet_count : null,
    bio: firstString(user.description),
    isVerified: typeof user.verified === "boolean" ? user.verified : null,
    apiSource: "x-api-v2",
    sourceUrl: `https://api.twitter.com/2/users/by/username/${profile.username}`,
    parseError: null,
    error: null,
  };
}

function unavailableApiProfile(profile: PublicProfileData, apiName: string, reason: string) {
  return {
    ...profile,
    possibleFollowerCount: null,
    possiblePostCount: null,
    followerCount: null,
    subscriberCount: null,
    followingCount: null,
    postCount: null,
    videoCount: null,
    totalLikes: null,
    bio: null,
    description: null,
    apiSource: apiName,
    parseError: reason,
    error: reason,
  };
}

async function scrapeYouTubeChannel(profile: PublicProfileData) {
  const { response, text } = await fetchText(profile.normalizedUrl);
  const htmlData = mergeHtmlProfile(profile, text, response.ok, response.status);
  const initialDataJson = extractScriptJson(text, ["var ytInitialData =", "window[\"ytInitialData\"] ="]);

  if (!initialDataJson) {
    return {
      ...htmlData,
      subscriberCount: null,
      videoCount: null,
      description: htmlData.metaDescription,
      parseError: "ytInitialData not found",
      error: "YouTube channel metrics could not be parsed from public HTML",
    };
  }

  try {
    const data = getRecord(JSON.parse(initialDataJson) as unknown);
    const header = getRecord(getRecord(data.header).pageHeaderRenderer ?? getRecord(data.header).c4TabbedHeaderRenderer);
    const subscriberCountText = getRecord(header.subscriberCountText);
    const subscriberRuns = Array.isArray(subscriberCountText.runs) ? subscriberCountText.runs : [];
    const subscriberRun = getRecord(subscriberRuns[0]);
    const metadata = getRecord(getRecord(data.metadata).channelMetadataRenderer);
    const tabs = Array.isArray(getRecord(getRecord(data.contents).twoColumnBrowseResultsRenderer).tabs)
      ? getRecord(getRecord(data.contents).twoColumnBrowseResultsRenderer).tabs as unknown[]
      : [];
    const videosTab = tabs.find((tab) => getRecord(getRecord(tab).tabRenderer).title === "Videos");
    const videoCountText = getRecord(getRecord(getRecord(getRecord(getRecord(getRecord(videosTab).tabRenderer).content).richGridRenderer).header).feedFilterChipBarRenderer);
    const videoCountContents = Array.isArray(videoCountText.contents) ? videoCountText.contents : [];
    const firstVideoCountRun = getRecord(getRecord(getRecord(videoCountContents[0]).chipCloudChipRenderer).text);
    const videoRuns = Array.isArray(firstVideoCountRun.runs) ? firstVideoCountRun.runs : [];
    const firstVideoRun = getRecord(videoRuns[0]);

    return {
      ...htmlData,
      subscriberCount: typeof subscriberCountText.simpleText === "string"
        ? subscriberCountText.simpleText
        : typeof subscriberRun.text === "string"
          ? subscriberRun.text
          : null,
      videoCount: typeof firstVideoRun.text === "string" ? firstVideoRun.text : null,
      description: typeof metadata.description === "string" ? metadata.description : htmlData.metaDescription,
      parseError: null,
      error: htmlData.error,
    };
  } catch (err) {
    return {
      ...htmlData,
      subscriberCount: null,
      videoCount: null,
      description: htmlData.metaDescription,
      parseError: err instanceof Error ? err.message : "ytInitialData parse failed",
      error: "YouTube channel metrics could not be parsed from public HTML",
    };
  }
}

async function scrapeTikTokProfile(profile: PublicProfileData) {
  const { response, text } = await fetchText(profile.normalizedUrl);
  const htmlData = mergeHtmlProfile(profile, text, response.ok, response.status);
  const followerMatch = text.match(/"followerCount":(\d+)/);
  const likeMatch = text.match(/"heartCount":(\d+)/);
  const videoMatch = text.match(/"videoCount":(\d+)/);
  const bioMatch = text.match(/"signature":"([^"]{0,300})"/);

  return {
    ...htmlData,
    followerCount: followerMatch?.[1] ?? htmlData.possibleFollowerCount,
    totalLikes: likeMatch?.[1] ?? null,
    videoCount: videoMatch?.[1] ?? htmlData.possiblePostCount,
    bio: bioMatch?.[1] ? decodeHtmlEntities(bioMatch[1]) : htmlData.metaDescription,
  };
}

async function scrapeInstagramProfile(profile: PublicProfileData) {
  if (!profile.username) return { ...profile, error: "no username" };

  try {
    const { response, text } = await fetchText(
      `https://www.instagram.com/${profile.username}/embed`,
      "text/html",
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const additionalDataMatch = text.match(/window\.__additionalDataLoaded\('[^']+',\s*/);
    const jsonText = additionalDataMatch
      ? parseJsonObject(text, additionalDataMatch.index ?? 0)
      : extractScriptJson(text, ["window._sharedData ="]);

    if (jsonText) {
      const root = getRecord(JSON.parse(jsonText) as unknown);
      const profilePage = Array.isArray(getRecord(root.entry_data).ProfilePage) ? getRecord(root.entry_data).ProfilePage as unknown[] : [];
      const user = getRecord(getRecord(root.graphql).user ?? getRecord(getRecord(profilePage[0]).graphql).user);

      if (Object.keys(user).length > 0) {
        const followedBy = getRecord(user.edge_followed_by);
        const follows = getRecord(user.edge_follow);
        const timeline = getRecord(user.edge_owner_to_timeline_media);

        return {
          ...profile,
          rawHtml: text.slice(0, 3000),
          metaDescription: extractMetaDescription(text),
          followerCount: typeof followedBy.count === "number" ? followedBy.count : null,
          followingCount: typeof follows.count === "number" ? follows.count : null,
          postCount: typeof timeline.count === "number" ? timeline.count : null,
          bio: typeof user.biography === "string" ? user.biography : null,
          fullName: typeof user.full_name === "string" ? user.full_name : null,
          isVerified: typeof user.is_verified === "boolean" ? user.is_verified : null,
          parseError: null,
          error: null,
        };
      }
    }
  } catch {
    // Fall through to profile-page Open Graph parsing.
  }

  try {
    const { response, text } = await fetchText(`https://www.instagram.com/${profile.username}/`, "text/html");
    const htmlData = mergeHtmlProfile(profile, text, response.ok, response.status);
    const ogDesc = extractMeta(text, "og:description");
    const ogTitle = extractMeta(text, "og:title");
    const followerMatch = ogDesc?.match(/([\d,]+)\s+Followers/i);
    const followingMatch = ogDesc?.match(/([\d,]+)\s+Following/i);
    const postMatch = ogDesc?.match(/([\d,]+)\s+Posts/i);

    return {
      ...htmlData,
      followerCount: followerMatch?.[1]?.replace(/,/g, "") ?? null,
      followingCount: followingMatch?.[1]?.replace(/,/g, "") ?? null,
      postCount: postMatch?.[1]?.replace(/,/g, "") ?? null,
      bio: ogDesc,
      fullName: ogTitle,
      ogTitle,
      parseError: followerMatch || followingMatch || postMatch ? null : "Instagram metrics not found in public Open Graph metadata",
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ...profile,
      followerCount: null,
      followingCount: null,
      postCount: null,
      bio: null,
      fullName: null,
      parseError: err instanceof Error ? err.message : "Instagram profile scrape failed",
      error: err instanceof Error ? err.message : "Instagram profile scrape failed",
    };
  }
}

async function fetchOEmbed(url: string, platform: string) {
  const endpoint = platform === "youtube"
    ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    : `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;

  const { response, json } = await fetchJson(endpoint);
  if (!response.ok) throw new Error(`oEmbed HTTP ${response.status}`);
  return getRecord(json);
}

async function genericScrape(profile: PublicProfileData) {
  const { response, text } = await fetchText(profile.normalizedUrl);
  const htmlData = mergeHtmlProfile(profile, text, response.ok, response.status);
  return {
    ...htmlData,
    ogTitle: extractMeta(text, "og:title"),
    description: extractMetaDescription(text),
  };
}

export async function scrapePublicProfile(url: string, platform: string): Promise<PublicProfileData> {
  const fetchedAt = new Date().toISOString();
  const profile = baseProfile(platform, url, fetchedAt);

  try {
    if (platform === "youtube") {
      if (YOUTUBE_API_KEY) {
        return await scrapeYouTubeChannelWithApi(profile);
      }
      const [oembed, scraped] = await Promise.allSettled([
        fetchOEmbed(profile.normalizedUrl, "youtube"),
        scrapeYouTubeChannel(profile),
      ]);
      const data = scraped.status === "fulfilled" ? scraped.value : profile;
      return {
        ...data,
        channelName: oembed.status === "fulfilled" && typeof oembed.value.author_name === "string" ? oembed.value.author_name : null,
        error: scraped.status === "rejected" ? scraped.reason instanceof Error ? scraped.reason.message : "YouTube scrape failed" : data.error,
      };
    }

    if (platform === "tiktok") {
      const [oembed, scraped] = await Promise.allSettled([
        fetchOEmbed(profile.normalizedUrl, "tiktok"),
        scrapeTikTokProfile(profile),
      ]);
      const data = scraped.status === "fulfilled" ? scraped.value : profile;
      return {
        ...data,
        authorName: oembed.status === "fulfilled" && typeof oembed.value.author_name === "string" ? oembed.value.author_name : null,
        error: scraped.status === "rejected" ? scraped.reason instanceof Error ? scraped.reason.message : "TikTok scrape failed" : data.error,
      };
    }

    if (platform === "instagram") {
      const scraped = await scrapeInstagramProfile(profile);
      if (scraped.error || scraped.parseError) {
        return unavailableApiProfile(
          profile,
          "instagram-graph-api",
          "Instagram Graph API cannot fetch arbitrary public profile metrics from a URL without authorized account access",
        );
      }
      return scraped;
    }

    if (platform === "x") {
      if (X_BEARER_TOKEN) {
        return await scrapeXProfileWithApi(profile);
      }
      return unavailableApiProfile(profile, "x-api-v2", "X_BEARER_TOKEN or TWITTER_BEARER_TOKEN is not configured");
    }

    if (platform === "linkedin") {
      return unavailableApiProfile(
        profile,
        "linkedin-api",
        "LinkedIn API does not provide public arbitrary profile metrics from a URL without member/organization authorization",
      );
    }

    return genericScrape(profile);
  } catch (err) {
    return {
      ...profile,
      error: err instanceof Error ? err.message : "Profile fetch failed",
    };
  }
}

function nicheToSubreddit(niche: string) {
  const value = niche.toLowerCase();
  if (/(career|job|resume|interview|recruit)/.test(value)) return "careerguidance";
  if (/(art|paint|draw|artist|illustration)/.test(value)) return "Art";
  if (/(design|graphic|creative)/.test(value)) return "design";
  if (/(business|startup|saas|founder|agency|entrepreneur)/.test(value)) return "Entrepreneur";
  if (/(fitness|health|workout)/.test(value)) return "fitness";
  if (/(food|recipe|cooking)/.test(value)) return "Cooking";
  if (/(beauty|fashion|style)/.test(value)) return "femalefashionadvice";
  if (/(travel|lifestyle)/.test(value)) return "travel";
  if (/(music|producer|song)/.test(value)) return "WeAreTheMusicMakers";
  if (/(photo|photography)/.test(value)) return "itookapicture";
  if (/(tech|software|code|developer)/.test(value)) return "technology";
  if (/(youtube|creator|content)/.test(value)) return "NewTubers";
  return "content_marketing";
}

function parseGoogleTrendTitles(xml: string) {
  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/title>/gi)]
    .map((match) => stripTags(match[1] ?? ""))
    .filter(Boolean);
  return [...new Set(titles)].slice(0, 15);
}

function parseYouTubeTrendingTitles(html: string) {
  const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]{5,100})"\}\]/g)]
    .map((match) => decodeHtmlEntities(match[1] ?? ""))
    .filter((title) => title && !title.includes("\\u") && !title.includes("YouTube"))
    .slice(0, 8);
  return [...new Set(titles)];
}

function platformSearchUrl(platform: string, topic: string) {
  const encoded = encodeURIComponent(topic);
  if (platform === "youtube") return `https://www.youtube.com/results?search_query=${encoded}`;
  if (platform === "tiktok") return `https://www.tiktok.com/search?q=${encoded}`;
  if (platform === "instagram") return `https://www.instagram.com/explore/tags/${encoded.replace(/%20/g, "")}/`;
  if (platform === "linkedin") return `https://www.linkedin.com/search/results/content/?keywords=${encoded}`;
  if (platform === "x") return `https://x.com/search?q=${encoded}&src=typed_query&f=top`;
  return `https://www.google.com/search?q=${encoded}`;
}

function fallbackPlatformTrends(platform: string, niche: string, googleTrendItems: string[], redditHot: RedditTrendItem[]): PlatformTrendItem[] {
  const baseTopics = [
    ...googleTrendItems.map((topic) => ({ topic, source: "googleTrends", score: null as number | null })),
    ...redditHot.map((post) => ({ topic: post.title, source: "reddit", score: post.score })),
  ].slice(0, 8);
  const formatByPlatform: Record<string, string> = {
    tiktok: "creator search insight / short-form hook",
    instagram: "viral reel / carousel angle",
    youtube: "trend video / search-led idea",
    linkedin: "viral niche post / expert POV",
    x: "trend hashtag / short POV post",
  };

  return baseTopics.map((item) => ({
    platform,
    topic: item.topic,
    title: `${item.topic} for ${niche || "this niche"}`,
    creator: null,
    url: platformSearchUrl(platform, item.topic),
    source: item.source,
    format: formatByPlatform[platform] ?? "platform-native idea",
    metricSignals: item.score == null ? { score: null } : { score: item.score },
    whyRelevant: "Platform API trend data was unavailable, so this is adapted from cross-platform trend inputs.",
  }));
}

async function fetchYouTubeNicheTrends(niche: string): Promise<PlatformTrendItem[]> {
  const publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const search = await fetchYouTubeApi("search", {
    part: "snippet",
    type: "video",
    q: niche || "creator growth",
    order: "viewCount",
    publishedAfter,
    maxResults: "10",
    regionCode: "US",
  });
  const items = getArray(search.items);
  const videoIds = items
    .map((item) => firstString(getRecord(getRecord(item).id).videoId))
    .filter((id): id is string => Boolean(id));
  const statsById = new Map<string, Record<string, unknown>>();

  if (videoIds.length) {
    const stats = await fetchYouTubeApi("videos", {
      part: "statistics,snippet",
      id: videoIds.join(","),
      maxResults: "10",
    });
    for (const item of getArray(stats.items)) {
      const record = getRecord(item);
      const id = firstString(record.id);
      if (id) statsById.set(id, record);
    }
  }

  return items.map((item) => {
    const record = getRecord(item);
    const snippet = getRecord(record.snippet);
    const videoId = firstString(getRecord(record.id).videoId) ?? "";
    const stats = getRecord(getRecord(statsById.get(videoId)).statistics);
    return {
      platform: "youtube",
      topic: niche || "creator growth",
      title: firstString(snippet.title) ?? "YouTube trend video",
      creator: firstString(snippet.channelTitle),
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : platformSearchUrl("youtube", niche),
      source: "youtube-data-api",
      format: "high-view niche video",
      metricSignals: {
        views: firstString(stats.viewCount),
        likes: firstString(stats.likeCount),
        comments: firstString(stats.commentCount),
      },
      whyRelevant: "YouTube Data API search ordered by view count for this niche.",
    };
  }).slice(0, 10);
}

async function fetchXNicheTrends(niche: string): Promise<PlatformTrendItem[]> {
  const query = `${niche || "creator growth"} lang:en -is:retweet`;
  const data = await fetchXApi("tweets/search/recent", {
    query,
    max_results: "10",
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username,name,public_metrics,verified",
  });
  const users = new Map<string, Record<string, unknown>>();
  for (const user of getArray(getRecord(data.includes).users)) {
    const record = getRecord(user);
    const id = firstString(record.id);
    if (id) users.set(id, record);
  }

  return getArray(data.data).map((tweet) => {
    const record = getRecord(tweet);
    const metrics = getRecord(record.public_metrics);
    const author = users.get(firstString(record.author_id) ?? "") ?? {};
    const username = firstString(author.username);
    const tweetId = firstString(record.id);
    const text = firstString(record.text) ?? "X trend post";
    return {
      platform: "x",
      topic: niche || "creator growth",
      title: text.slice(0, 140),
      creator: username ? `@${username}` : firstString(author.name),
      url: username && tweetId ? `https://x.com/${username}/status/${tweetId}` : platformSearchUrl("x", niche),
      source: "x-api-v2",
      format: "viral recent post / hashtag idea",
      metricSignals: {
        likes: typeof metrics.like_count === "number" ? metrics.like_count : null,
        reposts: typeof metrics.retweet_count === "number" ? metrics.retweet_count : null,
        replies: typeof metrics.reply_count === "number" ? metrics.reply_count : null,
        quotes: typeof metrics.quote_count === "number" ? metrics.quote_count : null,
      },
      whyRelevant: "X recent search API result for this niche, with public engagement metrics.",
    };
  }).sort((a, b) => {
    const aScore = Number(a.metricSignals.likes ?? 0) + Number(a.metricSignals.reposts ?? 0);
    const bScore = Number(b.metricSignals.likes ?? 0) + Number(b.metricSignals.reposts ?? 0);
    return bScore - aScore;
  }).slice(0, 10);
}

async function fetchPlatformTrends(platform: string, niche: string, googleTrendItems: string[], redditHot: RedditTrendItem[]) {
  if (platform === "youtube" && YOUTUBE_API_KEY) return fetchYouTubeNicheTrends(niche);
  if (platform === "x" && X_BEARER_TOKEN) return fetchXNicheTrends(niche);
  return fallbackPlatformTrends(platform, niche, googleTrendItems, redditHot);
}

export async function fetchTrendingTopics(niche: string, _platforms: string[]): Promise<TrendData> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  const query = encodeURIComponent(niche || "creator growth");
  const subreddit = nicheToSubreddit(niche || "");

  const googleTrendsPromise = (async () => {
    try {
      const { response, text } = await fetchText(
        "https://trends.google.com/trending/rss?geo=US",
        "application/rss+xml, application/xml, text/xml",
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseGoogleTrendTitles(text);
    } catch (err) {
      errors.push(`Google Trends: ${err instanceof Error ? err.message : "fetch failed"}`);
      try {
        const { response } = await fetchText(
          `https://trends.google.com/trends/explore?q=${query}&date=now%207-d&geo=US&hl=en-US`,
          "text/html",
        );
        return response.ok ? [`Niche search trend page fetched for: ${niche || "creator growth"}`] : [];
      } catch {
        return [];
      }
    }
  })();

  const redditPromise = (async (): Promise<RedditTrendItem[]> => {
    const { controller, timeout } = withTimeout();
    try {
      const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=10&t=week`, {
        headers: headers("application/json", BOT_USER_AGENT),
        signal: controller.signal,
      });
      const json = getRecord(await response.json());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const children = Array.isArray(getRecord(json.data).children) ? getRecord(json.data).children as unknown[] : [];
      return children.map((post) => {
        const data = getRecord(getRecord(post).data);
        return {
          title: typeof data.title === "string" ? data.title : "",
          score: typeof data.score === "number" ? data.score : 0,
          comments: typeof data.num_comments === "number" ? data.num_comments : 0,
          url: typeof data.permalink === "string" ? `https://reddit.com${data.permalink}` : "https://reddit.com",
        };
      }).filter((post) => post.title);
    } catch (err) {
      errors.push(`Reddit: ${err instanceof Error ? err.message : "fetch failed"}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  })();

  const youtubePromise = (async () => {
    try {
      const { text } = await fetchText(
        "https://www.youtube.com/feed/trending?bp=4gIcGhpzdWJfdGFiX3RvcGljLi9tLzAyMXJ6Z18x",
        "text/html",
      );
      return parseYouTubeTrendingTitles(text);
    } catch (err) {
      errors.push(`YouTube trending: ${err instanceof Error ? err.message : "fetch failed"}`);
      return [];
    }
  })();

  const [googleTrendItems, redditHot, youtubeTrending] = await Promise.all([
    googleTrendsPromise,
    redditPromise,
    youtubePromise,
  ]);
  const platformTrends: Record<string, PlatformTrendItem[]> = {};
  const platformTrendErrors: Record<string, string[]> = {};

  await Promise.all(_platforms.map(async (platform) => {
    try {
      const trends = await fetchPlatformTrends(platform, niche || "creator growth", googleTrendItems, redditHot);
      platformTrends[platform] = trends.slice(0, 10);
      if ((platform === "instagram" || platform === "linkedin" || platform === "tiktok") && trends.every((trend) => trend.source !== `${platform}-api`)) {
        platformTrendErrors[platform] = [
          `${platform} official trend/search API is not configured or does not allow arbitrary niche trend reads in this server context; using cross-platform trend inputs with platform-specific search URLs.`,
        ];
      }
      if (platform === "youtube" && !YOUTUBE_API_KEY) {
        platformTrendErrors[platform] = ["YOUTUBE_API_KEY is not configured; using cross-platform trend inputs for YouTube."];
      }
      if (platform === "x" && !X_BEARER_TOKEN) {
        platformTrendErrors[platform] = ["X_BEARER_TOKEN or TWITTER_BEARER_TOKEN is not configured; using cross-platform trend inputs for X."];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "platform trend fetch failed";
      platformTrendErrors[platform] = [message];
      platformTrends[platform] = fallbackPlatformTrends(platform, niche || "creator growth", googleTrendItems, redditHot).slice(0, 10);
    }
  }));

  return {
    googleTrends: googleTrendItems.length > 0 ? googleTrendItems.join(", ") : null,
    googleTrendItems,
    redditHot,
    youtubeTrending,
    platformTrends,
    platformTrendErrors,
    subreddit,
    fetchedAt,
    errors,
  };
}
