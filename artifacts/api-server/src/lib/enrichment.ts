const FETCH_TIMEOUT_MS = 7000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BOT_USER_AGENT = "DayTabs growth-planner-bot/1.0 (+https://daytabs.com)";

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
  bio?: string | null;
  description?: string | null;
  ogTitle?: string | null;
  fetchedAt: string;
  error?: string | null;
}

export interface RedditTrendItem {
  title: string;
  score: number;
  comments: number;
  url: string;
}

export interface TrendData {
  googleTrends: string | null;
  googleTrendItems: string[];
  redditHot: RedditTrendItem[];
  youtubeTrending: string[];
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

async function scrapeYouTubeChannel(profile: PublicProfileData) {
  const { response, text } = await fetchText(profile.normalizedUrl);
  const htmlData = mergeHtmlProfile(profile, text, response.ok, response.status);
  const subscriberMatch = text.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/);
  const videoCountMatch = text.match(/"videosCountText":\{"runs":\[\{"text":"([^"]+)"/);
  const descMatch = text.match(/"description":\{"simpleText":"([^"]{0,300})/);

  return {
    ...htmlData,
    subscriberCount: subscriberMatch?.[1] ?? htmlData.possibleFollowerCount,
    videoCount: videoCountMatch?.[1] ?? htmlData.possiblePostCount,
    description: descMatch?.[1] ? decodeHtmlEntities(descMatch[1]) : htmlData.metaDescription,
  };
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
    const { response, json } = await fetchJson(
      `https://www.instagram.com/${profile.username}/?__a=1&__d=dis`,
      "application/json",
      { "x-ig-app-id": "936619743392459" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const root = getRecord(json);
    const user = getRecord(getRecord(root.graphql).user ?? getRecord(root.data).user);
    const followedBy = getRecord(user.edge_followed_by);
    const follows = getRecord(user.edge_follow);
    const timeline = getRecord(user.edge_owner_to_timeline_media);

    return {
      ...profile,
      followerCount: typeof followedBy.count === "number" ? followedBy.count : null,
      followingCount: typeof follows.count === "number" ? follows.count : null,
      postCount: typeof timeline.count === "number" ? timeline.count : null,
      bio: typeof user.biography === "string" ? user.biography : null,
      fullName: typeof user.full_name === "string" ? user.full_name : null,
      error: null,
    };
  } catch {
    return genericScrape(profile);
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
      return scrapeInstagramProfile(profile);
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

  return {
    googleTrends: googleTrendItems.length > 0 ? googleTrendItems.join(", ") : null,
    googleTrendItems,
    redditHot,
    youtubeTrending,
    subreddit,
    fetchedAt,
    errors,
  };
}
