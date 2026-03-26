import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Clock, Calendar, ArrowLeft, ArrowRight, Zap, ChevronDown, ChevronUp } from "lucide-react";
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

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

  const headings = extractHeadings(post.content);
  const contentWithIds = injectIds(post.content);
  const postUrl = `${SITE_URL}/blog/${post.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: post.publishedAt,
    author: { "@type": "Organization", name: "DayTabs" },
    publisher: { "@type": "Organization", name: "DayTabs" },
    description: post.metaDescription,
    url: postUrl,
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Helmet>
        <title>{post.title} — DayTabs Blog</title>
        <meta name="description" content={post.metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={postUrl} />
        <meta name="author" content="DayTabs" />
        <meta property="og:title" content={`${post.title} — DayTabs Blog`} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:image" content={`${SITE_URL}/opengraph.jpg`} />
        <meta property="og:url" content={postUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="DayTabs" />
        <meta property="article:published_time" content={post.publishedAt} />
        <meta property="article:author" content="DayTabs Team" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${post.title} — DayTabs Blog`} />
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

                <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{post.title}</h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-white/40 mb-8 pb-8 border-b border-white/8">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {post.readTime}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formatDate(post.publishedAt)}
                  </span>
                  <span className="text-white/30">by DayTabs Team</span>
                </div>

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
