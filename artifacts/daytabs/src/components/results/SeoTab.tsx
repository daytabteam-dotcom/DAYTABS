import React from "react";
import { SeoResult } from "@workspace/api-client-react";
import { Copy, Hash, Clock, AlignLeft, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export function SeoTab({ data }: { data: SeoResult }) {
  const { toast } = useToast();

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard.`,
    });
  };

  const copyAllTimestamps = () => {
    const text = data.timestamps.map(t => `${t.time} - ${t.label}`).join('\n');
    handleCopy(text, 'Timestamps');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      <div className="lg:col-span-2 space-y-8">
        {/* Titles */}
        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
            <AlignLeft className="w-5 h-5 text-primary" />
            Optimized Titles
          </h3>
          <div className="space-y-4">
            {data.titles.map((title, i) => (
              <div key={i} className="flex group bg-background border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-colors">
                <div className="flex-1 p-4 font-medium text-lg">{title}</div>
                <button 
                  onClick={() => handleCopy(title, 'Title')}
                  className="px-4 bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center border-l border-border group-hover:border-primary/50"
                  aria-label="Copy title"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="glass-card rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <AlignLeft className="w-5 h-5 text-primary" />
              SEO Description
            </h3>
            <button 
              onClick={() => handleCopy(data.description, 'Description')}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors bg-primary/10 px-3 py-1.5 rounded-lg"
            >
              <Copy className="w-4 h-4" /> Copy All
            </button>
          </div>
          <div className="bg-background border border-border rounded-xl p-5 text-foreground/90 whitespace-pre-wrap leading-relaxed font-medium">
            {data.description}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Hashtags */}
        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
            <Hash className="w-5 h-5 text-primary" />
            Hashtags
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.hashtags.map((ht, i) => (
              <div 
                key={i} 
                className="group relative px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm font-medium cursor-help hover:border-primary/50 transition-colors"
              >
                #{ht.tag}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-popover border border-border text-popover-foreground text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
                  <div className="flex items-center gap-1 mb-1 font-bold text-primary">
                    <TrendingUp className="w-3 h-3" /> Impact
                  </div>
                  {ht.effect}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timestamps */}
        <div className="glass-card rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Timestamps
            </h3>
            <button 
              onClick={copyAllTimestamps}
              className="text-primary hover:bg-primary/10 p-1.5 rounded-md transition-colors"
              aria-label="Copy timestamps"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {data.timestamps.map((ts, i) => (
              <div key={i} className="flex items-center gap-3 p-2 hover:bg-secondary/50 rounded-lg transition-colors">
                <span className="font-mono text-primary font-bold bg-primary/10 px-2 py-1 rounded text-sm shrink-0">
                  {ts.time}
                </span>
                <span className="text-sm font-medium">{ts.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
