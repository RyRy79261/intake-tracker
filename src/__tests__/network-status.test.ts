import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("network-status", () => {
  let addListenerSpy: ReturnType<typeof vi.fn>;
  let removeListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    addListenerSpy = vi.fn();
    removeListenerSpy = vi.fn();

    vi.stubGlobal("window", {
      addEventListener: addListenerSpy,
      removeEventListener: removeListenerSpy,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadModule() {
    return import("@/lib/network-status");
  }

  describe("isOnline()", () => {
    it("returns navigator.onLine when no listener is active", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      });
      const { isOnline } = await loadModule();
      expect(isOnline()).toBe(true);
    });

    it("returns false when navigator.onLine is false", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });
      const { isOnline } = await loadModule();
      expect(isOnline()).toBe(false);
    });
  });

  describe("initNetworkListener (web fallback path)", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      });
    });

    it("attaches window online/offline events", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      initNetworkListener(cb);

      const onlineCalls = addListenerSpy.mock.calls.filter(
        (c: string[]) => c[0] === "online",
      );
      const offlineCalls = addListenerSpy.mock.calls.filter(
        (c: string[]) => c[0] === "offline",
      );
      expect(onlineCalls).toHaveLength(1);
      expect(offlineCalls).toHaveLength(1);
    });

    it("callback fires with true on online event", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      initNetworkListener(cb);

      const onlineHandler = addListenerSpy.mock.calls.find(
        (c: string[]) => c[0] === "online",
      )?.[1] as () => void;
      onlineHandler();
      expect(cb).toHaveBeenCalledWith(true);
    });

    it("callback fires with false on offline event", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      initNetworkListener(cb);

      const offlineHandler = addListenerSpy.mock.calls.find(
        (c: string[]) => c[0] === "offline",
      )?.[1] as () => void;
      offlineHandler();
      expect(cb).toHaveBeenCalledWith(false);
    });

    it("updates cached isOnline on offline event", async () => {
      const { initNetworkListener, isOnline } = await loadModule();
      const cb = vi.fn();
      initNetworkListener(cb);

      const offlineHandler = addListenerSpy.mock.calls.find(
        (c: string[]) => c[0] === "offline",
      )?.[1] as () => void;
      offlineHandler();
      expect(isOnline()).toBe(false);
    });

    it("cleanup function removes listeners", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      const cleanup = initNetworkListener(cb);

      cleanup();

      const onlineRemoves = removeListenerSpy.mock.calls.filter(
        (c: string[]) => c[0] === "online",
      );
      const offlineRemoves = removeListenerSpy.mock.calls.filter(
        (c: string[]) => c[0] === "offline",
      );
      expect(onlineRemoves).toHaveLength(1);
      expect(offlineRemoves).toHaveLength(1);
    });
  });

  describe("initNetworkListener (Capacitor path)", () => {
    let mockRemove: ReturnType<typeof vi.fn>;
    let mockAddListener: ReturnType<typeof vi.fn>;
    let mockGetStatus: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      });

      mockRemove = vi.fn();
      mockAddListener = vi
        .fn()
        .mockResolvedValue({ remove: mockRemove });
      mockGetStatus = vi
        .fn()
        .mockResolvedValue({ connected: true, connectionType: "wifi" });

      vi.stubGlobal("window", {
        Capacitor: { isNativePlatform: () => true },
        addEventListener: addListenerSpy,
        removeEventListener: removeListenerSpy,
      });

      vi.doMock("@capacitor/network", () => ({
        Network: {
          addListener: mockAddListener,
          getStatus: mockGetStatus,
        },
      }));
    });

    it("uses Network.addListener in Capacitor environment", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      initNetworkListener(cb);

      await vi.waitFor(() => {
        expect(mockAddListener).toHaveBeenCalledWith(
          "networkStatusChange",
          expect.any(Function),
        );
      });
    });

    it("calls Network.getStatus for initial state", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      initNetworkListener(cb);

      await vi.waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalled();
      });
    });

    it("cleanup removes the Capacitor listener", async () => {
      const { initNetworkListener } = await loadModule();
      const cb = vi.fn();
      const cleanup = initNetworkListener(cb);

      await vi.waitFor(() => {
        expect(mockAddListener).toHaveBeenCalled();
      });

      cleanup();
      expect(mockRemove).toHaveBeenCalled();
    });
  });
});
