"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Variant A, "Phone desktop": camp-404's phone home screen. A wordmark on the
// CRT desktop, then big pixel icons in labelled groups; an icon opens its
// real card full screen in an OS window (magenta title bar, Home and Close);
// the bottom bar holds Home, Open windows, Today and the clock; Today is a
// sheet of block bars. Nothing on the wallpaper moves but the beam.

import { useState } from "react";
import { useAuthGate } from "@/components/auth-guard";
import {
  BigIcon,
  BottomBar,
  GroupLabel,
  LINKS,
  OsDesktop,
  PhoneSheet,
  PhoneWindow,
  PROGRAMS,
  ProgramBody,
  Surface,
  TodayBody,
  WindowList,
  Wordmark,
  dayLabel,
  fmt,
  useMinute,
  useToday,
  useWindows,
  type ProgramId,
} from "@/app/_prototype-os/os-kit";

export function VariantA() {
  const w = useWindows();
  const [sheet, setSheet] = useState<"today" | "windows" | null>(null);
  const showVoice = useAuthGate();
  const today = useToday();
  const now = useMinute();
  const covered = w.front !== null || sheet !== null;

  const open = (id: ProgramId) => {
    setSheet(null);
    w.show(id);
  };

  const groups: { label: string; items: ProgramId[] }[] = [
    { label: "Log", items: ["water", "food", "bp", "weight", "bathroom"] },
    { label: "Look back", items: ["week"] },
  ];

  return (
    <OsDesktop label="Intake home screen">
      <Surface paused={covered} />
      <div
        inert={covered || undefined}
        className="absolute inset-x-0 top-0 bottom-(--os-bar-h) select-none overflow-y-auto overscroll-contain"
      >
        <div data-os-paused={covered || undefined} className="pointer-events-none relative flex flex-col items-center gap-2 pt-7">
          <Wordmark text="INTAKE" size="clamp(2.75rem, 15vw, 4.25rem)" />
          <p className="os-chromatic os-mono px-4 text-center text-[10px] uppercase tracking-[0.3em] text-(--os-fg)">
            {now ? dayLabel(now) : " "} · {fmt(today.water.value)} ml so far
          </p>
        </div>
        <div className="relative mx-auto flex max-w-lg flex-col gap-5 px-3 pb-6 pt-6">
          {groups.map((g) => (
            <nav key={g.label} aria-label={g.label}>
              <GroupLabel>{g.label}</GroupLabel>
              <ul className="grid grid-cols-3 gap-x-1 gap-y-2 min-[380px]:grid-cols-4">
                {g.items.map((id) => (
                  <li key={id}>
                    <BigIcon
                      label={PROGRAMS[id].label}
                      icon={PROGRAMS[id].icon}
                      open={w.open.includes(id)}
                      onOpen={() => open(id)}
                    />
                  </li>
                ))}
                {g.label === "Look back" && (
                  <li>
                    <BigIcon label="History" icon="chart" href="/analytics" />
                  </li>
                )}
              </ul>
            </nav>
          ))}
          <nav aria-label="More">
            <GroupLabel>More</GroupLabel>
            <ul className="grid grid-cols-3 gap-x-1 gap-y-2 min-[380px]:grid-cols-4">
              {LINKS.filter((l) => l.label !== "History").map((l) => (
                <li key={l.href}>
                  <BigIcon label={l.label} icon={l.icon} href={l.href} />
                </li>
              ))}
              {showVoice && (
                <li>
                  <BigIcon
                    label={PROGRAMS.voice.label}
                    icon={PROGRAMS.voice.icon}
                    open={w.open.includes("voice")}
                    onOpen={() => open("voice")}
                  />
                </li>
              )}
            </ul>
          </nav>
        </div>
      </div>

      {/* Every open window stays mounted (a half-typed entry survives
          going Home); only the front one shows. */}
      {w.open.map((id) => (
        <PhoneWindow
          key={id}
          title={PROGRAMS[id].label}
          hidden={w.front !== id || sheet !== null}
          onBack={w.home}
          onClose={() => w.close(id)}
        >
          <ProgramBody id={id} onDone={() => w.close(id)} />
        </PhoneWindow>
      ))}

      {sheet === "today" && (
        <PhoneSheet title="Today" onClose={() => setSheet(null)}>
          <TodayBody today={today} />
        </PhoneSheet>
      )}
      {sheet === "windows" && (
        <PhoneSheet title="Open windows" onClose={() => setSheet(null)}>
          <WindowList ids={w.open} current={w.front} onPick={open} onClose={w.close} />
        </PhoneSheet>
      )}

      <BottomBar
        openCount={w.open.length}
        windowsOpen={sheet === "windows"}
        todayOpen={sheet === "today"}
        onHome={() => {
          setSheet(null);
          w.home();
        }}
        onWindows={() => setSheet((s) => (s === "windows" ? null : "windows"))}
        onToday={() => setSheet((s) => (s === "today" ? null : "today"))}
      />
    </OsDesktop>
  );
}
