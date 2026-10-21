/** Saving or changing the editor scope invalidates reads started before or during that operation. */
export function createPredictionSync() {
  let generation = 0;
  let busy = false;
  return {
    beginOperation() { busy = true; generation++; },
    endOperation() { busy = false; generation++; },
    async refresh<T>(load: () => Promise<T>, apply: (value: T) => void, fail: () => void) {
      if (busy) return;
      const started = generation;
      try {
        const value = await load();
        if (!busy && started === generation) apply(value);
      } catch {
        if (!busy && started === generation) fail();
      }
    },
  };
}
