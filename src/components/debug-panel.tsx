"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bug,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Bell,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSettings, usePerplexityKey } from "@/hooks/use-settings";
import { usePinGate } from "@/hooks/use-pin-gate";
import { getAuditLogs, type AuditEntry } from "@/lib/audit";
import { parseIntakeWithPerplexity } from "@/lib/perplexity";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  isNotificationSupported,
  getNotificationPermission,
  showNotification,
  getNotificationSettings,
} from "@/lib/push-notification-service";
import { usePermissions } from "@/hooks/use-permissions";
import { useServiceWorker } from "@/hooks/use-service-worker";

interface DbDiagnostics {
  version: number;
  stores: string[];
  intakeCount: number;
  weightCount: number;
  bpCount: number;
  auditCount: number;
  intakeRecords: unknown[];
  weightRecords: unknown[];
  bpRecords: unknown[];
  error?: string;
}

interface AIStatusResponse {
  timestamp: string;
  config: {
    privyConfigured: boolean;
    serverApiKeyConfigured: boolean;
    serverApiKeyFormat: string;
    serverApiKeyLength: number;
  };
  environment: string;
}

interface AITestResult {
  success: boolean;
  water?: number | null;
  salt?: number | null;
  reasoning?: string;
  error?: string;
  duration?: number;
}

interface ServiceWorkerDetails {
  hasRegistration: boolean;
  scriptURL: string | null;
  scope: string | null;
  installingState: string | null;
  waitingState: string | null;
  activeState: string | null;
  controllerURL: string | null;
  updateViaCache: string | null;
}

interface NotificationDiagnostics {
  supported: boolean;
  permission: string;
  serviceWorkerReady: boolean;
  serviceWorkerState: string;
  serviceWorkerDetails: ServiceWorkerDetails;
  storedSettings: {
    enabled: boolean;
    lastCheck: number | null;
    checkIntervalHours: number;
  };
  storedMicPermission: string | null;
}

interface NotificationTestResult {
  method: "serviceWorker" | "direct";
  success: boolean;
  error?: string;
}

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [dbDiagnostics, setDbDiagnostics] = useState<DbDiagnostics | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [nativeDbInfo, setNativeDbInfo] = useState<string>("");
  
  // Notification debugging state
  const [notifDiagnostics, setNotifDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifTestResult, setNotifTestResult] = useState<NotificationTestResult | null>(null);
  const [notifTestLoading, setNotifTestLoading] = useState(false);
  const [customNotifTitle, setCustomNotifTitle] = useState("Debug Test");
  const [customNotifBody, setCustomNotifBody] = useState("Testing notifications from debug panel");
  
  // SW control state
  const [swActionLoading, setSwActionLoading] = useState(false);
  const [swActionResult, setSwActionResult] = useState<{ success: boolean; message: string } | null>(null);

  const settings = useSettings();
  const { permissions, refreshPermissions } = usePermissions();
  const { hasKey, getApiKey } = usePerplexityKey();
  const { authenticated, user, getAccessToken } = usePrivy();
  const { hasPinEnabled } = usePinGate();
  const { 
    isRegistered: swIsRegistered,
    registrationError: swRegistrationError,
    registerServiceWorker,
    unregisterServiceWorker,
    forceSkipWaiting,
  } = useServiceWorker();

  // Fetch AI status from server
  const fetchAIStatus = useCallback(async () => {
    setAiStatusLoading(true);
    try {
      const response = await fetch("/api/ai/status");
      if (response.ok) {
        const data = await response.json();
        setAiStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch AI status:", error);
    } finally {
      setAiStatusLoading(false);
    }
  }, []);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    setAuditLogsLoading(true);
    try {
      const logs = await getAuditLogs();
      setAuditLogs(logs.slice(0, 100)); // Limit to last 100
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setAuditLogsLoading(false);
    }
  }, []);

  // Check native IndexedDB (bypasses Dexie)
  const checkNativeIndexedDB = useCallback(async () => {
    try {
      const databases = await indexedDB.databases();
      let info = `Found ${databases.length} database(s):\n`;
      
      for (const dbInfo of databases) {
        info += `- ${dbInfo.name} (v${dbInfo.version})\n`;
      }
      
      // Try to open IntakeTrackerDB directly
      return new Promise<string>((resolve) => {
        const request = indexedDB.open("IntakeTrackerDB");
        
        request.onerror = () => {
          resolve(info + `\nError opening IntakeTrackerDB: ${request.error?.message}`);
        };
        
        request.onsuccess = () => {
          const idb = request.result;
          info += `\nIntakeTrackerDB opened successfully:\n`;
          info += `- Version: ${idb.version}\n`;
          info += `- Object stores: ${Array.from(idb.objectStoreNames).join(", ")}\n`;
          
          // Try to count intake records
          try {
            const tx = idb.transaction("intakeRecords", "readonly");
            const store = tx.objectStore("intakeRecords");
            const countReq = store.count();
            
            countReq.onsuccess = () => {
              info += `- Intake records count: ${countReq.result}\n`;
              idb.close();
              resolve(info);
            };
            
            countReq.onerror = () => {
              info += `- Error counting: ${countReq.error?.message}\n`;
              idb.close();
              resolve(info);
            };
          } catch (e) {
            info += `- Error accessing store: ${e}\n`;
            idb.close();
            resolve(info);
          }
        };
        
        // Timeout after 5 seconds
        setTimeout(() => resolve(info + "\nTimeout waiting for DB"), 5000);
      });
    } catch (e) {
      return `Error: ${e}`;
    }
  }, []);

  // Fetch database diagnostics with timeout
  const fetchDbDiagnostics = useCallback(async () => {
    setDbLoading(true);
    
    const timeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
      ]);
    };

    try {
      // Try to get basic DB info first (doesn't require open DB)
      let version = -1;
      let stores: string[] = [];
      let error = "";
      
      try {
        version = db.verno;
        stores = db.tables.map(t => t.name);
      } catch (e) {
        error = e instanceof Error ? e.message : "Unknown error";
      }

      // Try each table with 3 second timeout
      const intakeRecords = await timeout(
        db.intakeRecords.toArray().catch((e) => { error = `Intake: ${e.message}`; return []; }),
        3000,
        []
      );
      
      const weightRecords = await timeout(
        db.weightRecords.toArray().catch((e) => { error = `Weight: ${e.message}`; return []; }),
        3000,
        []
      );
      
      const bpRecords = await timeout(
        db.bloodPressureRecords.toArray().catch((e) => { error = `BP: ${e.message}`; return []; }),
        3000,
        []
      );
      
      const auditRecords = await timeout(
        db.auditLogs.toArray().catch((e) => { error = `Audit: ${e.message}`; return []; }),
        3000,
        []
      );

      setDbDiagnostics({
        version,
        stores,
        intakeCount: intakeRecords.length,
        weightCount: weightRecords.length,
        bpCount: bpRecords.length,
        auditCount: auditRecords.length,
        intakeRecords,
        weightRecords,
        bpRecords,
        error: error || undefined,
      } as DbDiagnostics);
    } catch (error) {
      console.error("Failed to fetch DB diagnostics:", error);
      setDbDiagnostics({
        version: -1,
        stores: [],
        intakeCount: 0,
        weightCount: 0,
        bpCount: 0,
        auditCount: 0,
        intakeRecords: [],
        weightRecords: [],
        bpRecords: [],
        error: error instanceof Error ? error.message : "Database error",
      } as DbDiagnostics);
    } finally {
      setDbLoading(false);
    }
    
    // Also check native IndexedDB
    const nativeInfo = await checkNativeIndexedDB();
    setNativeDbInfo(nativeInfo);
  }, [checkNativeIndexedDB]);

  // Fetch notification diagnostics
  const fetchNotifDiagnostics = useCallback(async () => {
    setNotifLoading(true);
    try {
      const supported = isNotificationSupported();
      const permission = supported ? getNotificationPermission() : "unsupported";
      const storedSettings = getNotificationSettings();
      
      // Check localStorage for mic permission
      let storedMicPermission: string | null = null;
      try {
        storedMicPermission = localStorage.getItem("intake-tracker-mic-permission");
      } catch {
        // Ignore
      }
      
      // Check service worker status - detailed info
      let serviceWorkerReady = false;
      let serviceWorkerState = "unavailable";
      const serviceWorkerDetails: ServiceWorkerDetails = {
        hasRegistration: false,
        scriptURL: null,
        scope: null,
        installingState: null,
        waitingState: null,
        activeState: null,
        controllerURL: null,
        updateViaCache: null,
      };
      
      if ("serviceWorker" in navigator) {
        try {
          // Get controller info (currently controlling SW)
          if (navigator.serviceWorker.controller) {
            serviceWorkerDetails.controllerURL = navigator.serviceWorker.controller.scriptURL;
          }
          
          // Get registration info (doesn't wait for ready)
          const registration = await navigator.serviceWorker.getRegistration();
          
          if (registration) {
            serviceWorkerDetails.hasRegistration = true;
            serviceWorkerDetails.scope = registration.scope;
            serviceWorkerDetails.updateViaCache = registration.updateViaCache;
            
            // Get state of each worker type
            if (registration.installing) {
              serviceWorkerDetails.installingState = registration.installing.state;
              serviceWorkerDetails.scriptURL = registration.installing.scriptURL;
            }
            if (registration.waiting) {
              serviceWorkerDetails.waitingState = registration.waiting.state;
              serviceWorkerDetails.scriptURL = serviceWorkerDetails.scriptURL || registration.waiting.scriptURL;
            }
            if (registration.active) {
              serviceWorkerDetails.activeState = registration.active.state;
              serviceWorkerDetails.scriptURL = serviceWorkerDetails.scriptURL || registration.active.scriptURL;
            }
          }
          
          // Now try to wait for ready with timeout
          const readyRegistration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
          ]);
          
          if (readyRegistration) {
            serviceWorkerReady = true;
            serviceWorkerState = readyRegistration.active?.state || "no active worker";
          } else {
            // Determine more specific state message
            if (!serviceWorkerDetails.hasRegistration) {
              serviceWorkerState = "no registration found";
            } else if (serviceWorkerDetails.installingState) {
              serviceWorkerState = `installing (${serviceWorkerDetails.installingState})`;
            } else if (serviceWorkerDetails.waitingState) {
              serviceWorkerState = `waiting (${serviceWorkerDetails.waitingState})`;
            } else {
              serviceWorkerState = "timeout waiting for ready";
            }
          }
        } catch (e) {
          serviceWorkerState = `error: ${e instanceof Error ? e.message : "unknown"}`;
        }
      }
      
      setNotifDiagnostics({
        supported,
        permission,
        serviceWorkerReady,
        serviceWorkerState,
        serviceWorkerDetails,
        storedSettings,
        storedMicPermission,
      });
    } catch (error) {
      console.error("Failed to fetch notification diagnostics:", error);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  // Test notification via Service Worker
  const testNotificationSW = useCallback(async (title: string, body: string) => {
    setNotifTestLoading(true);
    setNotifTestResult(null);
    
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service Worker not supported");
      }
      
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        tag: "debug-test-sw",
      });
      
      setNotifTestResult({
        method: "serviceWorker",
        success: true,
      });
    } catch (error) {
      setNotifTestResult({
        method: "serviceWorker",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setNotifTestLoading(false);
    }
  }, []);

  // Test notification via direct Notification API
  const testNotificationDirect = useCallback(async (title: string, body: string) => {
    setNotifTestLoading(true);
    setNotifTestResult(null);
    
    try {
      if (!isNotificationSupported()) {
        throw new Error("Notification API not supported");
      }
      
      if (Notification.permission !== "granted") {
        throw new Error(`Permission not granted: ${Notification.permission}`);
      }
      
      new Notification(title, {
        body,
        icon: "/icons/icon-192.svg",
        tag: "debug-test-direct",
      });
      
      setNotifTestResult({
        method: "direct",
        success: true,
      });
    } catch (error) {
      setNotifTestResult({
        method: "direct",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setNotifTestLoading(false);
    }
  }, []);

  // Test using the app's showNotification function
  const testNotificationApp = useCallback(async (title: string, body: string) => {
    setNotifTestLoading(true);
    setNotifTestResult(null);
    
    try {
      const success = await showNotification(title, {
        body,
        tag: "debug-test-app",
      });
      
      setNotifTestResult({
        method: "serviceWorker",
        success,
        error: success ? undefined : "showNotification returned false",
      });
    } catch (error) {
      setNotifTestResult({
        method: "serviceWorker",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setNotifTestLoading(false);
    }
  }, []);

  // SW control handlers
  const handleRegisterSW = useCallback(async () => {
    setSwActionLoading(true);
    setSwActionResult(null);
    try {
      const result = await registerServiceWorker();
      setSwActionResult({
        success: result.success,
        message: result.success 
          ? `Registered: ${result.registration?.active?.scriptURL || "unknown"}` 
          : result.error || "Failed to register",
      });
      // Refresh diagnostics after action
      await fetchNotifDiagnostics();
    } catch (error) {
      setSwActionResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSwActionLoading(false);
    }
  }, [registerServiceWorker, fetchNotifDiagnostics]);

  const handleUnregisterSW = useCallback(async () => {
    setSwActionLoading(true);
    setSwActionResult(null);
    try {
      const success = await unregisterServiceWorker();
      setSwActionResult({
        success,
        message: success ? "All service workers unregistered" : "Failed to unregister",
      });
      // Refresh diagnostics after action
      await fetchNotifDiagnostics();
    } catch (error) {
      setSwActionResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSwActionLoading(false);
    }
  }, [unregisterServiceWorker, fetchNotifDiagnostics]);

  const handleForceSkipWaiting = useCallback(async () => {
    setSwActionLoading(true);
    setSwActionResult(null);
    try {
      const success = await forceSkipWaiting();
      setSwActionResult({
        success,
        message: success ? "Skip waiting message sent - page may reload" : "No waiting worker found",
      });
      // Refresh diagnostics after action
      await fetchNotifDiagnostics();
    } catch (error) {
      setSwActionResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSwActionLoading(false);
    }
  }, [forceSkipWaiting, fetchNotifDiagnostics]);

  // Test AI service
  const testAIService = useCallback(async () => {
    setAiTestLoading(true);
    setAiTestResult(null);
    const startTime = Date.now();

    try {
      let authToken: string | undefined;
      if (authenticated) {
        authToken = (await getAccessToken()) || undefined;
      }

      const result = await parseIntakeWithPerplexity("a glass of water", {
        authToken,
        clientApiKey: hasKey ? getApiKey() : undefined,
      });

      setAiTestResult({
        success: true,
        water: result.water,
        salt: result.salt,
        reasoning: result.reasoning,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      setAiTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
      });
    } finally {
      setAiTestLoading(false);
    }
  }, [authenticated, getAccessToken, hasKey, getApiKey]);

  // Load data when panel opens
  useEffect(() => {
    if (open) {
      fetchAIStatus();
      fetchAuditLogs();
      fetchDbDiagnostics();
      fetchNotifDiagnostics();
    }
  }, [open, fetchAIStatus, fetchAuditLogs, fetchDbDiagnostics, fetchNotifDiagnostics]);

  // Filter audit logs
  const filteredLogs = auditLogs.filter((log) => {
    if (logFilter === "all") return true;
    if (logFilter === "ai") return log.action.startsWith("ai_");
    if (logFilter === "data") return log.action.startsWith("data_");
    if (logFilter === "pin") return log.action.startsWith("pin_");
    if (logFilter === "settings") return log.action.startsWith("settings_") || log.action.startsWith("api_key_");
    return true;
  });

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium",
        ok
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}
    >
      {ok ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {label}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <Bug className="w-4 h-4" />
          Debug Panel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Debug Panel
          </DialogTitle>
          <DialogDescription>
            View app state, logs, and test services
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="db" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="db">DB</TabsTrigger>
            <TabsTrigger value="state">State</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="notif">Notif</TabsTrigger>
            <TabsTrigger value="test">AI</TabsTrigger>
          </TabsList>

          {/* Database Tab */}
          <TabsContent value="db" className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">IndexedDB Status</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDbDiagnostics}
                disabled={dbLoading}
              >
                {dbLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            </div>

            {dbDiagnostics ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {/* Native IndexedDB Check */}
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Native IndexedDB Check</h5>
                    <pre className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap">
                      {nativeDbInfo || "Loading..."}
                    </pre>
                  </div>

                  {/* Dexie Database Info */}
                  <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                    <div>Dexie DB Version: {dbDiagnostics.version}</div>
                    <div>Dexie Tables: {dbDiagnostics.stores.join(", ") || "None found"}</div>
                    {dbDiagnostics.error && (
                      <div className="text-red-600 dark:text-red-400 mt-2">
                        Dexie Error: {dbDiagnostics.error}
                      </div>
                    )}
                  </div>

                  {/* Record Counts */}
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Record Counts</h5>
                    <div className={cn(
                      "rounded-lg p-3 text-sm font-mono",
                      dbDiagnostics.intakeCount === 0 ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" : "bg-muted/50"
                    )}>
                      <div>Intake Records: <strong>{dbDiagnostics.intakeCount}</strong></div>
                      <div>Weight Records: {dbDiagnostics.weightCount}</div>
                      <div>BP Records: {dbDiagnostics.bpCount}</div>
                      <div>Audit Logs: {dbDiagnostics.auditCount}</div>
                    </div>
                  </div>

                  {/* Raw Data Dump */}
                  {dbDiagnostics.intakeCount === 0 && (
                    <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-3 text-red-700 dark:text-red-300">
                      <strong>WARNING:</strong> No intake records found in database.
                    </div>
                  )}

                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Intake Records (Raw)</h5>
                    <pre className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {JSON.stringify(dbDiagnostics.intakeRecords, null, 2)}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Weight Records (Raw)</h5>
                    <pre className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                      {JSON.stringify(dbDiagnostics.weightRecords, null, 2)}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">BP Records (Raw)</h5>
                    <pre className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                      {JSON.stringify(dbDiagnostics.bpRecords, null, 2)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center py-8">
                {dbLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : (
                  <p className="text-muted-foreground">Click refresh to load database info</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* State Tab */}
          <TabsContent value="state" className="space-y-4">
            <ScrollArea className="h-[400px] pr-4">
              {/* Settings */}
              <div className="space-y-2 mb-4">
                <h4 className="font-medium text-sm">Settings</h4>
                <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                  <div>Water Increment: {settings.waterIncrement} ml</div>
                  <div>Water Limit: {settings.waterLimit} ml</div>
                  <div>Salt Increment: {settings.saltIncrement} mg</div>
                  <div>Salt Limit: {settings.saltLimit} mg</div>
                </div>
              </div>

              {/* Auth Status */}
              <div className="space-y-2 mb-4">
                <h4 className="font-medium text-sm">Authentication</h4>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge ok={authenticated} label={authenticated ? "Signed In" : "Not Signed In"} />
                  <StatusBadge ok={hasPinEnabled} label={hasPinEnabled ? "PIN Enabled" : "No PIN"} />
                </div>
                {authenticated && user && (
                  <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono">
                    <div>User ID: {user.id?.slice(0, 20)}...</div>
                    {user.email && <div>Email: {user.email.address}</div>}
                  </div>
                )}
              </div>

              {/* API Keys */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">API Configuration</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchAIStatus}
                    disabled={aiStatusLoading}
                  >
                    {aiStatusLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge ok={hasKey} label={hasKey ? "Client Key Set" : "No Client Key"} />
                  {aiStatus && (
                    <>
                      <StatusBadge
                        ok={aiStatus.config.serverApiKeyConfigured}
                        label={aiStatus.config.serverApiKeyConfigured ? "Server Key Set" : "No Server Key"}
                      />
                      <StatusBadge
                        ok={aiStatus.config.privyConfigured}
                        label={aiStatus.config.privyConfigured ? "Privy Configured" : "Privy Not Configured"}
                      />
                    </>
                  )}
                </div>
                {aiStatus && (
                  <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                    <div>Environment: {aiStatus.environment}</div>
                    <div>Server Key Format: {aiStatus.config.serverApiKeyFormat}</div>
                    <div>Server Key Length: {aiStatus.config.serverApiKeyLength}</div>
                    <div>Last Check: {new Date(aiStatus.timestamp).toLocaleTimeString()}</div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {["all", "ai", "data", "pin", "settings"].map((filter) => (
                  <Button
                    key={filter}
                    variant={logFilter === filter ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setLogFilter(filter)}
                  >
                    {filter}
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAuditLogs}
                disabled={auditLogsLoading}
              >
                {auditLogsLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            </div>

            <ScrollArea className="h-[350px]">
              {filteredLogs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No logs found
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-muted/50 rounded p-2 text-xs font-mono"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            log.action.includes("error")
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : log.action.includes("success")
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          )}
                        >
                          {log.action}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      {log.details && (
                        <div className="mt-1 text-muted-foreground truncate">
                          {log.details}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notif" className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Notification Diagnostics</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchNotifDiagnostics}
                disabled={notifLoading}
              >
                {notifLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            </div>

            <ScrollArea className="h-[380px]">
              <div className="space-y-4 pr-4">
                {/* Status Overview */}
                {notifDiagnostics && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge 
                        ok={notifDiagnostics.supported} 
                        label={notifDiagnostics.supported ? "API Supported" : "API Not Supported"} 
                      />
                      <StatusBadge 
                        ok={notifDiagnostics.permission === "granted"} 
                        label={`Permission: ${notifDiagnostics.permission}`} 
                      />
                      <StatusBadge 
                        ok={notifDiagnostics.serviceWorkerReady} 
                        label={notifDiagnostics.serviceWorkerReady ? "SW Ready" : "SW Not Ready"} 
                      />
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                      <div>Browser Permission: {notifDiagnostics.permission}</div>
                      <div>React State: {permissions.notifications}</div>
                      <div>SW State: {notifDiagnostics.serviceWorkerState}</div>
                      <div>Stored Mic Permission: {notifDiagnostics.storedMicPermission || "not set"}</div>
                    </div>

                    {/* Detailed Service Worker Info */}
                    <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                      <div className="font-medium text-foreground mb-1">Service Worker Details:</div>
                      <div>Has Registration: {notifDiagnostics.serviceWorkerDetails.hasRegistration ? "Yes" : "No"}</div>
                      <div className="truncate">Script URL: {notifDiagnostics.serviceWorkerDetails.scriptURL || "none"}</div>
                      <div className="truncate">Scope: {notifDiagnostics.serviceWorkerDetails.scope || "none"}</div>
                      <div className="truncate">Controller: {notifDiagnostics.serviceWorkerDetails.controllerURL || "none"}</div>
                      <div className="mt-1 pt-1 border-t border-muted">
                        <div>Installing: {notifDiagnostics.serviceWorkerDetails.installingState || "none"}</div>
                        <div>Waiting: {notifDiagnostics.serviceWorkerDetails.waitingState || "none"}</div>
                        <div>Active: {notifDiagnostics.serviceWorkerDetails.activeState || "none"}</div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                      <div className="font-medium text-foreground mb-1">Notification Settings:</div>
                      <div>Enabled: {notifDiagnostics.storedSettings.enabled ? "Yes" : "No"}</div>
                      <div>Last Check: {notifDiagnostics.storedSettings.lastCheck 
                        ? new Date(notifDiagnostics.storedSettings.lastCheck).toLocaleString()
                        : "Never"}</div>
                      <div>Check Interval: {notifDiagnostics.storedSettings.checkIntervalHours}h</div>
                    </div>
                  </div>
                )}

                {/* Service Worker Controls */}
                <div className="space-y-3 pt-2 border-t">
                  <h5 className="font-medium text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Service Worker Controls
                  </h5>
                  
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge 
                      ok={swIsRegistered} 
                      label={swIsRegistered ? "Hook: Registered" : "Hook: Not Registered"} 
                    />
                  </div>
                  
                  {swRegistrationError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 text-xs text-red-600 dark:text-red-400">
                      {swRegistrationError}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegisterSW}
                      disabled={swActionLoading}
                      className="text-xs"
                    >
                      {swActionLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Register"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleForceSkipWaiting}
                      disabled={swActionLoading}
                      className="text-xs"
                    >
                      {swActionLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Skip Wait"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUnregisterSW}
                      disabled={swActionLoading}
                      className="text-xs text-red-600 dark:text-red-400 hover:text-red-700"
                    >
                      {swActionLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Unregister"
                      )}
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Register = register sw.js or fallback | Skip Wait = activate waiting SW | Unregister = remove all SWs
                  </p>

                  {swActionResult && (
                    <div
                      className={cn(
                        "rounded-lg p-3 text-xs",
                        swActionResult.success
                          ? "bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800"
                          : "bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {swActionResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                        <span className={cn(
                          "font-medium",
                          swActionResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                        )}>
                          {swActionResult.message}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom Notification Test */}
                <div className="space-y-3 pt-2 border-t">
                  <h5 className="font-medium text-sm flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Test Notifications
                  </h5>
                  
                  <div className="space-y-2">
                    <Input
                      placeholder="Title"
                      value={customNotifTitle}
                      onChange={(e) => setCustomNotifTitle(e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder="Body"
                      value={customNotifBody}
                      onChange={(e) => setCustomNotifBody(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationApp(customNotifTitle, customNotifBody)}
                      disabled={notifTestLoading}
                      className="text-xs"
                    >
                      <Send className="w-3 h-3 mr-1" />
                      App
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationSW(customNotifTitle, customNotifBody)}
                      disabled={notifTestLoading}
                      className="text-xs"
                    >
                      <Send className="w-3 h-3 mr-1" />
                      SW
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationDirect(customNotifTitle, customNotifBody)}
                      disabled={notifTestLoading}
                      className="text-xs"
                    >
                      <Send className="w-3 h-3 mr-1" />
                      Direct
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    App = showNotification() | SW = ServiceWorker | Direct = new Notification()
                  </p>

                  {notifTestLoading && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {notifTestResult && (
                    <div
                      className={cn(
                        "rounded-lg p-3 text-sm",
                        notifTestResult.success
                          ? "bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800"
                          : "bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {notifTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                        <span className="font-medium text-xs">
                          {notifTestResult.method === "serviceWorker" ? "Service Worker" : "Direct API"}
                          {" - "}
                          {notifTestResult.success ? "Success" : "Failed"}
                        </span>
                      </div>
                      {notifTestResult.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                          {notifTestResult.error}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Request Permission Button */}
                {notifDiagnostics?.permission !== "granted" && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        const result = await Notification.requestPermission();
                        await fetchNotifDiagnostics();
                        await refreshPermissions();
                      }}
                    >
                      Request Permission (Current: {notifDiagnostics?.permission})
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* AI Test Tab */}
          <TabsContent value="test" className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Test the AI service by sending a simple request. This will help
                diagnose any API key or authentication issues.
              </p>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Test Input:</p>
                <p className="text-sm font-mono">&quot;a glass of water&quot;</p>
              </div>

              <Button
                onClick={testAIService}
                disabled={aiTestLoading}
                className="w-full gap-2"
              >
                {aiTestLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Test AI Service
                  </>
                )}
              </Button>

              {aiTestResult && (
                <div
                  className={cn(
                    "rounded-lg p-4 space-y-2",
                    aiTestResult.success
                      ? "bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800"
                      : "bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {aiTestResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <span
                      className={cn(
                        "font-medium",
                        aiTestResult.success
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      )}
                    >
                      {aiTestResult.success ? "Success" : "Failed"}
                    </span>
                    {aiTestResult.duration && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {aiTestResult.duration}ms
                      </span>
                    )}
                  </div>

                  {aiTestResult.success ? (
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-muted-foreground">Water:</span>{" "}
                        <span className="font-mono">{aiTestResult.water ?? 0} ml</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Salt:</span>{" "}
                        <span className="font-mono">{aiTestResult.salt ?? 0} mg</span>
                      </div>
                      {aiTestResult.reasoning && (
                        <div className="text-xs text-muted-foreground italic mt-2">
                          {aiTestResult.reasoning}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 dark:text-red-400 font-mono">
                      {aiTestResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
