"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  X,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useInteractionCheck } from "@/hooks/use-interaction-check";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import { AnimatePresence, motion } from "motion/react";
import type { InteractionItem } from "@/hooks/use-interaction-check";

export function InteractionSearch() {
  const [query, setQuery] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { check, data, isLoading, error, reset } = useInteractionCheck();
  const prescriptions = usePrescriptions();
  const activePrescriptions = prescriptions.filter((p) => p.isActive);

  function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLocalError(null);

    if (activePrescriptions.length === 0) {
      setLocalError("Add prescriptions first to check interactions");
      return;
    }

    check({
      mode: "lookup",
      substance: trimmed,
      activePrescriptions: activePrescriptions.map((p) => ({
        genericName: p.genericName,
      })),
    });
  }

  function handleClear() {
    setQuery("");
    setLocalError(null);
    reset();
  }

  const displayError = localError ?? error;
  const showResults = isLoading || data || displayError;

  // Group interactions by medication name
  function groupByMedication(interactions: InteractionItem[]) {
    const groups = new Map<string, InteractionItem[]>();
    for (const item of interactions) {
      const existing = groups.get(item.medication);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(item.medication, [item]);
      }
    }
    return Array.from(groups.entries());
  }

  const hasSignificantInteractions =
    data &&
    data.interactions.length > 0 &&
    data.interactions.some((i) => i.severity !== "OK");

  return (
    <>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 pr-9 h-9 text-sm"
          placeholder="Check interaction... (e.g., ibuprofen)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        {query && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onClick={handleClear}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            {isLoading && (
              <div className="flex items-center justify-center p-4 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">
                  Checking interactions...
                </span>
              </div>
            )}

            {displayError && !isLoading && (
              <div className="p-3 border border-red-200 dark:border-red-900 rounded-md text-sm text-red-600 dark:text-red-400">
                {displayError}
              </div>
            )}

            {data && !isLoading && (
              <div>
                {!hasSignificantInteractions ? (
                  <div className="p-3 border border-green-200 dark:border-green-900 rounded-md flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700 dark:text-green-400">
                      No significant interactions found
                    </span>
                  </div>
                ) : (
                  <div>
                    {groupByMedication(data.interactions).map(
                      ([medicationName, interactions]) => (
                        <div
                          key={medicationName}
                          className="border rounded-md p-3 mb-2"
                        >
                          <p className="text-xs font-semibold mb-1.5">
                            {query.trim()} vs {medicationName}
                          </p>
                          {interactions.map((interaction, idx) => {
                            if (interaction.severity === "AVOID") {
                              return (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 mb-1"
                                >
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] shrink-0"
                                  >
                                    AVOID
                                  </Badge>
                                  <span className="text-xs">
                                    {interaction.description}
                                  </span>
                                </div>
                              );
                            }
                            if (interaction.severity === "CAUTION") {
                              return (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 mb-1"
                                >
                                  <Badge className="text-[10px] shrink-0 bg-amber-500 hover:bg-amber-600 text-white">
                                    CAUTION
                                  </Badge>
                                  <span className="text-xs">
                                    {interaction.description}
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={idx}
                                className="flex items-start gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/30 mb-1"
                              >
                                <Badge
                                  variant="outline"
                                  className="text-[10px] shrink-0 text-green-600 border-green-300"
                                >
                                  OK
                                </Badge>
                                <span className="text-xs">
                                  {interaction.description}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                )}

                {data.summary && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    {data.summary}
                  </p>
                )}
                {data.drugClass && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Drug class: {data.drugClass}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
