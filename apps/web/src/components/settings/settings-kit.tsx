"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { Switch } from "@intake/ui/switch";
import { SettingFieldMessage } from "@/components/settings/setting-field-message";
import { validateAndSave } from "@intake/core/settings";
import { cn } from "@/lib/utils";
import { settingsGroupStyle, type SettingsColor } from "@/components/settings/settings-groups";

/*
 * Ward Console settings building blocks, ported from the prototype's
 * settings sheet (ward-console-4.html): `.setsec` groups, `.flabel`,
 * `.help`, `.seg`, `.tog`, `.lim`, `.setrow`, `.sub3`, `.warnbox`,
 * `.plainbox` and `.hr`. Sharp corners, 1px rules.
 *
 * Colour: each group sets `--g` (its own colour) and re-points `--primary` /
 * `--ring` at it (see settings-groups.ts), so the header icon, the stripe,
 * the sub-headings, the selected segment, the switch on-state, the primary
 * button and the focus rings all take the group colour. Group-coloured text
 * only sits on the panel surface, where every colour passes AA in both themes.
 */

/** Muted field label (`.flabel`). */
export const flabelClass = "mb-1 block text-[0.8125rem] text-muted-foreground";
/** Muted help line (`.help`). */
export const helpClass = "text-[0.8125rem] text-muted-foreground";
/** Amber warning box (`.warnbox`). */
export const warnboxClass =
  "flex flex-col gap-2.5 border border-sodium bg-sodium/10 p-2.5 text-[0.8125rem] leading-[1.45]";
/** Plain inset box (`.plainbox`). */
export const plainboxClass =
  "flex flex-col gap-2.5 border border-line bg-background p-2.5 text-[0.8125rem]";
/** Outlined secondary button at a 44px target (`.btn`). */
export const btnClass = "h-11 border-muted-foreground";

/** A 1px horizontal rule (`.hr`). */
export function Rule() {
  return <div aria-hidden="true" className="h-px bg-line" />;
}

/**
 * Sub-heading inside a group (`.sub3`): a small mono caps label in the group
 * colour, with a hairline running to the right edge. `color` (a CSS colour)
 * overrides the group colour.
 */
export function SubHead({
  id,
  icon: Icon,
  color,
  children,
}: {
  id?: string;
  icon?: LucideIcon;
  color?: string;
  children: ReactNode;
}) {
  return (
    <h3
      id={id}
      data-settings-subhead=""
      className="flex items-center gap-2 pt-2 font-mono text-xs font-semibold uppercase leading-5 tracking-[0.08em] text-[color:var(--c,var(--g,currentColor))] after:h-px after:flex-1 after:bg-line after:content-['']"
      style={color ? ({ "--c": color } as CSSProperties) : undefined}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </h3>
  );
}

/**
 * A collapsible settings group (`.setsec`): a full-width 48px button with
 * the group's icon (in its colour), its title and a chevron; the body below
 * it while expanded, with a 3px stripe in the group colour down the left
 * edge. Several can be open at once.
 */
export function SetGroup({
  id,
  title,
  icon: Icon,
  color,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  color: SettingsColor;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `settings-group-${id}`;
  return (
    <section
      className={cn("border-t border-line", open && "shadow-[inset_3px_0_0_var(--g)]")}
      data-testid={`settings-group-${id}`}
      data-settings-color={color}
      style={settingsGroupStyle(color)}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-h-12 w-full items-center gap-2.5 px-3.5 text-left text-[0.9375rem] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-[color:var(--g)]" />
          {title}
          <ChevronDown
            aria-hidden="true"
            className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground", open && "rotate-180")}
          />
        </button>
      </h2>
      {open && (
        <div
          id={bodyId}
          className="flex flex-col gap-3 px-3.5 pb-4 pt-0.5 [&>[data-settings-subhead]:first-child]:pt-0 [&>div:first-child>[data-settings-subhead]:first-child]:pt-0"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * A segmented control (`.seg`): a radiogroup of joined buttons, the chosen
 * one filled with the group colour (ink outside a group).
 */
export function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
  full = false,
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  full?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("border border-muted-foreground", full ? "flex" : "inline-flex")}
    >
      {options.map(([v, text], i) => {
        const on = v === value;
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={cn(
              "min-h-11 px-3 text-[0.8125rem] font-medium focus-visible:outline-2 focus-visible:-outline-offset-4",
              i > 0 && "border-l border-muted-foreground",
              full && "flex-1",
              // The focus ring sits inside the button, so on the filled
              // segment it takes the text colour to stay visible.
              on
                ? "bg-primary font-semibold text-primary-foreground focus-visible:outline-primary-foreground"
                : "focus-visible:outline-ring",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A labelled switch row (`.tog`): the label and an optional muted line on
 * the left, the switch and its On/Off state on the right.
 */
export function Tog({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  testId,
}: {
  id?: string;
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const autoId = useId();
  const switchId = id ?? `tog-${autoId}`;
  const descId = `${switchId}-desc`;
  return (
    <div className="flex min-h-11 items-center gap-2.5 py-1" data-testid={testId}>
      <label htmlFor={switchId} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className="text-[0.9375rem]">{label}</span>
        {description && (
          <span id={descId} className="text-[0.8125rem] text-muted-foreground">
            {description}
          </span>
        )}
      </label>
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? descId : undefined}
      />
      <span
        aria-hidden="true"
        className={cn(
          "w-[2.25em] font-mono text-xs",
          // Ink, not the group colour: a row can sit on the darker inset
          // surface, where some group colours fall under AA as text.
          checked ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {checked ? "On" : "Off"}
      </span>
    </div>
  );
}

/**
 * A link row to a settings sub-page (`.setrow`): icon, title, summary and
 * a chevron. The icon takes the group colour unless `color` is given.
 */
export function SetRow({
  icon: Icon,
  color,
  title,
  summary,
  onClick,
}: {
  icon: LucideIcon;
  color?: string;
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-14 w-full grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-2.5 border border-line bg-background px-2.5 py-1.5 text-left hover:border-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      style={color ? ({ "--c": color } as CSSProperties) : undefined}
    >
      <Icon aria-hidden="true" className="h-5 w-5 text-[color:var(--c,var(--g,currentColor))]" />
      <span className="min-w-0">
        <b className="block text-[0.9375rem] font-semibold">{title}</b>
        <small className="block text-[0.8125rem] leading-[1.35] text-muted-foreground">{summary}</small>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

/**
 * A validated number field with its unit inside the box (`.unitfield`).
 * The typed text is saved on blur through `validateAndSave`: out-of-range
 * values are clamped and explained inline.
 */
export function UnitNumberField({
  id,
  label,
  unit,
  value,
  min,
  max,
  step,
  onSave,
  readStored,
  compact = false,
  inputMode = "numeric",
}: {
  id?: string;
  /** Accessible name. */
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onSave: (value: number) => void;
  /** What the store kept after a save (setters may round). */
  readStored: () => number;
  compact?: boolean;
  inputMode?: "numeric" | "decimal";
}) {
  const [text, setText] = useState(value.toString());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setText(value.toString());
  }, [value]);

  return (
    <div className="min-w-0">
      <div className="relative">
        <input
          id={id}
          type="number"
          aria-label={label}
          inputMode={inputMode}
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setText(e.target.value);
            setMessage(null);
          }}
          onBlur={() => setMessage(validateAndSave(text, min, max, value, onSave, setText, readStored))}
          className={cn(
            "w-full border border-muted-foreground bg-background pl-2.5 pr-10 font-mono text-[0.9375rem] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            compact ? "h-9" : "h-10",
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-[0.8125rem] text-muted-foreground"
        >
          {unit}
        </span>
      </div>
      <SettingFieldMessage message={message} />
    </div>
  );
}
