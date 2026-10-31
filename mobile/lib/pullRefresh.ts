/** One request at a time; invalidation prevents stale results after navigation. */
export function createPullRefresh<T>(options: {
  blocked: () => boolean;
  load: () => Promise<T>;
  apply: (data: T) => void;
  busy: (value: boolean) => void;
  error: (message: string) => void;
  before?: () => void;
}) {
  let generation = 0;
  let pending = false;
  return {
    isPending: () => pending,
    cancel() { generation++; pending = false; options.busy(false); },
    async refresh() {
      if (pending || options.blocked()) return;
      const ticket = ++generation;
      pending = true;
      options.error("");
      options.busy(true);
      try {
        options.before?.();
        const data = await options.load();
        if (ticket === generation) options.apply(data);
      } catch {
        if (ticket === generation) options.error("Couldn’t refresh. Check your connection and pull down to try again.");
      } finally {
        if (ticket === generation) { pending = false; options.busy(false); }
      }
    },
  };
}
