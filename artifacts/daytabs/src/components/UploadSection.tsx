import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Film, Wand2, Globe, Languages, Settings2 } from "lucide-react";
import { UploadVideoBodyPlatform } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface UploadSectionProps {
  onUpload: (file: File, options: any) => void;
  isUploading: boolean;
}

export function UploadSection({ onUpload, isUploading }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<UploadVideoBodyPlatform>(UploadVideoBodyPlatform.youtube_long);
  const [translateSubtitles, setTranslateSubtitles] = useState(false);
  const [subtitleLanguage, setSubtitleLanguage] = useState("Spanish");
  const [replaceAudio, setReplaceAudio] = useState(false);
  const [audioLanguage, setAudioLanguage] = useState("Spanish");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selected = acceptedFiles[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    maxFiles: 1,
    disabled: isUploading
  });

  const handleAnalyze = () => {
    if (!file) return;
    onUpload(file, {
      platform,
      translateSubtitles,
      subtitleLanguage: translateSubtitles ? subtitleLanguage : undefined,
      replaceAudio,
      audioLanguage: replaceAudio ? audioLanguage : undefined
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto space-y-8"
    >
      <div className="text-center space-y-4 mb-10">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
          Extract <span className="text-gradient">Maximum Value</span><br/> From Every Video
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Upload your video to generate platform-optimized hooks, SEO metadata, studio-quality subtitles, and deep content analysis in minutes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Upload Zone */}
        <div 
          {...getRootProps()} 
          className={`
            relative overflow-hidden group glass-card rounded-3xl p-8 flex flex-col items-center justify-center min-h-[360px] cursor-pointer
            transition-all duration-300 border-2
            ${isDragActive ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-white/10 hover:border-primary/50'}
            ${file ? 'p-2' : ''}
          `}
        >
          <input {...getInputProps()} />
          
          {file && previewUrl ? (
            <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black/50">
              <video 
                src={previewUrl} 
                className="w-full h-full object-cover opacity-60"
                autoPlay 
                loop 
                muted 
                playsInline
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/80 to-transparent">
                <Film className="w-12 h-12 text-white mb-4" />
                <p className="text-white font-semibold text-center truncate max-w-full px-4">{file.name}</p>
                <p className="text-white/70 text-sm mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                <div className="mt-6 px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-xs font-medium text-white shadow-lg">
                  Click or drag to replace
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-2 group-hover:scale-110 group-hover:bg-primary/30 transition-all duration-300">
                <Upload className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Drop your video here</h3>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                Support for MP4, MOV, AVI with plan-based size and duration limits.
              </p>
              <div className="mt-4 px-6 py-2 bg-secondary rounded-full text-sm font-medium text-secondary-foreground">
                Browse Files
              </div>
            </div>
          )}
        </div>

        {/* Configuration Panel */}
        <div className="glass-card rounded-3xl p-8 flex flex-col space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <Settings2 className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Analysis Settings</h2>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-semibold text-foreground mb-1">Target Platform</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: UploadVideoBodyPlatform.youtube_long, label: 'YouTube' },
                { id: UploadVideoBodyPlatform.youtube_shorts, label: 'YT Shorts' },
                { id: UploadVideoBodyPlatform.tiktok, label: 'TikTok' },
                { id: UploadVideoBodyPlatform.instagram, label: 'Instagram' },
                { id: UploadVideoBodyPlatform.linkedin, label: 'LinkedIn' },
                { id: UploadVideoBodyPlatform.x, label: 'X (Twitter)' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); setPlatform(p.id); }}
                  className={`
                    px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left
                    ${platform === p.id 
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 border border-primary' 
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent'}
                  `}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Translate Subtitles</span>
              </div>
              <button 
                onClick={() => setTranslateSubtitles(!translateSubtitles)}
                className={`w-12 h-6 rounded-full transition-colors duration-300 relative ${translateSubtitles ? 'bg-primary' : 'bg-secondary'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-300 ${translateSubtitles ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            
            {translateSubtitles && (
              <select 
                value={subtitleLanguage}
                onChange={(e) => setSubtitleLanguage(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Japanese">Japanese</option>
              </select>
            )}

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-2">
                <Languages className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Replace Audio (AI Dub)</span>
              </div>
              <button 
                onClick={() => setReplaceAudio(!replaceAudio)}
                className={`w-12 h-6 rounded-full transition-colors duration-300 relative ${replaceAudio ? 'bg-primary' : 'bg-secondary'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-300 ${replaceAudio ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {replaceAudio && (
              <select 
                value={audioLanguage}
                onChange={(e) => setAudioLanguage(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Japanese">Japanese</option>
              </select>
            )}
          </div>

          <div className="pt-4 mt-auto">
            <Button 
              onClick={handleAnalyze} 
              disabled={!file || isUploading}
              className="w-full h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary hover:to-purple-400 shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all hover-elevate active-elevate-2"
            >
              {isUploading ? (
                <span className="flex items-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3" />
                  Starting Analysis...
                </span>
              ) : (
                <span className="flex items-center">
                  <Wand2 className="w-5 h-5 mr-2" />
                  Analyze Video
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
