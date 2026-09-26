let cachedOnline =
  typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
    ? navigator.onLine
    : true;

export function isOnline(): boolean {
  return cachedOnline;
}

function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as { Capacitor?: unknown }).Capacitor
  );
}

export function initNetworkListener(
  callback: (online: boolean) => void,
): () => void {
  if (isCapacitor()) {
    // The listener handle arrives asynchronously (dynamic import, then
    // addListener). A dispose that runs before it resolves must still win:
    // otherwise the handle is never removed, and every re-attach stacks
    // another listener that keeps kicking the engine (audit native-android#11).
    let disposed = false;
    let removeListener: (() => void) | null = null;

    void import("@capacitor/network").then(({ Network }) => {
      if (disposed) return;
      void Network.getStatus().then((status) => {
        cachedOnline = status.connected;
        if (!disposed) callback(status.connected);
      });

      void Network.addListener("networkStatusChange", (status) => {
        cachedOnline = status.connected;
        if (!disposed) callback(status.connected);
      }).then((handle) => {
        if (disposed) {
          void handle.remove();
          return;
        }
        removeListener = () => void handle.remove();
      });
    });

    return () => {
      disposed = true;
      removeListener?.();
      removeListener = null;
    };
  }

  const onOnline = () => {
    cachedOnline = true;
    callback(true);
  };
  const onOffline = () => {
    cachedOnline = false;
    callback(false);
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export function __resetForTests(): void {
  cachedOnline =
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true;
}
