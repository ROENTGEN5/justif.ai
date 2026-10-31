import { useCallback, useEffect, useRef, useState } from "react";
import { createPullRefresh } from "../lib/pullRefresh";

export function usePullRefresh<T>(scope: string | undefined, options: {
  blocked: () => boolean; load: () => Promise<T>; apply: (data: T) => void; before?: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const latest = useRef(options);
  latest.current = options;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(false);
  const refreshInFlight = useRef(false);
  const controller = useRef<ReturnType<typeof createPullRefresh<T>> | null>(null);
  useEffect(() => {
    mounted.current = true;
    const valid = () => mounted.current && currentScope.current === scope;
    const instance = createPullRefresh<T>({
      blocked: () => !valid() || latest.current.blocked(),
      load: () => latest.current.load(),
      apply: data => { if (valid()) latest.current.apply(data); },
      before: () => latest.current.before?.(),
      busy: value => { refreshInFlight.current = value; if (valid()) setRefreshing(value); },
      error: message => { if (valid()) setRefreshError(message); },
    });
    controller.current = instance;
    setRefreshing(false);
    setRefreshError("");
    return () => { mounted.current = false; instance.cancel(); };
  }, [scope]);
  const onRefresh = useCallback(() => { void controller.current?.refresh(); }, []);
  const cancelRefresh = useCallback(() => controller.current?.cancel(), []);
  return {
    refreshing, refreshError, refreshInFlight,
    onRefresh, cancelRefresh,
  };
}
