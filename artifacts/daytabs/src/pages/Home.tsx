import React, { useState } from "react";
import { useUploadVideoWithFile, useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { UploadSection } from "@/components/UploadSection";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { ResultsContainer } from "@/components/results/ResultsContainer";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";

export default function Home() {
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [replaceAudio, setReplaceAudio] = useState(false);

  const uploadMutation = useUploadVideoWithFile();
  const { data: statusData, error: statusError } = useAnalysisPolling(jobId);
  
  const isComplete = statusData?.status === "complete";
  const { data: resultsData, isLoading: isLoadingResults } = useAnalysisResults(jobId, isComplete);

  const handleUpload = (file: File, options: any) => {
    setReplaceAudio(!!options.replaceAudio);
    uploadMutation.mutate({ file, options }, {
      onSuccess: (data) => {
        setJobId(data.jobId);
        toast({
          title: "Upload Successful",
          description: "Starting analysis pipeline...",
        });
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: err.message,
        });
      }
    });
  };

  const handleReset = () => {
    setJobId(null);
    uploadMutation.reset();
  };

  // Determine what state to show
  const showUpload = !jobId;
  const showProgress = jobId && !isComplete && statusData?.status !== "error";
  const showError = statusData?.status === "error" || statusError;
  const showResults = isComplete && resultsData;

  return (
    <div className="min-h-screen relative overflow-x-hidden selection:bg-primary/30">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="Background" 
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full" />
      </div>

      {/* Header */}
      <header className="w-full border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleReset}>
            <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="DayTabs" className="w-10 h-10 object-contain rounded-lg drop-shadow-[0_0_15px_rgba(124,58,237,0.5)]" />
            <span className="text-2xl font-display font-bold tracking-tight text-white">Day<span className="text-primary">Tabs</span></span>
          </div>
          {jobId && (
            <button 
              onClick={handleReset}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              Analyze New Video
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 relative z-10">
        {showUpload && (
          <UploadSection 
            onUpload={handleUpload} 
            isUploading={uploadMutation.isPending} 
          />
        )}

        {showProgress && statusData && (
          <ProgressIndicator 
            currentStep={statusData.status}
            progress={statusData.progress} 
          />
        )}

        {showError && (
          <div className="w-full max-w-2xl mx-auto glass-card rounded-3xl p-10 text-center space-y-6">
            <div className="w-20 h-20 bg-destructive/20 text-destructive rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold">Analysis Failed</h2>
            <p className="text-muted-foreground text-lg">
              {statusData?.error || "An unexpected error occurred during the analysis pipeline. Please try again."}
            </p>
            <button 
              onClick={handleReset}
              className="px-8 py-3 bg-secondary hover:bg-secondary/80 text-white rounded-xl font-semibold transition-colors mt-4"
            >
              Start Over
            </button>
          </div>
        )}

        {isComplete && isLoadingResults && !resultsData && (
          <div className="w-full flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground font-medium animate-pulse">Loading final results...</p>
          </div>
        )}

        {showResults && <ResultsContainer data={resultsData} replaceAudio={replaceAudio} />}
      </main>
    </div>
  );
}
