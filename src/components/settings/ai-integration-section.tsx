"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, LogIn, CheckCircle2 } from "lucide-react";
import { usePerplexityKey } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";

export function AiIntegrationSection() {
  const { authenticated, login, user } = usePrivy();
  const { hasKey, setApiKey } = usePerplexityKey();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
        <Key className="w-4 h-4" />
        <h3 className="font-semibold">AI Integration</h3>
      </div>

      {/* Authentication Status */}
      <div className="space-y-2 pl-6">
        <Label>Authentication (Recommended)</Label>
        {authenticated ? (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Signed in</span>
            </div>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">
              {user?.email?.address || "Authenticated user"} — AI features enabled
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={login}
            >
              <LogIn className="w-4 h-4" />
              Sign in to enable AI
            </Button>
            <p className="text-xs text-muted-foreground">
              Sign in with your authorized account to use AI features with the server API key.
            </p>
          </div>
        )}
      </div>

      <div className="pl-6 py-2">
        <p className="text-xs text-muted-foreground text-center">— or use your own key —</p>
      </div>

      {/* Client API Key - fallback */}
      <div className="space-y-2 pl-6">
        <Label htmlFor="api-key">Your Own API Key (Fallback)</Label>
        <div className="flex gap-2">
          <Input
            id="api-key"
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={hasKey ? "••••••••••••" : "pplx-..."}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (apiKeyInput) {
                setApiKey(apiKeyInput);
                setApiKeyInput("");
                toast({ title: "API key saved", variant: "success" });
              }
            }}
            disabled={!apiKeyInput}
          >
            Save
          </Button>
        </div>
        {hasKey && (
          <p className="text-xs text-green-600 dark:text-green-400">
            Your API key configured
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          If not signing in, enter your own Perplexity API key.{" "}
          <a
            href="https://www.perplexity.ai/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 dark:text-violet-400 hover:underline"
          >
            Get an API key
          </a>
        </p>
      </div>
    </div>
  );
}
