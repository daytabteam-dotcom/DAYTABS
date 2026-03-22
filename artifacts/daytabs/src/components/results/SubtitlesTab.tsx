import React, { useState } from "react";
import { SubtitlesResult, ExportRequestResolution, ExportRequestAudioVoice } from "@workspace/api-client-react";
import { Mic, Download, Settings2, Loader2, CheckCircle2, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { useExportVideo } from "@/hooks/use-analysis";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface SubtitlesTabProps {
  jobId: string;
  data: SubtitlesResult;
  replaceAudio?: boolean;
}

const VOICES: { id: ExportRequestAudioVoice; label: string; description: string }[] = [
  { id: "alloy",   label: "Alloy",   description: "Balanced & neutral" },
  { id: "echo",    label: "Echo",    description: "Soft & conversational" },
  { id: "fable",   label: "Fable",   description: "Warm & expressive" },
  { id: "onyx",    label: "Onyx",    description: "Deep & authoritative" },
  { id: "nova",    label: "Nova",    description: "Bright & energetic" },
  { id: "shimmer", label: "Shimmer", description: "Clear & friendly" },
];

export function SubtitlesTab({ jobId, data, replaceAudio }: SubtitlesTabProps) {
  const { toast } = useToast();
  const exportMutation = useExportVideo();

  const [resolution, setResolution] = useState<ExportRequestResolution>(ExportRequestResolution["1080p"]);
  const [removeFiller, setRemoveFiller] = useState(false);
  const [includeSubs, setIncludeSubs] = useState(true);
  const [audioVoice, setAudioVoice] = useState<ExportRequestAudioVoice>("alloy");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleExport = () => {
    exportMutation.mutate(
      {
        jobId,
        data: {
          resolution,
          removeFillerWords: removeFiller,
          includeSubtitles: includeSubs,
          ...(replaceAudio && { audioVoice }),
        }
      },
      {
        onSuccess: (res) => {
          setDownloadUrl(res.downloadUrl);
          toast({ title: "Export Ready", description: "Your video is ready to download." });
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Export Failed", description: err.message });
        }
      }
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Transcript */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:col-span-2 glass-card rounded-3xl flex flex-col h-[700px] overflow-hidden"
      >
        <div className="p-6 border-b border-border bg-background/50 flex items-center gap-3">
          <Mic className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold">Generated Transcript</h3>
          {data.translatedLanguage && (
            <span className="ml-auto px-3 py-1 bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider rounded-full">
              Translated to {data.translatedLanguage}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {(data.translatedTranscript || data.transcript).map((seg, i) => (
            <div key={i} className="flex gap-4 group">
              <div className="font-mono text-xs font-semibold text-muted-foreground w-16 shrink-0 pt-1 group-hover:text-primary transition-colors">
                {formatTime(seg.start)}
              </div>
              <p className="text-foreground/90 text-lg leading-relaxed group-hover:text-white transition-colors">
                {seg.text}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Export Options */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-card rounded-3xl p-6 h-fit sticky top-6"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-primary/20 rounded-xl">
            <Settings2 className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-bold">Export Video</h3>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
              Resolution
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ExportRequestResolution)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:border-primary/50"
            >
              <option value="4k">4K Ultra HD</option>
              <option value="1080p">1080p Full HD</option>
              <option value="720p">720p HD</option>
              <option value="480p">480p SD</option>
              <option value="240p">240p Low</option>
            </select>
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center w-6 h-6 rounded-md border-2 border-border bg-background group-hover:border-primary transition-colors">
                <input
                  type="checkbox"
                  checked={includeSubs}
                  onChange={(e) => setIncludeSubs(e.target.checked)}
                  className="peer sr-only"
                />
                <div className={`absolute inset-0 bg-primary rounded-sm transition-transform scale-0 ${includeSubs ? 'scale-100' : ''}`} />
                <CheckCircle2 className={`w-4 h-4 text-white absolute inset-0 m-auto transition-opacity opacity-0 ${includeSubs ? 'opacity-100' : ''}`} />
              </div>
              <span className="font-medium">Burn-in Subtitles</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center w-6 h-6 rounded-md border-2 border-border bg-background group-hover:border-primary transition-colors">
                <input
                  type="checkbox"
                  checked={removeFiller}
                  onChange={(e) => setRemoveFiller(e.target.checked)}
                  className="peer sr-only"
                />
                <div className={`absolute inset-0 bg-primary rounded-sm transition-transform scale-0 ${removeFiller ? 'scale-100' : ''}`} />
                <CheckCircle2 className={`w-4 h-4 text-white absolute inset-0 m-auto transition-opacity opacity-0 ${removeFiller ? 'opacity-100' : ''}`} />
              </div>
              <span className="font-medium">AI Remove Filler Words</span>
            </label>
          </div>

          {replaceAudio && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <Volume2 className="w-4 h-4 text-primary" />
                <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  AI Speaker Voice
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setAudioVoice(v.id)}
                    className={`
                      px-3 py-2.5 rounded-xl text-left transition-all duration-200 border
                      ${audioVoice === v.id
                        ? 'bg-primary/20 border-primary text-white shadow-sm shadow-primary/20'
                        : 'bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-white'}
                    `}
                  >
                    <div className="text-sm font-semibold">{v.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{v.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download
                className="w-full flex items-center justify-center gap-2 h-14 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl shadow-lg shadow-green-500/25 transition-all hover:-translate-y-1 active:translate-y-0"
              >
                <Download className="w-5 h-5" />
                Download Final Video
              </a>
            ) : (
              <Button
                onClick={handleExport}
                disabled={exportMutation.isPending}
                className="w-full h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-primary to-purple-500 shadow-lg shadow-primary/25 hover-elevate active-elevate-2"
              >
                {exportMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Rendering...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download className="w-5 h-5" /> Start Export
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
