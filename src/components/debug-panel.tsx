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
} from "lucide-react";
import { useSettings, usePerplexityKey } from "@/hooks/use-settings";
import { usePinGate } from "@/hooks/use-pin-gate";
import { getAuditLogs, type AuditEntry } from "@/lib/audit";
import { parseIntakeWithPerplexity } from "@/lib/perplexity";
import { cn } from "@/lib/utils";

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

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("all");

  const settings = useSettings();
  const { hasKey, getApiKey } = usePerplexityKey();
  const { authenticated, user, getAccessToken } = usePrivy();
  const { hasPinEnabled } = usePinGate();

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
    }
  }, [open, fetchAIStatus, fetchAuditLogs]);

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

        <Tabs defaultValue="state" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="state">State</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="test">AI Test</TabsTrigger>
          </TabsList>

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
