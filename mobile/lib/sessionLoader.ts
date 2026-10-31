/** Restore stored sign-in without treating a timeout as a signed-out result. */
export function createSessionLoader<T>(options: {
  load: () => Promise<{ data: { session: T | null }; error: unknown }>;
  loading: () => void;
  ready: (session: T | null) => void;
  failed: (message: string) => void;
  timeoutMs?: number;
}) {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    generation++;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function start() {
    cancel();
    const attempt = generation;
    options.loading();
    // The request may still resolve later; ignore it after timeout or retry.
    timer = setTimeout(() => {
      if (attempt !== generation) return;
      cancel();
      options.failed("Checking your sign-in is taking too long. Check your connection and try again.");
    }, options.timeoutMs ?? 12000);
    void Promise.resolve().then(options.load).then(({ data, error }) => {
      if (attempt !== generation) return;
      cancel();
      if (error) options.failed("We couldn't restore your sign-in. Check your internet connection and try again.");
      else options.ready(data.session);
    }).catch(() => {
      if (attempt !== generation) return;
      cancel();
      options.failed("We couldn't restore your sign-in. Check your internet connection and try again.");
    });
  }
  return { start, cancel };
}
