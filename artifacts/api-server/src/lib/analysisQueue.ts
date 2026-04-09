import PQueue from "p-queue";

// Only 1 analysis runs at a time. Waiting jobs can be observed via queue status.
export const analysisQueue = new PQueue({ concurrency: 1 });

export function getQueueStatus() {
  return {
    running: analysisQueue.pending,
    waiting: analysisQueue.size,
  };
}
