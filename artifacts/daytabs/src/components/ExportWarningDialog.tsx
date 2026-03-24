import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, FileDown, ArrowRight, X } from "lucide-react";

interface ExportWarningDialogProps {
  open: boolean;
  isExporting: boolean;
  onExportAndSwitch: () => void;
  onSwitchAnyway: () => void;
  onCancel: () => void;
}

export function ExportWarningDialog({
  open,
  isExporting,
  onExportAndSwitch,
  onSwitchAnyway,
  onCancel,
}: ExportWarningDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-md bg-[#130d2b] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-6 space-y-5"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Unsaved Analysis Data</h3>
                <p className="text-sm text-white/50 mt-1 leading-relaxed">
                  You have generated analysis results in this tab. Switching tabs will clear them, as this data is not saved automatically.
                </p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4 space-y-2.5">
              <button
                onClick={onExportAndSwitch}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-all shadow-lg shadow-primary/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Exporting PDF…
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    Export PDF &amp; Switch Tab
                  </>
                )}
              </button>

              <button
                onClick={onSwitchAnyway}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium text-sm transition-all border border-white/8"
              >
                <ArrowRight className="w-4 h-4" />
                Switch Without Exporting
              </button>

              <button
                onClick={onCancel}
                className="w-full py-2.5 px-4 rounded-xl text-white/40 hover:text-white/60 font-medium text-sm transition-colors"
              >
                Stay Here
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
