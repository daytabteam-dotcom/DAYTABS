const FETCH_TIMEOUT_MS = 7000;
const USER_AGENT = "DayTabs growth-planner/1.0 (+https://daytabs.com)";

export interface PublicProfileData {
  platform: string;
  url: string;
  rawHtml: string;
  metaDescription: string | null;
  possibleFollowerCount: string | null;
  possiblePostCount: string | null;
  fetchedAt: string;
  error?: string;
}

export interface TrendData {
  googleTrends: string | null;
  redditHot: unknown | null;
  subreddit: string;
  fetchedAt: string;
  errors: string[];
}

function withTimeout(ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

function stripTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaDescription(html: string) {
  const match = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["'][^>]*>/i);
  return match?.[1] ? stripTags(match[1]) : null;
}

function extractCount(html: string, labels: string[]) {
  const text = stripTags(html).slice(0, 6000);
  for (const label of labels) {
    const afterCount = new RegExp(`([\\d,.]+\\s*[kKmMbB]?)\\s+${label}`, "i").exec(text);
    if (afterCount?.[1]) return afterCount[1];

    const beforeCount = new RegExp(`${label}\\s*[:\\-]?\\s*([\\d,.]+\\s*[kKmMbB]?)`, "i").exec(text);
    if (beforeCount?.[1]) return beforeCount[1];
  }
  return null;
}

export async function scrapePublicProfile(url: string, platform: string): Promise<PublicProfileData> {
  const fetchedAt = new Date().toISOString();
  const { controller, timeout } = withTimeout();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    const html = await response.text();
    const rawHtml = html.slice(0, 3000);
    return {
      platform,
      url,
      rawHtml,
      metaDescription: extractMetaDescription(html),
      possibleFollowerCount: extractCount(html, ["followers", "follower", "subscribers", "connections"]),
      possiblePostCount: extractCount(html, ["posts", "videos", "tweets", "articles"]),
      fetchedAt,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      platform,
      url,
      rawHtml: "",
      metaDescription: null,
      possibleFollowerCount: null,
      possiblePostCount: null,
      fetchedAt,
      error: err instanceof Error ? err.message : "Profile fetch failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function nicheToSubreddit(niche: string) {
  const value = niche.toLowerCase();
  if (/(career|job|resume|interview|recruit)/.test(value)) return "careerguidance";
  if (/(art|artist|design|illustration|creative)/.test(value)) return "design";
  if (/(business|startup|saas|founder|agency)/.test(value)) return "Entrepreneur";
  if (/(fitness|health|workout)/.test(value)) return "fitness";
  if (/(food|recipe|cooking)/.test(value)) return "Cooking";
  if (/(beauty|fashion|style)/.test(value)) return "femalefashionadvice";
  if (/(travel|lifestyle)/.test(value)) return "travel";
  if (/(youtube|creator|content)/.test(value)) return "NewTubers";
  return "socialmedia";
}

export async function fetchTrendingTopics(niche: string, _platforms: string[]): Promise<TrendData> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  const query = encodeURIComponent(niche || "creator growth");
  const subreddit = nicheToSubreddit(niche || "");

  const googleTrendsPromise = (async () => {
    const { controller, timeout } = withTimeout();
    try {
      const response = await fetch(
        `https://trends.google.com/trends/trendingsearches/daily/rss?geo=US&q=${query}`,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml,text/xml" }, signal: controller.signal },
      );
      const text = await response.text();
      if (!response.ok) errors.push(`Google Trends HTTP ${response.status}`);
      return text.slice(0, 2000);
    } catch (err) {
      errors.push(`Google Trends: ${err instanceof Error ? err.message : "fetch failed"}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  const redditPromise = (async () => {
    const { controller, timeout } = withTimeout();
    try {
      const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=10`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok) errors.push(`Reddit HTTP ${response.status}`);
      return json;
    } catch (err) {
      errors.push(`Reddit: ${err instanceof Error ? err.message : "fetch failed"}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  const [googleTrends, redditHot] = await Promise.all([googleTrendsPromise, redditPromise]);
  return { googleTrends, redditHot, subreddit, fetchedAt, errors };
}
