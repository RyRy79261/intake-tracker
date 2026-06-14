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
    let removeListener: (() => void) | null = null;

    import("@capacitor/network").then(({ Network }) => {
      Network.getStatus().then((status) => {
        cachedOnline = status.connected;
        callback(status.connected);
      });

      Network.addListener("networkStatusChange", (status) => {
        cachedOnline = status.connected;
        callback(status.connected);
      }).then((handle) => {
        removeListener = () => handle.remove();
      });
    });

    return () => {
      removeListener?.();
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
