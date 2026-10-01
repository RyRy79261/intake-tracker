/**
 * State for a background task per record id (an AI lookup per prescription),
 * held outside React so the task outlives the view that started it: leaving
 * the view neither stops the request nor loses its result, and the view
 * reads the same state again when it comes back.
 *
 * Read it with `useSyncExternalStore(store.subscribe, () => store.get(id))`.
 */
export interface KeyedTaskStore<S extends object> {
  get: (key: string) => S;
  set: (key: string, patch: Partial<S>) => void;
  subscribe: (listener: () => void) => () => void;
  /** The in-flight request of each key, so it can be cancelled. */
  controllers: Map<string, AbortController>;
  /** Abort everything and forget all state (tests). */
  reset: () => void;
}

export function createKeyedTaskStore<S extends object>(initial: S): KeyedTaskStore<S> {
  const states = new Map<string, S>();
  const listeners = new Set<() => void>();
  const controllers = new Map<string, AbortController>();
  const notify = () => listeners.forEach((l) => l());
  const get = (key: string) => states.get(key) ?? initial;

  return {
    get,
    set(key, patch) {
      states.set(key, { ...get(key), ...patch });
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    controllers,
    reset() {
      controllers.forEach((c) => c.abort());
      controllers.clear();
      states.clear();
      notify();
    },
  };
}
