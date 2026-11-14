import type { SatelliteModel, SensorLine } from "./model";
import { formatClock } from "./redisplay";

export interface TimerFact {
  entityId: string;
  name: string;
  /** Display text. Empty when the sensor has no usable reading. */
  text: string;
}

export interface TimerCount extends TimerFact {
  /** Parsed count. Null when the sensor is unknown, unavailable, or not a number. */
  value: number | null;
}

export interface TimerMute {
  entityId: string;
  name: string;
  on: boolean;
}

export interface TimersView {
  /** Large line: the next timer, otherwise the count, otherwise "No timers". */
  headline: string;
  /** Quieter count under a scheduled next timer. */
  detail?: string;
  count?: TimerCount;
  next?: TimerFact;
  mute?: TimerMute;
}

/** Next on/off state for the mute-timers switch. The host calls switch.turn_on or switch.turn_off. */
export type TimerMuteChange = (entityId: string, on: boolean) => void;

const EMPTY = new Set(["", "unknown", "unavailable", "none", "null"]);
const COUNT_NAME = "timers";
const NEXT_NAME = "next timer";
const MUTE_NAME = "mute timers";

/**
 * Voice timer sensors, plus the mute-timers switch when those sensors exist.
 * A device with no timer entities has no section, even if the switch is present.
 */
export function buildTimers(model: SatelliteModel): TimersView | undefined {
  if (model.timers.length === 0) return undefined;

  const countLine = model.timers.find((line) => normalize(line.name) === COUNT_NAME);
  const nextLine = model.timers.find((line) => normalize(line.name) === NEXT_NAME);
  const count = countLine ? countFact(countLine) : undefined;
  const next = nextLine ? nextFact(nextLine) : undefined;
  const shown = present(count, next, model.timers);
  const muteLine = model.voiceSwitches.find((item) => normalize(item.name) === MUTE_NAME);

  const view: TimersView = { headline: shown.headline };
  if (shown.detail) view.detail = shown.detail;
  if (count) view.count = count;
  if (next) view.next = next;
  if (muteLine) view.mute = { entityId: muteLine.entityId, name: muteLine.name, on: muteLine.on };
  return view;
}

export const timersCss = `
.rd-timers {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 16px 18px;
  color: var(--primary-text-color);
}
.rd-timers-label,
.rd-timers-detail {
  margin: 0;
  color: var(--secondary-text-color);
  font-size: 1.05rem;
  line-height: 1.35;
}
.rd-timers-headline {
  margin: 0;
  color: var(--primary-text-color);
  font-size: 2.4rem;
  font-weight: 500;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.rd-timers-mute {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--divider-color);
}
.rd-timers-mute-label {
  color: var(--primary-text-color);
  font-size: 1.05rem;
  line-height: 1.3;
}
.rd-timers-switch {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-text-color) 16%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.rd-timers-switch-on {
  background: var(--primary-color);
}
.rd-timers-switch-knob {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--ha-card-background, var(--card-background-color, Canvas));
  transition: transform 160ms ease;
}
.rd-timers-switch-on .rd-timers-switch-knob {
  transform: translateX(20px);
}
`;

export function renderTimers(parent: HTMLElement, view: TimersView, onMute?: TimerMuteChange): void {
  const root = document.createElement("section");
  root.className = "rd-timers";
  root.setAttribute("aria-label", "Timers");
  root.append(text("p", "rd-timers-label", "Timers"));
  root.append(text("p", "rd-timers-headline", view.headline));
  if (view.detail) root.append(text("p", "rd-timers-detail", view.detail));
  if (view.mute) root.append(muteRow(view.mute, onMute));
  parent.replaceChildren(root);
}

function present(
  count: TimerCount | undefined,
  next: TimerFact | undefined,
  timers: readonly SensorLine[],
): { headline: string; detail?: string } {
  if (next?.text) {
    if (count && count.value !== null && count.value > 0) return { headline: next.text, detail: count.text };
    return { headline: next.text };
  }
  if (count && count.text && count.value !== 0) return { headline: count.text };
  const extra = timers.find((line) => {
    const name = normalize(line.name);
    return name !== COUNT_NAME && name !== NEXT_NAME && Boolean(reading(line));
  });
  const extraText = extra ? reading(extra) : undefined;
  if (extra && extraText) return { headline: extraText, detail: extra.name };
  return { headline: count?.text || "No timers" };
}

function countFact(line: SensorLine): TimerCount {
  const value = countValue(line.state);
  const text = value === null ? (reading(line) ?? "") : countPhrase(value);
  return { entityId: line.entityId, name: line.name, text, value };
}

function nextFact(line: SensorLine): TimerFact {
  return { entityId: line.entityId, name: line.name, text: reading(line) ?? "" };
}

function countPhrase(value: number): string {
  if (value === 0) return "No timers";
  if (value === 1) return "1 timer";
  return `${value} timers`;
}

function countValue(state: string): number | null {
  const trimmed = state.trim();
  if (EMPTY.has(trimmed.toLowerCase())) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function reading(line: SensorLine): string | undefined {
  const state = meaningful(line.state);
  if (!state) return undefined;
  const clock = formatClock(state);
  if (clock) return clock;
  if (line.unit) return `${state} ${line.unit}`;
  return state;
}

function meaningful(state: string | undefined): string | undefined {
  if (typeof state !== "string") return undefined;
  const trimmed = state.trim();
  if (EMPTY.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function text(tag: "p" | "span", className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function muteRow(mute: TimerMute, onMute: TimerMuteChange | undefined): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-timers-mute";
  const label = text("span", "rd-timers-mute-label", mute.name);
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", mute.name);
  button.setAttribute("data-entity", mute.entityId);
  paintSwitch(button, mute.on);
  const knob = document.createElement("span");
  knob.className = "rd-timers-switch-knob";
  button.append(knob);
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") !== "true";
    paintSwitch(button, on);
    onMute?.(mute.entityId, on);
  });
  row.append(label, button);
  return row;
}

function paintSwitch(button: HTMLButtonElement, on: boolean): void {
  button.className = on ? "rd-timers-switch rd-timers-switch-on" : "rd-timers-switch";
  button.setAttribute("aria-checked", on ? "true" : "false");
}
