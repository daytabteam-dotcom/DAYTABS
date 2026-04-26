import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Clock, Calendar, ArrowLeft, ArrowRight, Zap, ChevronDown, ChevronUp, Eye, Heart, MessageCircle, Share2, Copy, Check, Image as ImageIcon } from "lucide-react";
import { getPostBySlug, getRelatedPosts, SITE_URL } from "../data/blogPosts";
import Navbar from "../components/Navbar";

const CATEGORY_COLORS: Record<string, string> = {
  "YouTube SEO": "bg-red-500/20 text-red-300 border-red-500/30",
  "Short-Form": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Editing": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "AI Tools": "bg-green-500/20 text-green-300 border-green-500/30",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function extractHeadings(html: string): { id: string; text: string }[] {
  const matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
  return matches.map((m) => {
    const text = m[1].replace(/<[^>]+>/g, "");
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { id, text };
  });
}

function injectIds(html: string): string {
  return html.replace(/<h2([^>]*)>(.*?)<\/h2>/gi, (_match, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
}

function enhanceTables(html: string): string {
  return html
    .replace(/<table>/gi, '<div class="blog-table-wrap"><table class="blog-table">')
    .replace(/<\/table>/gi, "</table></div>");
}

function getOrCreateVisitorId() {
  const key = "daytabs_visitor_id";
  const existing = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  const value = existing ? decodeURIComponent(existing.split("=").slice(1).join("=")) : "";
  if (value) return value;

  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  document.cookie = `${key}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  return id;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("daytabs_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function buildShareLinks(postUrl: string, title: string, description: string) {
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description);
  const encodedUrl = encodeURIComponent(postUrl);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title}\n\n${postUrl}`)}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    copyText: `Short-form or long-form video?\n\n${description}\n\nRead the full guide:\n${postUrl}`,
    nativeText: `${title}\n\n${description}\n\n${postUrl}`,
    description: encodedDescription,
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function elementText(el: Element) {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

type ShareTarget =
  | { kind: "table"; title: string; slug: string; postUrl: string; headers: string[]; rows: string[][] }
  | { kind: "image"; title: string; slug: string; postUrl: string; src: string; alt: string };

async function createShareCard(target: ShareTarget): Promise<{ file: File; dataUrl: string; caption: string }> {
  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0b0b12");
  gradient.addColorStop(1, "#120a1e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Accent blob
  ctx.fillStyle = "rgba(124,58,237,0.22)";
  ctx.beginPath();
  ctx.ellipse(width * 0.76, height * 0.18, 340, 220, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Header
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  drawRoundedRect(ctx, 44, 44, 260, 54, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("DayTabs", 70, 78);

  // Title
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "800 34px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const titleLines = wrapText(ctx, target.title, width - 88);
  const titleMaxLines = 2;
  const shownTitle = titleLines.slice(0, titleMaxLines);
  const titleY = 132;
  shownTitle.forEach((line, index) => {
    ctx.fillText(line, 44, titleY + index * 40);
  });

  const contentTop = 228;
  const contentLeft = 44;
  const contentWidth = width - 88;
  const contentHeight = 320;

  // Content card
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  drawRoundedRect(ctx, contentLeft, contentTop, contentWidth, contentHeight, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (target.kind === "image") {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load image for share card"));
      image.src = target.src;
    });

    const padding = 22;
    const boxX = contentLeft + padding;
    const boxY = contentTop + padding;
    const boxW = contentWidth - padding * 2;
    const boxH = contentHeight - padding * 2;

    const scale = Math.min(boxW / image.width, boxH / image.height);
    const drawW = Math.round(image.width * scale);
    const drawH = Math.round(image.height * scale);
    const drawX = boxX + Math.round((boxW - drawW) / 2);
    const drawY = boxY + Math.round((boxH - drawH) / 2);

    ctx.save();
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 18);
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    const padding = 22;
    const tableX = contentLeft + padding;
    const tableY = contentTop + padding;
    const tableW = contentWidth - padding * 2;
    const tableH = contentHeight - padding * 2;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    drawRoundedRect(ctx, tableX, tableY, tableW, tableH, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const columns = Math.max(1, Math.min(4, target.headers.length || (target.rows[0]?.length ?? 1)));
    const colW = tableW / columns;
    const rowHeight = 38;

    ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    const header = (target.headers.length ? target.headers : Array.from({ length: columns }).map((_, i) => `Col ${i + 1}`)).slice(0, columns);
    header.forEach((cell, i) => {
      ctx.fillText(cell.slice(0, 24), tableX + i * colW + 14, tableY + 26);
    });

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(tableX, tableY + 36);
    ctx.lineTo(tableX + tableW, tableY + 36);
    ctx.stroke();

    ctx.font = "500 15px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const maxRows = Math.floor((tableH - 48) / rowHeight);
    const shownRows = target.rows.slice(0, Math.max(1, Math.min(maxRows, 7)));
    shownRows.forEach((row, rowIndex) => {
      const y = tableY + 36 + rowHeight * (rowIndex + 1);
      row.slice(0, columns).forEach((cell, colIndex) => {
        const text = cell.length > 38 ? `${cell.slice(0, 37)}…` : cell;
        ctx.fillText(text, tableX + colIndex * colW + 14, y - 12);
      });
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tableW, y);
      ctx.stroke();
    });

    if (target.rows.length > shownRows.length) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(`+${target.rows.length - shownRows.length} more rows`, tableX + 14, tableY + tableH - 14);
    }
  }

  // Footer CTA
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("Read the full guide on DayTabs", 44, 584);
  ctx.fillStyle = "rgba(167,139,250,0.95)";
  ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(target.postUrl, 44, 610);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not export image"))), "image/jpeg", 0.92);
  });
  const filename = `daytabs-${target.slug}-${target.kind}.jpg`;
  const file = new File([blob], filename, { type: "image/jpeg" });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const caption = `Useful section from DayTabs:\n\n${target.title}\n\nRead here:\n${target.postUrl}`;

  return { file, dataUrl, caption };
}

function TableOfContentsMobile({ headings }: { headings: { id: string; text: string }[] }) {
  const [open, setOpen] = useState(false);

  if (headings.length === 0) return null;

  return (
    <div className="lg:hidden mb-6">
      <div className="glass rounded-2xl border border-white/8 overflow-hidden">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-white/70 cursor-pointer"
        >
          <span>Table of contents</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {open && (
          <nav className="px-4 pb-4 flex flex-col gap-1 border-t border-white/8 pt-3">
            {headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                onClick={() => setOpen(false)}
                className="text-sm text-white/50 hover:text-violet-300 transition-colors py-1"
              >
                {h.text}
              </a>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const post = getPostBySlug(slug);
  const related = getRelatedPosts(slug);
  const [stats, setStats] = useState<{ viewCount: number; likeCount: number; commentCount: number; likedByMe: boolean } | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [likeWorking, setLikeWorking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState<Array<{ id: number; userId: number; parentCommentId: number | null; content: string; createdAt: string }>>([]);
  const [commentText, setCommentText] = useState("");
  const [commentWorking, setCommentWorking] = useState(false);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [sectionShareOpen, setSectionShareOpen] = useState(false);
  const [sectionShareLoading, setSectionShareLoading] = useState(false);
  const [sectionShareImage, setSectionShareImage] = useState<string | null>(null);
  const [sectionShareFile, setSectionShareFile] = useState<File | null>(null);
  const [sectionShareCaption, setSectionShareCaption] = useState<string>("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const headings = useMemo(
    () => (post ? extractHeadings(post.content) : []),
    [post?.content],
  );
  const contentWithIds = useMemo(
    () => (post ? enhanceTables(injectIds(post.content)) : ""),
    [post?.content],
  );
  const postUrl = post ? `${SITE_URL}/blog/${post.slug}` : "";
  const share = useMemo(
    () => (post ? buildShareLinks(postUrl, post.title, post.metaDescription) : null),
    [post, postUrl],
  );
  const hasAuthToken = typeof window !== "undefined" && Boolean(localStorage.getItem("daytabs_token"));

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post?.title ?? "",
    datePublished: post?.publishedAt ?? "",
    author: { "@type": "Organization", name: "DayTabs" },
    publisher: { "@type": "Organization", name: "DayTabs" },
    description: post?.metaDescription ?? "",
    url: postUrl,
  };

  useEffect(() => {
    if (!post) return;
    setStats(null);
    setEngagementError(null);
    setCommentNotice(null);

    const visitorId = getOrCreateVisitorId();
    void (async () => {
      try {
        const data = await jsonFetch<{
          stats: { viewCount: number; likeCount: number; commentCount: number; likedByMe: boolean };
        }>(`/api/blogs/slug/${post.slug}/view`, {
          method: "POST",
          body: JSON.stringify({
            visitorId,
            blog: {
              title: post.title,
              description: post.metaDescription,
              content: post.content,
              coverImage: null,
            },
          }),
        });
        setStats(data.stats);
      } catch (err) {
        setEngagementError(err instanceof Error ? err.message : "Could not load engagement stats");
      }
    })();

    void (async () => {
      try {
        const data = await jsonFetch<{ comments: Array<{ id: number; userId: number; parentCommentId: number | null; content: string; createdAt: string }> }>(
          `/api/blogs/slug/${post.slug}/comments`,
        );
        setComments(data.comments ?? []);
      } catch {
        setComments([]);
      }
    })();
  }, [post?.slug, post?.title, post?.metaDescription, post?.content]);

  async function toggleLike() {
    if (!post) return;
    if (likeWorking) return;
    setLikeWorking(true);
    setEngagementError(null);
    const visitorId = getOrCreateVisitorId();
    try {
      const data = await jsonFetch<{
        stats: { viewCount: number; likeCount: number; commentCount: number; likedByMe: boolean };
      }>(`/api/blogs/slug/${post.slug}/like`, {
        method: "POST",
        body: JSON.stringify({
          visitorId,
          blog: {
            title: post.title,
            description: post.metaDescription,
            content: post.content,
            coverImage: null,
          },
        }),
      });
      setStats(data.stats);
    } catch (err) {
      setEngagementError(err instanceof Error ? err.message : "Could not toggle like");
    } finally {
      setLikeWorking(false);
    }
  }

  async function copyLink() {
    if (!post) return;
    setCopied(false);
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setEngagementError("Could not copy link");
    }
  }

  async function shareNative() {
    if (!post) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (!nav?.share) return;
      const payload = share ?? buildShareLinks(postUrl, post.title, post.metaDescription);
      await nav.share({ title: post.title, text: payload.nativeText, url: postUrl });
    } catch {
      // user cancelled
    }
  }

  async function submitComment() {
    if (!post) return;
    if (commentWorking) return;
    setCommentWorking(true);
    setEngagementError(null);
    setCommentNotice(null);
    const visitorId = getOrCreateVisitorId();
    try {
      await jsonFetch(`/api/blogs/slug/${post.slug}/comments`, {
        method: "POST",
        body: JSON.stringify({
          visitorId,
          blog: {
            title: post.title,
            description: post.metaDescription,
            content: post.content,
            coverImage: null,
          },
          content: commentText,
        }),
      });
      setCommentText("");
      setCommentNotice("Comment submitted for review.");
    } catch (err) {
      setEngagementError(err instanceof Error ? err.message : "Could not submit comment");
    } finally {
      setCommentWorking(false);
    }
  }

  async function openSectionShare(target: ShareTarget) {
    setSectionShareOpen(true);
    setSectionShareLoading(true);
    setSectionShareImage(null);
    setSectionShareFile(null);
    setSectionShareCaption("");
    setEngagementError(null);
    try {
      const result = await createShareCard(target);
      setSectionShareImage(result.dataUrl);
      setSectionShareFile(result.file);
      setSectionShareCaption(result.caption);
    } catch (err) {
      setEngagementError(err instanceof Error ? err.message : "Could not create share image");
      setSectionShareOpen(false);
    } finally {
      setSectionShareLoading(false);
    }
  }

  useEffect(() => {
    if (!post) return;
    const root = document.querySelector(".prose-content");
    if (!root) return;

    root.querySelectorAll(".blog-share-button").forEach((node) => node.remove());

    const addButton = (wrapper: HTMLElement, target: ShareTarget) => {
      wrapper.classList.add("blog-shareable");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "blog-share-button";
      button.innerText = "Share";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openSectionShare(target);
      });
      wrapper.appendChild(button);
    };

    // Tables
    root.querySelectorAll(".blog-table-wrap").forEach((wrap) => {
      const wrapper = wrap as HTMLElement;
      const table = wrapper.querySelector("table");
      if (!table) return;
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => elementText(th)).filter(Boolean);
      const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => elementText(td)));
      addButton(wrapper, { kind: "table", title: post.title, slug: post.slug, postUrl, headers, rows });
    });

    // Images (wrap)
    root.querySelectorAll("img").forEach((img) => {
      const image = img as HTMLImageElement;
      const src = image.currentSrc || image.src;
      if (!src) return;
      const parent = image.parentElement;
      const wrapper = parent?.classList.contains("blog-image-wrap")
        ? parent
        : (() => {
            const next = document.createElement("div");
            next.className = "blog-image-wrap";
            parent?.insertBefore(next, image);
            next.appendChild(image);
            return next;
          })();
      addButton(wrapper, { kind: "image", title: post.title, slug: post.slug, postUrl, src, alt: image.alt || "" });
    });
  }, [post, postUrl]);

  if (!post) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Post not found</h1>
          <Link href="/blog">
            <button className="px-6 py-3 bg-violet-600 text-white rounded-xl cursor-pointer">
              Back to Blog
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const shareLinks = share ?? buildShareLinks(postUrl, post.title, post.metaDescription);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Helmet>
        <title>{post.title} - DayTabs Blog</title>
        <meta name="description" content={post.metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={postUrl} />
        <meta name="author" content="DayTabs" />
        <meta property="og:title" content={`${post.title} - DayTabs Blog`} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:image" content={`${SITE_URL}/opengraph.jpg`} />
        <meta property="og:url" content={postUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="DayTabs" />
        <meta property="article:published_time" content={post.publishedAt} />
        <meta property="article:author" content="DayTabs Team" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${post.title} - DayTabs Blog`} />
        <meta name="twitter:description" content={post.metaDescription} />
        <meta name="twitter:image" content={`${SITE_URL}/opengraph.jpg`} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      </Helmet>

      <Navbar />

      <div className="pt-28 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <Link href="/blog">
              <button className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors cursor-pointer mb-6">
                <ArrowLeft className="w-4 h-4" />
                Back to Blog
              </button>
            </Link>
          </motion.div>

          <div className="flex gap-12 items-start">
            <motion.article
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex-1 min-w-0"
            >
              <div className="max-w-[680px]">
                <span
                  className={`inline-flex text-xs font-medium px-3 py-1 rounded-full border mb-4 ${
                    CATEGORY_COLORS[post.category] || "bg-white/10 text-white/60 border-white/10"
                  }`}
                >
                  {post.category}
                </span>

                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <h1 className="text-3xl md:text-4xl font-bold leading-tight">{post.title}</h1>
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-white/40 mb-8 pb-8 border-b border-white/8">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {post.readTime}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formatDate(post.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1.5 text-white/45">
                    <Eye className="w-4 h-4" />
                    {stats ? stats.viewCount : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleLike()}
                    disabled={likeWorking}
                    className={`flex items-center gap-1.5 transition-colors cursor-pointer ${stats?.likedByMe ? "text-rose-200 hover:text-rose-100" : "text-white/45 hover:text-white"}`}
                    aria-label="Like"
                  >
                    <Heart className={`w-4 h-4 ${stats?.likedByMe ? "fill-current" : ""}`} />
                    {stats ? stats.likeCount : "—"}
                  </button>
                  <span className="flex items-center gap-1.5 text-white/45">
                    <MessageCircle className="w-4 h-4" />
                    {stats ? stats.commentCount : "—"}
                  </span>
                  <span className="text-white/30">by DayTabs Team</span>
                </div>

                {engagementError ? (
                  <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {engagementError}
                  </div>
                ) : null}

                <div className="h-56 glass rounded-2xl border border-white/8 mb-8 flex items-center justify-center">
                  <div className="text-7xl opacity-15 font-black gradient-text select-none">
                    {post.category.split(" ")[0].toUpperCase()}
                  </div>
                </div>

                <TableOfContentsMobile headings={headings} />

                <div
                  className="prose-content"
                  dangerouslySetInnerHTML={{ __html: contentWithIds }}
                />

                <div className="mt-14 glass rounded-2xl border border-white/8 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm text-white/55">
                      <span className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        {stats ? stats.viewCount : "—"} views
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleLike()}
                        disabled={likeWorking}
                        className={`flex items-center gap-2 transition-colors cursor-pointer ${stats?.likedByMe ? "text-rose-200 hover:text-rose-100" : "text-white/55 hover:text-white"}`}
                      >
                        <Heart className={`w-4 h-4 ${stats?.likedByMe ? "fill-current" : ""}`} />
                        {stats ? stats.likeCount : "—"} likes
                      </button>
                      <span className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        {stats ? stats.commentCount : "—"} comments
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                </div>

                <div className="mt-10 glass rounded-2xl border border-white/8 p-6">
                  <h2 className="text-lg font-semibold mb-2">Comments</h2>
                  <p className="text-sm text-white/50 mb-5">Comments are shown after approval.</p>

                  {commentNotice ? (
                    <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                      {commentNotice}
                    </div>
                  ) : null}

                  {hasAuthToken ? (
                    <div className="space-y-3">
                      <textarea
                        value={commentText}
                        onChange={(event) => setCommentText(event.target.value)}
                        placeholder="Write a comment..."
                        className="w-full min-h-28 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void submitComment()}
                          disabled={commentWorking || !commentText.trim()}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {commentWorking ? "Submitting..." : "Submit comment"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/60">
                      <span className="text-white/80 font-medium">Log in to comment.</span> Your DayTabs session will carry over if you’re already signed in.
                    </div>
                  )}

                  <div className="mt-6 space-y-4">
                    {comments.length ? comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <p className="text-xs text-white/35">User #{comment.userId} · {new Date(comment.createdAt).toLocaleString("en-US")}</p>
                        <p className="mt-2 text-sm text-white/75 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-white/50">No approved comments yet.</p>
                    )}
                  </div>
                </div>

                <div className="mt-16 glass rounded-2xl border border-violet-500/30 p-8 text-center bg-gradient-to-br from-violet-900/20 to-purple-900/10">
                  <h2 className="text-2xl font-bold mb-2">Analyze your next video with DayTabs</h2>
                  <p className="text-white/50 mb-6 max-w-md mx-auto">
                    Get quality scores, SEO titles, and short clip ideas in under 2 minutes.
                  </p>
                  <button
                    onClick={() => navigate("/signup")}
                    className="px-8 py-3 font-semibold bg-gradient-to-r from-violet-600 to-purple-500 text-white rounded-xl hover:from-violet-500 hover:to-purple-400 transition-all shadow-lg shadow-violet-500/30 cursor-pointer"
                  >
                    Try it free →
                  </button>
                </div>
              </div>
            </motion.article>

            {shareOpen ? (
              <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setShareOpen(false)}
                  aria-label="Close share modal"
                />
                <div className="relative w-full max-w-lg glass rounded-2xl border border-white/10 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Share this post</p>
                      <p className="mt-1 text-xs text-white/45 break-words">{postUrl}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShareOpen(false)}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <a
                      href={shareLinks.x}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      Share on X
                    </a>
                    <a
                      href={shareLinks.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      Share on LinkedIn
                    </a>
                    <a
                      href={shareLinks.reddit}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      Share on Reddit
                    </a>
                    <a
                      href={shareLinks.whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      WhatsApp
                    </a>
                    <a
                      href={shareLinks.telegram}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      Telegram
                    </a>
                    {typeof navigator !== "undefined" && "share" in navigator ? (
                      <button
                        type="button"
                        onClick={() => void shareNative()}
                        className="sm:col-span-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 text-sm font-medium text-white hover:from-violet-500 hover:to-purple-400"
                      >
                        <Share2 className="w-4 h-4" />
                        Native share
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {sectionShareOpen ? (
              <div className="fixed inset-0 z-[120] flex items-center justify-center px-6">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setSectionShareOpen(false)}
                  aria-label="Close share image modal"
                />
                <div className="relative w-full max-w-2xl glass rounded-2xl border border-white/10 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Share as image</p>
                      <p className="mt-1 text-xs text-white/45">Dark background, optimized for social (1200×630).</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSectionShareOpen(false)}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5">
                    {sectionShareLoading ? (
                      <div className="flex items-center justify-center h-[320px] rounded-xl border border-dashed border-white/10 text-sm text-white/55">
                        Creating image...
                      </div>
                    ) : sectionShareImage ? (
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <img src={sectionShareImage} alt="Share card preview" className="w-full object-cover" />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!sectionShareCaption) return;
                        try {
                          await navigator.clipboard.writeText(sectionShareCaption);
                        } catch {
                          setEngagementError("Could not copy caption");
                        }
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                      disabled={!sectionShareCaption}
                    >
                      <Copy className="w-4 h-4" />
                      Copy caption
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!sectionShareFile || !sectionShareImage) return;
                        const a = document.createElement("a");
                        a.href = sectionShareImage;
                        a.download = sectionShareFile.name;
                        a.click();
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 text-sm font-medium text-white hover:from-violet-500 hover:to-purple-400 disabled:opacity-50"
                      disabled={!sectionShareImage || !sectionShareFile}
                    >
                      <ImageIcon className="w-4 h-4" />
                      Download image
                    </button>

                    {sectionShareFile && typeof navigator !== "undefined" && "canShare" in navigator && "share" in navigator ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const nav = navigator as any;
                            if (!nav?.canShare?.({ files: [sectionShareFile] })) return;
                            await nav.share({ files: [sectionShareFile], text: sectionShareCaption, title: post.title });
                          } catch {
                            // cancelled
                          }
                        }}
                        className="sm:col-span-2 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Share2 className="w-4 h-4" />
                        Native share (with image)
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <a
                      href={shareLinks.x}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      X
                    </a>
                    <a
                      href={shareLinks.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      LinkedIn
                    </a>
                    <a
                      href={shareLinks.reddit}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Share2 className="w-4 h-4" />
                      Reddit
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="hidden lg:block sticky top-28 self-start w-64 shrink-0">
              {headings.length > 0 && (
                <div className="glass rounded-2xl border border-white/8 p-5">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">On this page</p>
                  <nav className="flex flex-col gap-1">
                    {headings.map((h) => (
                      <a
                        key={h.id}
                        href={`#${h.id}`}
                        className="text-sm text-white/50 hover:text-violet-300 transition-colors py-1 leading-tight"
                      >
                        {h.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}
            </div>
          </div>

          {related.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-20 max-w-[680px]"
            >
              <h2 className="text-xl font-bold mb-6">Related articles</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {related.map((rp) => (
                  <Link key={rp.slug} href={`/blog/${rp.slug}`}>
                    <div className="glass rounded-xl border border-white/8 p-5 hover:border-violet-500/30 transition-all cursor-pointer group">
                      <span
                        className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border mb-2 ${
                          CATEGORY_COLORS[rp.category] || "bg-white/10 text-white/60 border-white/10"
                        }`}
                      >
                        {rp.category}
                      </span>
                      <h3 className="text-sm font-semibold leading-snug group-hover:text-violet-300 transition-colors mb-2">
                        {rp.title}
                      </h3>
                      <span className="text-xs text-violet-400 flex items-center gap-1">
                        Read article <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-white/60">DayTabs</span>
          </div>
          <p>© {new Date().getFullYear()} DayTabs. All rights reserved.</p>
          <div className="flex gap-6">
            <button onClick={() => navigate("/pricing")} className="hover:text-white transition-colors cursor-pointer">Pricing</button>
            <button onClick={() => navigate("/contact")} className="hover:text-white transition-colors cursor-pointer">Contact</button>
            <button onClick={() => navigate("/privacy")} className="hover:text-white transition-colors cursor-pointer">Privacy</button>
            <button onClick={() => navigate("/terms")} className="hover:text-white transition-colors cursor-pointer">Terms</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
