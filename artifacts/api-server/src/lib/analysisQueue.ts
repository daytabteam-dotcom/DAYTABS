import PQueue from "p-queue";

function readQueueConcurrency() {
  const raw = Number(process.env.ANALYSIS_QUEUE_CONCURRENCY ?? "2");
  if (!Number.isFinite(raw) || raw < 1) return 2;
  return Math.max(1, Math.min(8, Math.floor(raw)));
}

interface QueuedAnalysisJob {
  jobId: string;
  priority: number;
  sequence: number;
}

const waitingJobs: QueuedAnalysisJob[] = [];
const runningJobIds = new Set<string>();
let enqueueSequence = 0;
export const analysisQueueConcurrency = readQueueConcurrency();

// Run more than one analysis at a time by default, while keeping it easy to tune
// down on smaller Render instances.
export const analysisQueue = new PQueue({ concurrency: analysisQueueConcurrency });

function removeWaitingJob(jobId: string) {
  const index = waitingJobs.findIndex((job) => job.jobId === jobId);
  if (index >= 0) waitingJobs.splice(index, 1);
}

export function forgetQueuedJob(jobId: string) {
  removeWaitingJob(jobId);
  runningJobIds.delete(jobId);
}

function getPlanPriority(plan?: string | null) {
  switch ((plan ?? "free").toLowerCase()) {
    case "studio":
    case "professional":
      return 30;
    case "pro":
      return 20;
    case "creator":
    case "premium":
      return 10;
    default:
      return 0;
  }
}

function addWaitingJob(jobId: string, priority: number) {
  const waitingJob = { jobId, priority, sequence: enqueueSequence++ };
  waitingJobs.push(waitingJob);
  waitingJobs.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
}

export function enqueueAnalysisJob<T>(jobId: string, task: () => Promise<T>, plan?: string | null) {
  const priority = getPlanPriority(plan);
  addWaitingJob(jobId, priority);

  return analysisQueue.add(async () => {
    removeWaitingJob(jobId);
    runningJobIds.add(jobId);

    try {
      return await task();
    } finally {
      runningJobIds.delete(jobId);
    }
  }, { priority });
}

export function getQueueStatus() {
  return {
    running: analysisQueue.pending,
    waiting: analysisQueue.size,
    concurrency: analysisQueueConcurrency,
  };
}

export function getJobQueueStatus(jobId: string) {
  if (runningJobIds.has(jobId)) {
    return {
      state: "running" as const,
      position: 0,
      ahead: 0,
      running: analysisQueue.pending,
      waiting: analysisQueue.size,
      concurrency: analysisQueueConcurrency,
    };
  }

  const waitingIndex = waitingJobs.findIndex((job) => job.jobId === jobId);
  if (waitingIndex >= 0) {
    return {
      state: "waiting" as const,
      position: waitingIndex + 1,
      ahead: waitingIndex,
      running: analysisQueue.pending,
      waiting: analysisQueue.size,
      concurrency: analysisQueueConcurrency,
    };
  }

  return {
    state: "unknown" as const,
    position: null,
    ahead: null,
    running: analysisQueue.pending,
    waiting: analysisQueue.size,
    concurrency: analysisQueueConcurrency,
  };
}
