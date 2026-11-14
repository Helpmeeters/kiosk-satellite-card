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

/** Arguments for esphome.<node>_vs_start_timer. Hours, minutes, and seconds are non-negative integers. */
export interface TimerStart {
  name: string;
  hours: number;
  minutes: number;
  seconds: number;
}

/** The host calls the device's vs_start_timer service with this payload. */
export type TimerStartHandler = (start: TimerStart) => void;

const START_FIELDS = ["name", "hours", "minutes", "seconds"] as const;

/**
 * Stem of assist_satellite.{stem} or assist_satellite.{stem}_assist_satellite.
 * Used to pick that device's ESPHome timer service.
 */
export function assistStem(entityId: string | undefined): string | undefined {
  const prefix = "assist_satellite.";
  if (!entityId || !entityId.startsWith(prefix)) return undefined;
  let stem = entityId.slice(prefix.length);
  const suffix = "_assist_satellite";
  if (stem.endsWith(suffix)) stem = stem.slice(0, -suffix.length);
  return stem || undefined;
}

/**
 * The ESPHome service that starts a timer on this satellite, such as
 * `ks_updoot_vs_start_timer`. The name has to end at this device's stem and
 * the service has to take name, hours, minutes, and seconds. `updoot` does
 * not match `ks_updoot2_vs_start_timer`.
 */
export function timerStartService(
  services: { esphome?: Record<string, unknown> } | undefined,
  stem: string | undefined,
): string | undefined {
  const domain = services?.esphome;
  if (!domain || !stem) return undefined;
  const action = "vs_start_timer";
  const exact = `${stem}_${action}`;
  const suffix = `_${stem}_${action}`;
  const matches = Object.keys(domain).filter((name) => {
    if (name !== exact && !name.endsWith(suffix)) return false;
    return hasStartFields(domain[name]);
  });
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return matches[0];
}

/**
 * A duration the start service can take. An empty label becomes "Timer".
 * All-zero and non-numeric durations are rejected.
 */
export function timerStartData(input: { name: string; hours: number; minutes: number; seconds: number }): TimerStart | undefined {
  const hours = whole(input.hours);
  const minutes = whole(input.minutes);
  const seconds = whole(input.seconds);
  if (hours + minutes + seconds <= 0) return undefined;
  const name = input.name.trim() || "Timer";
  return { name, hours, minutes, seconds };
}

function hasStartFields(spec: unknown): boolean {
  if (!spec || typeof spec !== "object") return false;
  const fields = (spec as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object") return false;
  return START_FIELDS.every((name) => Object.prototype.hasOwnProperty.call(fields, name));
}

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

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
.rd-timers,
.rd-timers * {
  box-sizing: border-box;
}
.rd-timers {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 16px 16px 18px;
  color: var(--primary-text-color);
}
.rd-timers-label {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--secondary-text-color);
}
.rd-timers-kicker,
.rd-timers-detail,
.rd-timers-field-label {
  margin: 0;
  color: var(--secondary-text-color);
  font-size: 0.95rem;
  line-height: 1.35;
}
.rd-timers-headline {
  margin: 2px 0 0;
  color: var(--primary-text-color);
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.rd-timers-headline-next {
  font-size: 1.6rem;
}
.rd-timers-headline-empty {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--secondary-text-color);
}
.rd-timers-mute {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
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
.rd-timers-add {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 52px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--secondary-text-color);
  font: inherit;
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.15;
  text-align: left;
  cursor: pointer;
}
.rd-timers-dialog {
  display: block;
  margin-top: 8px;
  color: var(--primary-text-color);
}
.rd-timers-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}
.rd-timers-dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.1px;
}
.rd-timers-duration {
  display: flex;
  gap: 8px;
}
.rd-timers-field {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.rd-timers-input {
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  color: var(--primary-text-color);
  font: inherit;
}
.rd-timers-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rd-timers-button {
  border: none;
  color: inherit;
  background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
  cursor: pointer;
  font: inherit;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
}
.rd-timers-button-primary {
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
}
.rd-timers-error {
  margin: 0;
  color: var(--error-color, #ba1a1a);
  font-size: 0.95rem;
  line-height: 1.35;
}
.rd-timers [hidden] {
  display: none !important;
}
`;

export function renderTimers(
  parent: HTMLElement,
  view: TimersView,
  onMute?: TimerMuteChange,
  onStart?: TimerStartHandler,
): void {
  const existing = sectionOf(parent);
  if (existing && dialogOpen(existing)) {
    paintTimers(existing, view);
    return;
  }
  const root = document.createElement("section");
  root.className = "rd-timers";
  root.setAttribute("aria-label", "Timers");
  root.append(text("h3", "rd-timers-label", "Timers"));
  const kicker = text("p", "rd-timers-kicker", "Next");
  root.append(kicker);
  root.append(text("p", "rd-timers-headline", ""));
  root.append(text("p", "rd-timers-detail", ""));
  if (view.mute) root.append(muteRow(view.mute, onMute));
  if (onStart) root.append(addControl(onStart));
  paintTimers(root, view);
  parent.replaceChildren(root);
}

function sectionOf(parent: HTMLElement): HTMLElement | undefined {
  for (const child of parent.children) {
    if (hasClass(child as HTMLElement, "rd-timers")) return child as HTMLElement;
  }
  return undefined;
}

function dialogOpen(root: HTMLElement): boolean {
  const dialog = findClass(root, "rd-timers-dialog");
  return Boolean(dialog && dialog.hidden === false);
}

function paintTimers(root: HTMLElement, view: TimersView): void {
  const headline = findClass(root, "rd-timers-headline");
  if (headline) {
    headline.textContent = view.headline;
    toggleClass(headline, "rd-timers-headline-next", Boolean(view.next?.text));
    toggleClass(headline, "rd-timers-headline-empty", view.headline === "No timers");
  }
  const kicker = findClass(root, "rd-timers-kicker");
  if (kicker) kicker.hidden = !view.next?.text;
  const detail = findClass(root, "rd-timers-detail");
  if (detail) {
    detail.textContent = view.detail ?? "";
    detail.hidden = !view.detail;
  }
  if (!view.mute) return;
  const button = findClass(root, "rd-timers-switch");
  if (button) paintSwitch(button, view.mute.on);
}

function addControl(onStart: TimerStartHandler): HTMLElement {
  const dialog = document.createElement("ha-card");
  dialog.className = "rd-timers-dialog";
  dialog.hidden = true;
  const body = document.createElement("div");
  body.className = "rd-timers-card";
  const title = text("p", "rd-timers-dialog-title", "Add timer");
  const label = field("Label", "rd-timers-name", "text");
  const duration = document.createElement("div");
  duration.className = "rd-timers-duration";
  duration.append(field("Hours", "rd-timers-hours", "number"), field("Minutes", "rd-timers-minutes", "number"), field("Seconds", "rd-timers-seconds", "number"));
  const error = text("p", "rd-timers-error", "");
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "rd-timers-actions";
  const set = button("Set", "rd-timers-button rd-timers-button-primary rd-timers-set", () => submitTimer(dialog, error, onStart));
  const close = button("Close", "rd-timers-button rd-timers-close", () => closeDialog(dialog));
  actions.append(set, close);
  body.append(title, label, duration, error, actions);
  dialog.append(body);
  const add = button("Add", "rd-timers-add", () => openDialog(dialog));
  const wrap = document.createElement("div");
  wrap.className = "rd-timers-add-wrap";
  wrap.append(add, dialog);
  return wrap;
}

function submitTimer(dialog: HTMLElement, error: HTMLElement, onStart: TimerStartHandler): void {
  const start = timerStartData({
    name: valueOf(findClass(dialog, "rd-timers-name")),
    hours: numberOf(findClass(dialog, "rd-timers-hours")),
    minutes: numberOf(findClass(dialog, "rd-timers-minutes")),
    seconds: numberOf(findClass(dialog, "rd-timers-seconds")),
  });
  if (!start) {
    error.textContent = "Time is required";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  onStart(start);
  clearTimerForm(dialog);
  closeDialog(dialog);
}

function field(caption: string, className: string, type: string): HTMLElement {
  const label = document.createElement("label");
  label.className = "rd-timers-field";
  const textNode = text("span", "rd-timers-field-label", caption);
  const input = document.createElement("input");
  input.type = type;
  input.className = `rd-timers-input ${className}`;
  if (type === "number") {
    input.min = "0";
    input.step = "1";
    input.value = "0";
  }
  label.append(textNode, input);
  return label;
}

function button(caption: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = caption;
  node.addEventListener("click", onClick);
  return node;
}

function openDialog(dialog: HTMLElement): void {
  dialog.hidden = false;
}

function closeDialog(dialog: HTMLElement): void {
  dialog.hidden = true;
}

function clearTimerForm(dialog: HTMLElement): void {
  const name = findClass(dialog, "rd-timers-name");
  if (name && "value" in name) (name as HTMLInputElement).value = "";
  for (const className of ["rd-timers-hours", "rd-timers-minutes", "rd-timers-seconds"]) {
    const input = findClass(dialog, className);
    if (input && "value" in input) (input as HTMLInputElement).value = "0";
  }
}

function valueOf(node: HTMLElement | undefined): string {
  if (!node || !("value" in node)) return "";
  const value = (node as HTMLInputElement).value;
  return typeof value === "string" ? value : "";
}

function numberOf(node: HTMLElement | undefined): number {
  const numeric = Number(valueOf(node));
  return Number.isFinite(numeric) ? numeric : 0;
}

function findClass(root: HTMLElement, className: string): HTMLElement | undefined {
  if (hasClass(root, className)) return root;
  for (const child of root.children) {
    const found = findClass(child as HTMLElement, className);
    if (found) return found;
  }
  return undefined;
}

function hasClass(element: HTMLElement, className: string): boolean {
  return element.className.split(/\s+/).includes(className);
}

function toggleClass(element: HTMLElement, className: string, on: boolean): void {
  const names = element.className.split(/\s+/).filter((name) => name && name !== className);
  if (on) names.push(className);
  element.className = names.join(" ");
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

function text(tag: "h3" | "p" | "span", className: string, value: string): HTMLElement {
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

function paintSwitch(button: HTMLElement, on: boolean): void {
  button.className = on ? "rd-timers-switch rd-timers-switch-on" : "rd-timers-switch";
  button.setAttribute("aria-checked", on ? "true" : "false");
}
