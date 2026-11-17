import type { SatelliteModel, SensorLine } from "./model";
import { formatClock, svgIcon, type TimeLocale } from "./redisplay";

const ICON_ADD = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const ICON_DELETE =
  "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_VOLUME_ON =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3a5 5 0 0 1-2.5 4.03V7.97A5 5 0 0 1 16.5 12zM14 3.23v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77z";
const ICON_VOLUME_OFF =
  "M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z";

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

export interface TimerEntry {
  timerId: string;
  name: string;
  totalSeconds: number;
  secondsLeft: number;
  isActive: boolean;
  endsAt?: string;
  finished: boolean;
}

export interface TimerList {
  error?: string;
  timers?: TimerEntry[];
}

export interface TimerItem {
  timerId: string;
  /** Clock time when active with endsAt, remaining duration when paused, or "Finished". */
  displayTime: string;
  name: string;
  /** Remaining duration or paused state. */
  detail: string;
}

export interface TimersView {
  /** Large line: the next timer, otherwise the count, otherwise "No timers". */
  headline: string;
  /** Quieter count under a scheduled next timer. */
  detail?: string;
  count?: TimerCount;
  next?: TimerFact;
  mute?: TimerMute;
  items?: TimerItem[];
  error?: string;
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

/** The host calls the device's vs_cancel_timer service with this timer_id. */
export type TimerCancelHandler = (timerId: string) => void;

const START_FIELDS = ["name", "hours", "minutes", "seconds"] as const;
const CANCEL_FIELDS = ["timer_id"] as const;

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
  return findTimerService(services, stem, "vs_start_timer", START_FIELDS);
}

/** The ESPHome service that lists active/paused timers on this satellite. */
export function timerListService(
  services: { esphome?: Record<string, unknown> } | undefined,
  stem: string | undefined,
): string | undefined {
  return findTimerService(services, stem, "vs_list_timers");
}

/** The ESPHome service that cancels/deletes one timer by `timer_id` on this satellite. */
export function timerCancelService(
  services: { esphome?: Record<string, unknown> } | undefined,
  stem: string | undefined,
): string | undefined {
  return findTimerService(services, stem, "vs_cancel_timer", CANCEL_FIELDS);
}

function findTimerService(
  services: { esphome?: Record<string, unknown> } | undefined,
  stem: string | undefined,
  action: string,
  requiredFields?: readonly string[],
): string | undefined {
  const domain = services?.esphome;
  if (!domain || !stem) return undefined;
  const exact = `${stem}_${action}`;
  const suffix = `_${stem}_${action}`;
  const matches = Object.keys(domain).filter((name) => {
    if (name !== exact && !name.endsWith(suffix)) return false;
    return requiredFields ? hasFields(domain[name], requiredFields) : true;
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

function hasFields(spec: unknown, requiredFields: readonly string[]): boolean {
  if (!spec || typeof spec !== "object") return false;
  const fields = (spec as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object") return false;
  return requiredFields.every((name) => Object.prototype.hasOwnProperty.call(fields, name));
}

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

const EMPTY = new Set(["", "unknown", "unavailable", "none", "null"]);
const COUNT_NAME = "timers";
const NEXT_NAME = "next timer";
const MUTE_NAME = "mute timers";

/** Parse a `vs_list_timers` response payload (unwrapping `response` or `service_response`). */
export function timerListFromPayload(result: unknown, previous?: TimerList): TimerList {
  const record = asRecord(result);
  const next: TimerList = {};
  if (previous?.timers) next.timers = previous.timers;
  const unwrapped = unwrapTimerPayload(record);
  const list = unwrapped && Array.isArray(unwrapped.timers) ? unwrapped.timers : undefined;
  if (list) {
    next.timers = list.map(parseTimerEntry).filter((item): item is TimerEntry => item !== undefined);
  }
  return next;
}

/** Keep the previous timer list when `vs_list_timers` throws, and surface the error. */
export function timerListFromFailure(error: unknown, previous?: TimerList): TimerList {
  const next: TimerList = { error: timerFailureText(error) };
  if (previous?.timers) next.timers = previous.timers;
  return next;
}

function unwrapTimerPayload(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined;
  for (const key of ["response", "service_response"]) {
    const nested = asRecord(record[key]);
    if (nested && Array.isArray(nested.timers)) return nested;
  }
  return record;
}

function parseTimerEntry(value: unknown): TimerEntry | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const rawId = typeof record.timer_id === "string" ? record.timer_id : typeof record.id === "string" ? record.id : "";
  const timerId = rawId.trim();
  if (!timerId) return undefined;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Timer";
  const totalSeconds = typeof record.total_seconds === "number" && Number.isFinite(record.total_seconds) ? Math.max(0, record.total_seconds) : 0;
  const secondsLeft = typeof record.seconds_left === "number" && Number.isFinite(record.seconds_left) ? Math.max(0, record.seconds_left) : 0;
  const isActive = record.is_active !== false;
  const endsAt = typeof record.ends_at === "string" && record.ends_at.trim() ? record.ends_at.trim() : undefined;
  const finished = record.finished === true;
  return { timerId, name, totalSeconds, secondsLeft, isActive, endsAt, finished };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function timerFailureText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const record = asRecord(error);
  if (record && typeof record.message === "string" && record.message) return record.message;
  return String(error);
}

/**
 * Voice timer sensors, plus the mute-timers switch when those sensors exist.
 * A device with no timer entities has no section, even if the switch is present.
 */
export function buildTimers(
  model: SatelliteModel,
  locale?: TimeLocale,
  list?: TimerList,
  nowMs = Date.now(),
): TimersView | undefined {
  if (model.timers.length === 0) return undefined;

  const countLine = model.timers.find((line) => normalize(line.name) === COUNT_NAME);
  const nextLine = model.timers.find((line) => normalize(line.name) === NEXT_NAME);
  const count = countLine ? countFact(countLine, locale) : undefined;
  const next = nextLine ? nextFact(nextLine, locale) : undefined;
  const shown = present(count, next, model.timers, locale);
  const muteLine = model.voiceSwitches.find((item) => normalize(item.name) === MUTE_NAME);

  const view: TimersView = { headline: shown.headline };
  if (shown.detail) view.detail = shown.detail;
  if (count) view.count = count;
  if (next) view.next = next;
  if (muteLine) view.mute = { entityId: muteLine.entityId, name: muteLine.name, on: muteLine.on };
  if (list?.timers && list.timers.length > 0) {
    view.items = list.timers.map((entry) => presentTimerItem(entry, nowMs));
  }
  if (list?.error) view.error = list.error;
  return view;
}

function presentTimerItem(entry: TimerEntry, nowMs: number): TimerItem {
  if (entry.finished) {
    return { timerId: entry.timerId, displayTime: "Finished", name: entry.name, detail: "" };
  }
  let seconds = entry.secondsLeft;
  if (entry.isActive && entry.endsAt) {
    const endsMs = Date.parse(entry.endsAt);
    if (Number.isFinite(endsMs)) {
      seconds = Math.max(0, Math.round((endsMs - nowMs) / 1000));
    }
  }
  return {
    timerId: entry.timerId,
    displayTime: formatTimerRemaining(seconds),
    name: entry.name,
    detail: entry.isActive ? "" : "Paused",
  };
}

export function formatTimerRemaining(totalSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
.rd-timers-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}
.rd-timers-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
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
.rd-timers-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rd-timers-item-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rd-timers-item-primary {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}
.rd-timers-headline {
  margin: 0;
  color: var(--primary-text-color);
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.rd-timers-headline-next {
  font-size: 1.5rem;
}
.rd-timers-headline-empty {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--secondary-text-color);
}
.rd-timers-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  color: var(--secondary-text-color);
  cursor: pointer;
}
.rd-timers-icon-button svg {
  width: 18px;
  height: 18px;
  display: block;
}
.rd-timers-switch-on {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
}
.rd-timers-icon-button-danger {
  color: var(--error-color, #ba1a1a);
}
.rd-timers-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rd-timers-rows:empty {
  display: none;
}
.rd-timers-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rd-timers-item-time {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.rd-timers-item-label,
.rd-timers-item-meta {
  margin: 0;
  color: var(--secondary-text-color);
  font-size: 0.95rem;
  line-height: 1.35;
}
.rd-timers-item-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  flex: 0 0 auto;
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
  onCancel?: TimerCancelHandler,
): void {
  const existing = sectionOf(parent);
  if (existing && dialogOpen(existing)) {
    paintTimers(existing, view, onCancel);
    return;
  }
  const root = document.createElement("section");
  root.className = "rd-timers";
  root.setAttribute("aria-label", "Timers");
  const head = document.createElement("div");
  head.className = "rd-timers-head";
  head.append(text("h3", "rd-timers-label", "Timers"));
  const dialog = onStart ? timerDialog(onStart) : undefined;
  if (view.mute || dialog) {
    const actions = document.createElement("div");
    actions.className = "rd-timers-head-actions";
    if (view.mute) actions.append(muteButton(view.mute, onMute));
    if (dialog) actions.append(addIconButton(dialog));
    head.append(actions);
  }
  root.append(head);

  const row = document.createElement("div");
  row.className = "rd-timers-row";
  const main = document.createElement("div");
  main.className = "rd-timers-item-main";
  const primary = document.createElement("div");
  primary.className = "rd-timers-item-primary";
  primary.append(text("span", "rd-timers-kicker", "Next"), text("span", "rd-timers-headline", ""));
  main.append(primary, text("p", "rd-timers-detail", ""));
  row.append(main);
  root.append(row);

  const rows = document.createElement("div");
  rows.className = "rd-timers-rows";
  root.append(rows);
  if (dialog) root.append(dialog);
  const listError = text("p", "rd-timers-error rd-timers-list-error", "");
  listError.hidden = true;
  root.append(listError);
  paintTimers(root, view, onCancel);
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

function paintTimers(root: HTMLElement, view: TimersView, onCancel?: TimerCancelHandler): void {
  const items = view.items ?? [];
  const summaryRow = findClass(root, "rd-timers-row");
  if (summaryRow) summaryRow.hidden = items.length > 0;
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
  const rows = findClass(root, "rd-timers-rows");
  if (rows) {
    rows.replaceChildren(...items.map((item) => timerItemRow(item, onCancel)));
  }
  const listError = findClass(root, "rd-timers-list-error");
  if (listError) {
    listError.textContent = view.error ?? "";
    listError.hidden = !view.error;
  }
  if (!view.mute) return;
  const button = findClass(root, "rd-timers-switch");
  if (button) paintSwitch(button, view.mute.on);
}

function timerItemRow(item: TimerItem, onCancel?: TimerCancelHandler): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-timers-item";
  const main = document.createElement("div");
  main.className = "rd-timers-item-main";
  const primary = document.createElement("div");
  primary.className = "rd-timers-item-primary";
  primary.append(text("span", "rd-timers-item-time", item.displayTime));
  if (item.name) primary.append(text("span", "rd-timers-item-label", item.name));
  main.append(primary);
  if (item.detail) main.append(text("p", "rd-timers-item-meta", item.detail));
  row.append(main);
  if (onCancel) {
    const actions = document.createElement("div");
    actions.className = "rd-timers-item-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "rd-timers-icon-button rd-timers-icon-button-danger rd-timers-delete";
    del.setAttribute("aria-label", "Delete");
    del.setAttribute("title", "Delete");
    del.setAttribute("data-timer-id", item.timerId);
    del.append(svgIcon(ICON_DELETE));
    del.addEventListener("click", () => onCancel(item.timerId));
    actions.append(del);
    row.append(actions);
  }
  return row;
}

function timerDialog(onStart: TimerStartHandler): HTMLElement {
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
  return dialog;
}

function addIconButton(dialog: HTMLElement): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "rd-timers-icon-button rd-timers-add";
  node.setAttribute("aria-label", "Add timer");
  node.setAttribute("title", "Add timer");
  node.append(svgIcon(ICON_ADD));
  node.addEventListener("click", () => openDialog(dialog));
  return node;
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
    input.placeholder = "0";
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
    if (input && "value" in input) (input as HTMLInputElement).value = "";
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
  const raw = typeof element.className === "string" ? element.className : (element.getAttribute("class") ?? "");
  return raw.split(/\s+/).includes(className);
}

function toggleClass(element: HTMLElement, className: string, on: boolean): void {
  const raw = typeof element.className === "string" ? element.className : (element.getAttribute("class") ?? "");
  const names = raw.split(/\s+/).filter((name) => name && name !== className);
  if (on) names.push(className);
  const next = names.join(" ");
  if (typeof element.className === "string") element.className = next;
  else element.setAttribute("class", next);
}

function present(
  count: TimerCount | undefined,
  next: TimerFact | undefined,
  timers: readonly SensorLine[],
  locale?: TimeLocale,
): { headline: string; detail?: string } {
  if (next?.text) {
    if (count && count.value !== null && count.value > 0) return { headline: next.text, detail: count.text };
    return { headline: next.text };
  }
  if (count && count.text && count.value !== 0) return { headline: count.text };
  const extra = timers.find((line) => {
    const name = normalize(line.name);
    return name !== COUNT_NAME && name !== NEXT_NAME && Boolean(reading(line, locale));
  });
  const extraText = extra ? reading(extra, locale) : undefined;
  if (extra && extraText) return { headline: extraText, detail: extra.name };
  return { headline: count?.text || "No timers" };
}

function countFact(line: SensorLine, locale?: TimeLocale): TimerCount {
  const value = countValue(line.state);
  const text = value === null ? (reading(line, locale) ?? "") : countPhrase(value);
  return { entityId: line.entityId, name: line.name, text, value };
}

function nextFact(line: SensorLine, locale?: TimeLocale): TimerFact {
  return { entityId: line.entityId, name: line.name, text: reading(line, locale) ?? "" };
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

function reading(line: SensorLine, locale?: TimeLocale): string | undefined {
  const state = meaningful(line.state);
  if (!state) return undefined;
  const clock = formatClock(state, locale);
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

function muteButton(mute: TimerMute, onMute: TimerMuteChange | undefined): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", mute.name);
  button.setAttribute("title", mute.name);
  button.setAttribute("data-entity", mute.entityId);
  paintSwitch(button, mute.on);
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") !== "true";
    paintSwitch(button, on);
    onMute?.(mute.entityId, on);
  });
  return button;
}

function paintSwitch(button: HTMLElement, on: boolean): void {
  button.className = on ? "rd-timers-icon-button rd-timers-switch rd-timers-switch-on" : "rd-timers-icon-button rd-timers-switch";
  button.setAttribute("aria-checked", on ? "true" : "false");
  button.replaceChildren(svgIcon(on ? ICON_VOLUME_OFF : ICON_VOLUME_ON));
}
