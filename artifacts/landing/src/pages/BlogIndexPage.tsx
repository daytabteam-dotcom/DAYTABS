import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Clock, Calendar, ArrowRight, Zap } from "lucide-react";
import { blogPosts } from "../data/blogPosts";
import Navbar from "../components/Navbar";

const CATEGORIES = ["All", "YouTube SEO", "Short-Form", "Editing", "AI Tools"];

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

export default function BlogIndexPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [, navigate] = useLocation();

  const filtered =
    activeCategory === "All"
      ? blogPosts
      : blogPosts.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Helmet>
        <title>DayTabs Blog — Video Strategy, SEO &amp; Creator Tips</title>
        <meta
          name="description"
          content="Actionable guides for content creators on YouTube SEO, video editing, short-form content strategy, and growing your channel with AI tools."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://daytabs.com/blog" />
        <meta name="author" content="DayTabs" />
        <meta property="og:title" content="DayTabs Blog — Video Strategy, SEO &amp; Creator Tips" />
        <meta
          property="og:description"
          content="Actionable guides for content creators on YouTube SEO, video editing, short-form content strategy, and growing your channel with AI tools."
        />
        <meta property="og:image" content="https://daytabs.com/opengraph.jpg" />
        <meta property="og:url" content="https://daytabs.com/blog" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="DayTabs" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="DayTabs Blog — Video Strategy, SEO &amp; Creator Tips" />
        <meta
          name="twitter:description"
          content="Actionable guides for content creators on YouTube SEO, video editing, short-form content strategy, and growing your channel with AI tools."
        />
        <meta name="twitter:image" content="https://daytabs.com/opengraph.jpg" />
      </Helmet>

      <Navbar />

      <div className="pt-28 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-violet-300 mb-6 border border-violet-500/20">
              <Zap className="w-4 h-4" />
              Creator Playbook
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              Creator <span className="gradient-text">Playbook</span>
            </h1>
            <p className="text-xl text-white/50 max-w-xl mx-auto">
              Guides on video SEO, editing strategy, and growing your channel with AI
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-wrap gap-2 justify-center mb-12"
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all cursor-pointer ${
                  activeCategory === cat
                    ? "bg-violet-600 text-white border-violet-500"
                    : "glass text-white/60 border-white/10 hover:border-violet-500/40 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {filtered.map((post, i) => (
              <motion.article
                key={post.slug}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <Link href={`/blog/${post.slug}`}>
                  <div className="glass rounded-2xl border border-white/8 card-glow transition-all hover:border-violet-500/30 cursor-pointer h-full flex flex-col overflow-hidden group">
                    <div className="h-48 bg-gradient-to-br from-violet-900/40 to-purple-900/20 flex items-center justify-center border-b border-white/5">
                      <div className="text-6xl opacity-20 font-black gradient-text select-none">
                        {post.category.split(" ")[0].toUpperCase()}
                      </div>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <span
                        className={`inline-flex self-start text-xs font-medium px-3 py-1 rounded-full border mb-3 ${
                          CATEGORY_COLORS[post.category] || "bg-white/10 text-white/60 border-white/10"
                        }`}
                      >
                        {post.category}
                      </span>
                      <h2 className="text-lg font-bold mb-3 group-hover:text-violet-300 transition-colors leading-snug">
                        {post.title}
                      </h2>
                      <p className="text-sm text-white/50 leading-relaxed mb-4 flex-1">{post.excerpt}</p>
                      <div className="flex items-center justify-between text-xs text-white/30 mt-auto pt-4 border-t border-white/5">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {post.readTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(post.publishedAt)}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-violet-400 group-hover:gap-2 transition-all">
                          Read article <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
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
