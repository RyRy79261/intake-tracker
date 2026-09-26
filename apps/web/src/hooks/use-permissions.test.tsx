// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

/**
 * usePermissions reports notification + microphone permission state for the
 * Settings permissions panel. Microphone state is cached in localStorage
 * because navigator.permissions.query is unreliable in mobile PWAs.
 */

const notif = vi.hoisted(() => ({
  supported: true,
  permission: "default" as NotificationPermission,
  requestResult: "granted" as NotificationPermission,
}));

vi.mock("@/lib/push-notification-service", () => ({
  isNotificationSupported: () => notif.supported,
  getNotificationPermission: () => notif.permission,
  requestNotificationPermission: async () => ({ success: true, data: notif.requestResult }),
}));

import {
  usePermissions,
  getPermissionLabel,
  canRequestPermission,
} from "@/hooks/use-permissions";

const MIC_KEY = "intake-tracker-mic-permission";

type Listener = () => void;

function stubPermissionsQuery(state: PermissionState) {
  const listeners: Listener[] = [];
  const status = {
    state,
    addEventListener: (_: string, cb: Listener) => listeners.push(cb),
  };
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn(async () => status) },
  });
  return {
    change(next: PermissionState) {
      status.state = next;
      listeners.forEach((cb) => cb());
    },
  };
}

function stubGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

beforeEach(() => {
  localStorage.clear();
  notif.supported = true;
  notif.permission = "default";
  notif.requestResult = "granted";
  stubPermissionsQuery("prompt");
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "permissions");
  Reflect.deleteProperty(navigator, "mediaDevices");
});

async function renderLoaded() {
  const hook = renderHook(() => usePermissions());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe("usePermissions — initial query", () => {
  it("maps the browser's 'default' notification permission to 'prompt'", async () => {
    const { result } = await renderLoaded();
    expect(result.current.permissions).toEqual({ notifications: "prompt", microphone: "prompt" });
  });

  it("reports notifications as unavailable when unsupported", async () => {
    notif.supported = false;
    const { result } = await renderLoaded();
    expect(result.current.permissions.notifications).toBe("unavailable");
  });

  it("prefers the stored microphone state over the permissions API", async () => {
    localStorage.setItem(MIC_KEY, "denied");
    stubPermissionsQuery("granted");

    const { result } = await renderLoaded();
    expect(result.current.permissions.microphone).toBe("denied");
  });

  it("trusts and stores a non-prompt permissions API answer", async () => {
    stubPermissionsQuery("granted");

    const { result } = await renderLoaded();
    expect(result.current.permissions.microphone).toBe("granted");
    expect(localStorage.getItem(MIC_KEY)).toBe("granted");
  });

  it("follows later permission changes from the browser", async () => {
    const perm = stubPermissionsQuery("granted");
    const { result } = await renderLoaded();

    act(() => perm.change("denied"));

    expect(result.current.permissions.microphone).toBe("denied");
    expect(localStorage.getItem(MIC_KEY)).toBe("denied");
  });
});

describe("usePermissions — requests", () => {
  it("requestNotifications updates state and reports whether it was granted", async () => {
    notif.requestResult = "denied";
    const { result } = await renderLoaded();

    let granted = true;
    await act(async () => {
      granted = await result.current.requestNotifications();
    });

    expect(granted).toBe(false);
    expect(result.current.permissions.notifications).toBe("denied");
  });

  it("requestMicrophone stops the probe stream and stores 'granted'", async () => {
    const stop = vi.fn();
    stubGetUserMedia(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    const { result } = await renderLoaded();

    let granted = false;
    await act(async () => {
      granted = await result.current.requestMicrophone();
    });

    expect(granted).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.permissions.microphone).toBe("granted");
    expect(localStorage.getItem(MIC_KEY)).toBe("granted");
  });

  it("requestMicrophone records a user denial", async () => {
    stubGetUserMedia(async () => {
      throw new DOMException("no", "NotAllowedError");
    });
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.requestMicrophone();
    });

    expect(result.current.permissions.microphone).toBe("denied");
    expect(localStorage.getItem(MIC_KEY)).toBe("denied");
  });

  it("requestMicrophone treats other failures (no device) as still promptable", async () => {
    stubGetUserMedia(async () => {
      throw new DOMException("none", "NotFoundError");
    });
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.requestMicrophone();
    });

    expect(result.current.permissions.microphone).toBe("prompt");
    expect(localStorage.getItem(MIC_KEY)).toBeNull();
  });

  it("resetMicrophonePermission clears the stored state", async () => {
    localStorage.setItem(MIC_KEY, "denied");
    const { result } = await renderLoaded();

    act(() => result.current.resetMicrophonePermission());

    expect(result.current.permissions.microphone).toBe("prompt");
    expect(localStorage.getItem(MIC_KEY)).toBeNull();
  });

  it("refreshPermissions picks up a notification grant made elsewhere", async () => {
    const { result } = await renderLoaded();
    notif.permission = "granted";

    await act(async () => {
      await result.current.refreshPermissions();
    });

    expect(result.current.permissions.notifications).toBe("granted");
  });
});

describe("permission helpers", () => {
  it("labels every state", () => {
    expect(getPermissionLabel("granted")).toBe("Enabled");
    expect(getPermissionLabel("denied")).toBe("Blocked");
    expect(getPermissionLabel("prompt")).toBe("Not set");
    expect(getPermissionLabel("unavailable")).toBe("Not available");
  });

  it("only allows requesting from the prompt state", () => {
    expect(canRequestPermission("prompt")).toBe(true);
    expect(canRequestPermission("denied")).toBe(false);
    expect(canRequestPermission("granted")).toBe(false);
    expect(canRequestPermission("unavailable")).toBe(false);
  });
});
