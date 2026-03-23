import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Film } from "lucide-react";

interface TabUploadProps {
  onFile: (file: File) => void;
  isUploading: boolean;
  file: File | null;
}

export function TabUpload({ onFile, isUploading, file }: TabUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      const f = accepted[0];
      setPreviewUrl(URL.createObjectURL(f));
      onFile(f);
    }
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".webm"] },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative overflow-hidden group glass-card rounded-2xl flex flex-col items-center justify-center min-h-[220px] cursor-pointer transition-all duration-300 border-2 ${
        isDragActive ? "border-primary bg-primary/10 scale-[1.01]" : "border-white/10 hover:border-primary/50"
      } ${file ? "p-2" : "p-8"}`}
    >
      <input {...getInputProps()} />
      {file && previewUrl ? (
        <div className="relative w-full h-full min-h-[200px] rounded-xl overflow-hidden bg-black/50">
          <video src={previewUrl} className="w-full h-full object-cover opacity-50" autoPlay loop muted playsInline />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/80 to-transparent">
            <Film className="w-10 h-10 text-white mb-3" />
            <p className="text-white font-semibold text-center truncate max-w-full px-4 text-sm">{file.name}</p>
            <p className="text-white/60 text-xs mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            <div className="mt-4 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-xs font-medium text-white">
              Click or drag to replace
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/30 transition-all duration-300">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <p className="text-base font-bold text-foreground">Drop your video here</p>
          <p className="text-xs text-muted-foreground">MP4, MOV, AVI, WebM · up to 2 GB</p>
          <div className="px-5 py-2 bg-secondary rounded-full text-sm font-medium text-secondary-foreground">
            Browse Files
          </div>
        </div>
      )}
    </div>
  );
}
