const cancelHandlers = new Map<string, Set<() => void>>();

export function registerAnalysisCancelHandler(jobId: string, handler: () => void) {
  const handlers = cancelHandlers.get(jobId) ?? new Set<() => void>();
  handlers.add(handler);
  cancelHandlers.set(jobId, handlers);

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) cancelHandlers.delete(jobId);
  };
}

export function signalAnalysisCancellation(jobId: string) {
  const handlers = cancelHandlers.get(jobId);
  if (!handlers) return;
  for (const handler of handlers) handler();
}
