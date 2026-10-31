/** Keep the latest update per section while the drawer is moving. */
export function createDrawerUpdates() {
  let paused = false;
  let disposed = false;
  const pending = new Map<string, () => void>();
  return {
    pause() { paused = true; },
    isPaused: () => paused,
    run(key: string, update: () => void) {
      if (disposed) return;
      if (paused) pending.set(key, update);
      else update();
    },
    resume() {
      if (disposed) return;
      paused = false;
      const updates = [...pending.values()];
      pending.clear();
      updates.forEach(update => update());
    },
    dispose() { disposed = true; pending.clear(); },
  };
}
// Navigator-level events are forwarded without causing a React render.
export function createDrawerMotion(accountId?: string) {
  let moving = false;
  let open = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<{ start: () => void; end: (closing: boolean) => void }>();
  const settle = (closing: boolean) => {
    clearTimeout(fallback);
    fallback = undefined;
    moving = false;
    open = !closing;
    listeners.forEach(listener => listener.end(closing));
  };
  const start = () => {
    clearTimeout(fallback);
    moving = true;
    listeners.forEach(listener => listener.start());
    // Events may be absent/interrupted on a platform. Never gate data forever.
    fallback = setTimeout(() => settle(!open), 750);
  };
  return {
    accountId,
    isMoving: () => moving,
    isOpen: () => open,
    start,
    end: settle,
    observeVisibility(visible: boolean) {
      if (open === visible) return;
      open = visible;
      start();
    },
    dispose() { clearTimeout(fallback); moving = false; listeners.clear(); },
    subscribe(listener: { start: () => void; end: (closing: boolean) => void }) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

