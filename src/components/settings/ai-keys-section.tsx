"use client";

import { useState } from "react";
import { Sparkles, Mic, KeyRound, Share2, Activity, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-guard";
import {
  useApiKeyStatus,
  useSetApiKey,
  useDeleteApiKey,
  useKeyShares,
  useGrantShare,
  useRevokeShare,
  useAiUsage,
  type AiProvider,
} from "@/hooks/use-ai-keys";

interface ProviderMeta {
  id: AiProvider;
  name: string;
  description: string;
  icon: typeof Sparkles;
  iconColor: string;
  prefix: string;
  placeholder: string;
  consoleUrl: string;
  consoleLabel: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Powers food & drink parsing, substance lookup, medicine search.",
    icon: Sparkles,
    iconColor: "text-amber-500",
    prefix: "sk-ant-",
    placeholder: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleLabel: "console.anthropic.com",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Powers voice transcription (Whisper).",
    icon: Mic,
    iconColor: "text-purple-500",
    prefix: "gsk_",
    placeholder: "gsk_…",
    consoleUrl: "https://console.groq.com/keys",
    consoleLabel: "console.groq.com",
  },
];

function ProviderCard({ meta }: { meta: ProviderMeta }) {
  const { data: status, isLoading } = useApiKeyStatus();
  const { data: shares } = useKeyShares();
  const setKey = useSetApiKey();
  const deleteKey = useDeleteApiKey();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  const entry = status?.[meta.id] ?? null;
  const receivedShare = shares?.received.find((s) => s.provider === meta.id);
  const Icon = meta.icon;

  const handleSave = async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) {
      toast({ title: "Enter a key", variant: "destructive" });
      return;
    }
    if (!trimmed.startsWith(meta.prefix)) {
      toast({
        title: `Invalid ${meta.name} key`,
        description: `${meta.name} keys start with ${meta.prefix}`,
        variant: "destructive",
      });
      return;
    }
    try {
      await setKey.mutateAsync({ provider: meta.id, key: trimmed });
      setKeyValue("");
      setEditing(false);
      toast({ title: `${meta.name} key saved`, variant: "success" });
    } catch (err) {
      toast({
        title: `Failed to save ${meta.name} key`,
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    try {
      await deleteKey.mutateAsync(meta.id);
      toast({ title: `${meta.name} key removed`, variant: "success" });
    } catch (err) {
      toast({
        title: `Failed to remove ${meta.name} key`,
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  let statusBlock: React.ReactNode;
  if (isLoading) {
    statusBlock = (
      <p className="text-xs text-muted-foreground">Loading…</p>
    );
  } else if (entry?.configured) {
    statusBlock = (
      <p className="text-xs text-muted-foreground">
        Using your key ending in <span className="font-mono">{entry.last4 || "????"}</span>
      </p>
    );
  } else if (receivedShare) {
    statusBlock = (
      <p className="text-xs text-muted-foreground">
        Granted by{" "}
        <span className="font-mono">{receivedShare.grantorEmail}</span>
      </p>
    );
  } else {
    statusBlock = (
      <p className="text-xs text-muted-foreground">
        Not configured. Add a key, or ask someone to share theirs.
      </p>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 ${meta.iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{meta.name}</p>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      {statusBlock}

      {editing ? (
        <div className="space-y-2">
          <Label htmlFor={`key-${meta.id}`} className="text-xs">
            Paste {meta.name} API key
          </Label>
          <Input
            id={`key-${meta.id}`}
            type="password"
            placeholder={meta.placeholder}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            Get a key from{" "}
            <a
              href={meta.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {meta.consoleLabel}
            </a>
            . Stored encrypted on the server.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={setKey.isPending || !keyValue.trim()}
            >
              {setKey.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setKeyValue("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            className="gap-1"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {entry?.configured ? "Replace key" : "Add key"}
          </Button>
          {entry?.configured && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={deleteKey.isPending}
              className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ShareControls() {
  const { data: status } = useApiKeyStatus();
  const { data: shares } = useKeyShares();
  const grant = useGrantShare();
  const revoke = useRevokeShare();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<AiProvider>("anthropic");

  const ownHasAnthropic = !!status?.anthropic?.configured;
  const ownHasGroq = !!status?.groq?.configured;
  const canShareAny = ownHasAnthropic || ownHasGroq;

  // Default the provider selector to one we can actually share.
  if (provider === "anthropic" && !ownHasAnthropic && ownHasGroq) {
    setProvider("groq");
  } else if (provider === "groq" && !ownHasGroq && ownHasAnthropic) {
    setProvider("anthropic");
  }

  const handleGrant = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      await grant.mutateAsync({ granteeEmail: trimmed, provider });
      setEmail("");
      toast({
        title: `Shared with ${trimmed}`,
        description: `They can now use your ${provider} key.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Share failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (granteeId: string, p: AiProvider) => {
    try {
      await revoke.mutateAsync({ granteeId, provider: p });
      toast({ title: "Share revoked", variant: "success" });
    } catch (err) {
      toast({
        title: "Revoke failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (!canShareAny) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a key above to share it with another user.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="share-email" className="text-xs">
          Share with email
        </Label>
        <div className="flex gap-2">
          <Input
            id="share-email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {ownHasAnthropic && <option value="anthropic">Anthropic</option>}
            {ownHasGroq && <option value="groq">Groq</option>}
          </select>
          <Button
            size="sm"
            onClick={handleGrant}
            disabled={grant.isPending || !email.trim()}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Share
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          They must have signed in at least once before you can share.
        </p>
      </div>

      {shares && shares.granted.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Currently shared:</p>
          <ul className="space-y-1">
            {shares.granted.map((g) => (
              <li
                key={`${g.granteeId}:${g.provider}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono truncate">
                  {g.granteeEmail}
                  <span className="text-muted-foreground"> · {g.provider}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRevoke(g.granteeId, g.provider)}
                  disabled={revoke.isPending}
                  className="h-7 px-2 text-red-600 hover:text-red-700"
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UsageSummary() {
  const { data, isLoading } = useAiUsage(30);
  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Loading usage…</p>
    );
  }
  if (!data || data.mine.byProvider.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No AI usage in the last {data?.windowDays ?? 30} days.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.mine.byProvider.map((p) => (
        <div key={p.provider} className="text-xs">
          <p className="font-medium capitalize">{p.provider}</p>
          <p className="text-muted-foreground">
            {p.calls} call{p.calls === 1 ? "" : "s"}
            {p.provider === "anthropic" && (
              <>
                {" · "}
                {p.inputTokens.toLocaleString()} in / {p.outputTokens.toLocaleString()} out tokens
              </>
            )}
            {p.provider === "groq" && p.audioSeconds > 0 && (
              <>
                {" · "}
                {Math.round(p.audioSeconds)} s of audio
              </>
            )}
          </p>
        </div>
      ))}

      {data.asGrantor.byGrantee.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs font-medium mb-1">Consumption against your shared keys:</p>
          <ul className="space-y-1">
            {data.asGrantor.byGrantee.map((g) => (
              <li
                key={`${g.granteeId}:${g.provider}`}
                className="text-xs text-muted-foreground"
              >
                <span className="font-mono">{g.granteeEmail}</span> · {g.provider}:{" "}
                {g.calls} call{g.calls === 1 ? "" : "s"}
                {g.provider === "anthropic" && (
                  <>
                    , {g.inputTokens.toLocaleString()} in / {g.outputTokens.toLocaleString()} out tokens
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AiKeysSection() {
  const { ready, authenticated } = useAuth();

  if (!ready) {
    return null;
  }

  if (!authenticated) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <Sparkles className="w-4 h-4" />
          <h3 className="font-semibold">AI features</h3>
        </div>
        <div className="p-3 rounded-lg border bg-muted/30">
          <p className="text-sm font-medium">Sign in to manage AI keys</p>
          <p className="text-xs text-muted-foreground mt-1">
            Once signed in you can add your own Anthropic and Groq API keys, or
            use a key someone has shared with you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Sparkles className="w-4 h-4" />
        <h3 className="font-semibold">AI features</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        AI features run through your own provider keys, billed directly by
        Anthropic and Groq. Add a key below, or use one someone has shared with
        you. Keys are encrypted at rest on the server.
      </p>

      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p.id} meta={p} />
        ))}
      </div>

      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center gap-2">
          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">Share your key</p>
        </div>
        <ShareControls />
      </div>

      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">Usage (last 30 days)</p>
        </div>
        <UsageSummary />
      </div>
    </div>
  );
}
