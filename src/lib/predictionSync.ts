/** A submission invalidates reads started before or during that write. */
export function createPredictionSync() {
  let generation = 0;
  let submitting = false;
  return {
    beginSubmission() { submitting = true; generation++; },
    endSubmission() { submitting = false; generation++; },
    async refresh<T>(load: () => Promise<T>, apply: (value: T) => void, fail: () => void) {
      if (submitting) return;
      const started = generation;
      try {
        const value = await load();
        if (!submitting && started === generation) apply(value);
      } catch {
        if (!submitting && started === generation) fail();
      }
    },
  };
}
