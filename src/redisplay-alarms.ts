import { alarmServiceCall, type SatelliteModel } from "./model";
import { formatDateClock, svgIcon, type TimeLocale } from "./redisplay";

const ICON_ADD = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const ICON_BELL_ON =
  "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z";
const ICON_BELL_OFF =
  "M20 18.69 7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z";
const ICON_DELETE =
  "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";

export type AlarmScriptAction = "list" | "set" | "turn_on" | "turn_off" | "delete";

export interface AlarmScriptExtra {
  time?: string;
  label?: string;
  days?: string[];
}

/** One alarm returned by script.kiosk_satellite_alarms. */
export interface RedisplayAlarmEntry {
  time: string;
  label: string;
  days: string[];
  enabled: boolean;
}

/** Last script result. Error is shown with the list; a later success clears it. */
export interface RedisplayAlarmList {
  error?: string;
  alarms?: RedisplayAlarmEntry[];
}

export interface RedisplayAlarmItem {
  time: string;
  /** Formatted time for display (respects HA time_format when provided). */
  displayTime?: string;
  label: string;
  days: string[];
  enabled: boolean;
  /** Time and label, the same line the control card shows. */
  summary: string;
  /** Weekdays, when repeating. */
  detail: string;
  action: "turn_on" | "turn_off";
  /** Always false; rows are sorted chronologically without next emphasis. */
  next: boolean;
}

export interface RedisplayAlarmsView {
  /** Device name passed as `kiosk` to script.kiosk_satellite_alarms. */
  kioskName: string;
  /** Formatted next alarm, or "None" when that sensor has no time. */
  nextAlarm?: string;
  /** Formatted snoozed-until time. Absent when the sensor has no timestamp. */
  snoozedUntil?: string;
  ringing: boolean;
  /** The device has a ringing sensor or a snooze/stop button. */
  ringingControls: boolean;
  snoozeId?: string;
  stopId?: string;
  script: boolean;
  items: RedisplayAlarmItem[];
  error?: string;
}

export interface RedisplayAlarmsCallbacks {
  /** Press the device's Snooze or Stop button. */
  onPress: (entityId: string) => void;
  /** list, set, turn_on, turn_off, or delete. Pair with redisplayAlarmServiceCall. */
  onScript: (action: AlarmScriptAction, extra?: AlarmScriptExtra) => void;
  /** Validation text. "Time is required" when Set is used with an empty time. */
  onError: (message: string) => void;
}

const DAYS: ReadonlyArray<readonly [string, string]> = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

/** Display styles for the alarms section. Every selector starts with `.rd-alarms`. */
export const redisplayAlarmsCss = `
.rd-alarms,
.rd-alarms * {
  box-sizing: border-box;
}
.rd-alarms {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
  padding: 16px 16px 18px;
  border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.35));
  color: var(--primary-text-color);
}
.rd-alarms-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}
.rd-alarms-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.rd-alarms-heading {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--secondary-text-color);
}
.rd-alarms-kicker,
.rd-alarms-meta,
.rd-alarms-snoozed,
.rd-alarms-item-label,
.rd-alarms-field-label {
  margin: 0;
  color: var(--secondary-text-color);
  font-size: 0.95rem;
  line-height: 1.35;
}
.rd-alarms-clock {
  margin: 2px 0 0;
  font-size: 1.5rem;
  font-weight: 500;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.rd-alarms-clock-empty {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--secondary-text-color);
}
.rd-alarms-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--error-color, #ba1a1a) 16%, transparent);
}
.rd-alarms-banner-label {
  margin: 0;
  font-weight: 600;
  color: var(--error-color, #ba1a1a);
}
.rd-alarms-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  flex: 0 0 auto;
}
.rd-alarms-button {
  border: none;
  color: inherit;
  background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
  cursor: pointer;
  font: inherit;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
}
.rd-alarms-button-primary {
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
}
.rd-alarms-button-danger {
  color: var(--error-color, #ba1a1a);
}
.rd-alarms-icon-button {
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
.rd-alarms-icon-button svg {
  width: 18px;
  height: 18px;
  display: block;
}
.rd-alarms-icon-button-active {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
}
.rd-alarms-icon-button-danger {
  color: var(--error-color, #ba1a1a);
}
.rd-alarms-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rd-alarms-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rd-alarms-rows:empty {
  display: none;
}
.rd-alarms-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rd-alarms-item-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rd-alarms-item-primary {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}
.rd-alarms-item-off .rd-alarms-item-time,
.rd-alarms-item-off .rd-alarms-item-label {
  color: var(--secondary-text-color);
}
.rd-alarms-dialog {
  display: block;
  margin-top: 8px;
  color: var(--primary-text-color);
}
.rd-alarms-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}
.rd-alarms-dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.1px;
}
.rd-alarms-item-time {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.rd-alarms-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rd-alarms-input {
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  color: var(--primary-text-color);
  font: inherit;
}
.rd-alarms-days {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rd-alarms-day {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  color: var(--primary-text-color);
}
.rd-alarms-day-input {
  margin: 0;
  accent-color: var(--primary-color);
}
.rd-alarms-error {
  margin: 0;
  color: var(--error-color, #ba1a1a);
  font-size: 0.95rem;
  line-height: 1.35;
}
.rd-alarms [hidden] {
  display: none !important;
}
`;

const callbacksFor = new WeakMap<HTMLElement, RedisplayAlarmsCallbacks>();

/**
 * Alarms section for one satellite. Undefined when the device has no alarm
 * entities and script.kiosk_satellite_alarms is not available.
 * ISO timestamps render as a clock and a short date. The list is included
 * only while the script is available.
 */
export function buildRedisplayAlarms(
  model: SatelliteModel,
  list?: RedisplayAlarmList,
  locale?: TimeLocale,
): RedisplayAlarmsView | undefined {
  const alarms = model.alarms;
  const hasSensors = Boolean(
    alarms.nextAlarmId || alarms.snoozedUntilId || alarms.ringingId || alarms.snoozeId || alarms.stopId,
  );
  if (!hasSensors && !alarms.scriptAvailable) return undefined;

  const script = alarms.scriptAvailable;
  const view: RedisplayAlarmsView = {
    kioskName: alarms.kioskName,
    ringing: alarms.ringing,
    ringingControls: Boolean(alarms.ringingId || alarms.snoozeId || alarms.stopId),
    script,
    items: script
      ? withSensorAlarm(orderAlarms(list?.alarms ?? [], locale), alarms.nextAlarmId ? alarms.nextAlarm : undefined, locale)
      : [],
  };
  if (alarms.nextAlarmId) view.nextAlarm = nextAlarmText(alarms.nextAlarm, locale);
  const snoozed = alarms.snoozedUntilId ? formatAlarmStamp(alarms.snoozedUntil, locale) : undefined;
  if (snoozed) view.snoozedUntil = snoozed;
  if (alarms.snoozeId) view.snoozeId = alarms.snoozeId;
  if (alarms.stopId) view.stopId = alarms.stopId;
  if (script && list?.error) view.error = list.error;
  return view;
}

/** Clock and short date for an ISO alarm timestamp. Other states are undefined. */
export function formatAlarmStamp(state: string | undefined, locale?: TimeLocale): string | undefined {
  if (!state || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(state)) return undefined;
  const date = new Date(state);
  if (Number.isNaN(date.getTime())) return undefined;
  const time = formatDateClock(date, locale);
  const day = date.toLocaleDateString(locale?.language || undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${time} \u00b7 ${day}`;
}

/** Format a clock string like "07:00" or "19:30" according to the HA locale time_format. */
export function formatAlarmTime(time: string, locale?: TimeLocale): string {
  if (!locale || !time) return time;
  const minutes = clockMinutes(time);
  if (minutes === undefined) return time;
  const date = new Date(2026, 0, 1, Math.floor(minutes / 60), minutes % 60, 0, 0);
  return formatDateClock(date, locale);
}

/**
 * Apply a script response the way the control card does. A wrapped
 * `response` or `service_response` is unwrapped. `ok: false` surfaces
 * `error` or "Alarm request failed". A payload without a list leaves the
 * previous alarms in place and clears the error.
 */
export function alarmListFromPayload(result: unknown, previous?: RedisplayAlarmList): RedisplayAlarmList {
  const record = unwrapAlarmPayload(result);
  const next: RedisplayAlarmList = {};
  if (previous?.alarms) next.alarms = previous.alarms;
  if (record?.ok === false) {
    next.error = typeof record.error === "string" && record.error.trim() ? record.error : "Alarm request failed";
  }
  if (record) {
    const alarms = parseAlarmList(record);
    if (alarms) {
      next.alarms = alarms;
    } else {
      const single = parseAlarm(record.alarm);
      if (single && record.ok !== false) {
        next.alarms = applySingleAlarm(previous?.alarms ?? [], single, record.result);
      }
    }
  }
  return next;
}

/** A thrown script call. The previous alarm list stays; the message is the new error. */
export function alarmListFromFailure(error: unknown, previous?: RedisplayAlarmList): RedisplayAlarmList {
  const next: RedisplayAlarmList = { error: failureText(error) };
  if (previous?.alarms) next.alarms = previous.alarms;
  return next;
}

/** script.kiosk_satellite_alarms with `kiosk` set to the device name. */
export function redisplayAlarmServiceCall(
  kioskName: string,
  action: AlarmScriptAction,
  extra?: AlarmScriptExtra,
): ReturnType<typeof alarmServiceCall> {
  return alarmServiceCall(action, kioskName, extra);
}

/**
 * Fill `parent` with the alarms section. Later calls paint in place and keep
 * the add dialog. When the script is available, the first paint calls
 * `onScript("list")` once for this kiosk.
 */
export function renderRedisplayAlarms(
  parent: HTMLElement,
  view: RedisplayAlarmsView,
  callbacks: RedisplayAlarmsCallbacks,
): void {
  callbacksFor.set(parent, callbacks);
  const key = structureKey(view);
  let root = elementChild(parent);
  if (!root || root.dataset.rdAlarmsKey !== key || !root.classList.contains("rd-alarms")) {
    root = createSection(parent, view);
    root.dataset.rdAlarmsKey = key;
    parent.replaceChildren(root);
  }
  paintSection(parent, root, view);
  loadAlarmList(root, view, callbacks);
}

function structureKey(view: RedisplayAlarmsView): string {
  return [
    view.nextAlarm === undefined ? "" : "next",
    view.ringingControls ? "ring" : "",
    view.snoozeId ?? "",
    view.stopId ?? "",
    view.script ? "script" : "",
  ].join("|");
}

function loadAlarmList(root: HTMLElement, view: RedisplayAlarmsView, callbacks: RedisplayAlarmsCallbacks): void {
  if (!view.script) return;
  const token = `listed:${view.kioskName}`;
  if (root.dataset.rdAlarmsLoaded === token) return;
  root.dataset.rdAlarmsLoaded = token;
  callbacks.onScript("list");
}

function createSection(parent: HTMLElement, view: RedisplayAlarmsView): HTMLElement {
  const root = el("section", "rd-alarms");
  mark(root, "root");
  const head = el("div", "rd-alarms-head");
  const heading = el("h3", "rd-alarms-heading");
  heading.textContent = "Alarms";
  head.append(heading);
  const dialog = view.script ? addDialog(parent, root) : undefined;
  if (dialog) {
    const headActions = el("div", "rd-alarms-head-actions");
    headActions.append(addButton(dialog));
    head.append(headActions);
  }
  root.append(head);
  if (view.ringingControls) root.append(ringingBanner(parent, view));
  if (view.nextAlarm !== undefined) root.append(nextBlock());
  root.append(snoozedLine());
  if (dialog) {
    root.append(alarmList(), dialog, errorLine());
  }
  return root;
}

function ringingBanner(parent: HTMLElement, view: RedisplayAlarmsView): HTMLElement {
  const banner = el("div", "rd-alarms-banner");
  mark(banner, "banner");
  banner.hidden = !view.ringing;
  const label = el("p", "rd-alarms-banner-label");
  label.textContent = "Alarm ringing";
  const actions = el("div", "rd-alarms-actions");
  if (view.snoozeId) {
    const entityId = view.snoozeId;
    actions.append(actionButton("Snooze", "snooze", () => callbacksFor.get(parent)?.onPress(entityId)));
  }
  if (view.stopId) {
    const entityId = view.stopId;
    actions.append(actionButton("Stop", "stop", () => callbacksFor.get(parent)?.onPress(entityId)));
  }
  banner.append(label, actions);
  return banner;
}

function nextBlock(): HTMLElement {
  const block = el("div", "rd-alarms-next");
  mark(block, "next");
  const kicker = el("p", "rd-alarms-kicker");
  kicker.textContent = "Next alarm";
  const clock = el("p", "rd-alarms-clock");
  mark(clock, "clock");
  block.append(kicker, clock);
  return block;
}

function snoozedLine(): HTMLElement {
  const line = el("p", "rd-alarms-snoozed");
  mark(line, "snoozed");
  line.hidden = true;
  return line;
}

function alarmList(): HTMLElement {
  const list = el("div", "rd-alarms-list");
  mark(list, "items");
  const rows = el("div", "rd-alarms-rows");
  mark(rows, "rows");
  list.append(rows);
  return list;
}

function addButton(dialog: HTMLElement): HTMLButtonElement {
  const button = iconButton("Add alarm", "add", ICON_ADD, () => openDialog(dialog));
  button.className += " rd-alarms-add";
  return button;
}

function addDialog(parent: HTMLElement, section: HTMLElement): HTMLElement {
  const dialog = document.createElement("ha-card");
  dialog.className = "rd-alarms-dialog";
  mark(dialog, "dialog");
  dialog.hidden = true;
  const body = el("div", "rd-alarms-card");
  const title = el("p", "rd-alarms-dialog-title");
  title.textContent = "Add alarm";
  const error = el("p", "rd-alarms-error");
  mark(error, "dialog-error");
  error.hidden = true;
  const actions = el("div", "rd-alarms-actions");
  actions.append(
    actionButton("Set", "set", () => submitAlarm(parent, section, dialog), "primary"),
    actionButton("Close", "close", () => closeDialog(dialog)),
  );
  body.append(
    title,
    labeledInput("Time", "time", "text", "07:00"),
    labeledInput("Label", "label", "text"),
    dayRow(),
    error,
    actions,
  );
  dialog.append(body);
  return dialog;
}

function errorLine(): HTMLElement {
  const error = el("p", "rd-alarms-error");
  mark(error, "error");
  error.hidden = true;
  return error;
}

function labeledInput(caption: string, name: string, type: string, placeholder?: string): HTMLElement {
  const label = el("label", "rd-alarms-field");
  const text = el("span", "rd-alarms-field-label");
  text.textContent = caption;
  const input = document.createElement("input");
  input.type = type;
  input.className = "rd-alarms-input";
  if (placeholder) {
    input.placeholder = placeholder;
    input.autocomplete = "off";
  }
  mark(input, name);
  label.append(text, input);
  return label;
}

function dayRow(): HTMLElement {
  const row = el("div", "rd-alarms-days");
  for (const [value, caption] of DAYS) {
    const label = el("label", "rd-alarms-day");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = value;
    box.className = "rd-alarms-day-input";
    box.setAttribute("data-rd-alarms-day", "");
    const text = el("span", "rd-alarms-day-text");
    text.textContent = caption;
    label.append(box, text);
    row.append(label);
  }
  return row;
}

function submitAlarm(parent: HTMLElement, section: HTMLElement, dialog: HTMLElement): void {
  const callbacks = callbacksFor.get(parent);
  if (!callbacks) return;
  const rawTime = valueOf(dialog.querySelector(slot("time"))).trim();
  if (!rawTime) {
    callbacks.onError("Time is required");
    paintError(section, "Time is required");
    return;
  }
  const time = parseAlarmInputTime(rawTime);
  if (!time) {
    const message = "Enter time as HH:MM (e.g. 07:00 or 7:00 PM)";
    callbacks.onError(message);
    paintError(section, message);
    return;
  }
  const entry = readForm(dialog, time);
  callbacks.onScript("set", entry);
  clearForm(dialog);
  closeDialog(dialog);
}

function openDialog(dialog: HTMLElement): void {
  dialog.hidden = false;
}

function closeDialog(dialog: HTMLElement): void {
  dialog.hidden = true;
}

function clearForm(scope: HTMLElement): void {
  const time = scope.querySelector(slot("time"));
  const label = scope.querySelector(slot("label"));
  if (time && "value" in time) (time as HTMLInputElement).value = "";
  if (label && "value" in label) (label as HTMLInputElement).value = "";
  for (const box of scope.querySelectorAll("[data-rd-alarms-day]")) {
    if ("checked" in box) (box as HTMLInputElement).checked = false;
  }
}

function paintSection(parent: HTMLElement, root: HTMLElement, view: RedisplayAlarmsView): void {
  const clock = root.querySelector(slot("clock"));
  if (clock) {
    clock.textContent = view.nextAlarm ?? "";
    clock.classList.toggle("rd-alarms-clock-empty", view.nextAlarm === "None");
  }
  const next = root.querySelector(slot("next"));
  if (next) hide(next, view.items.length > 0);
  const snoozed = root.querySelector(slot("snoozed"));
  if (snoozed) {
    snoozed.textContent = view.snoozedUntil ? `Snoozed until ${view.snoozedUntil}` : "";
    hide(snoozed, !view.snoozedUntil);
  }
  const banner = root.querySelector(slot("banner"));
  if (banner) hide(banner, !view.ringing);
  paintError(root, view.error);
  paintList(parent, root, view);
}

function paintList(parent: HTMLElement, root: HTMLElement, view: RedisplayAlarmsView): void {
  const rows = root.querySelector(slot("rows"));
  if (!rows || !("replaceChildren" in rows)) return;
  const holder = rows as HTMLElement;
  const key = JSON.stringify(view.items);
  if (holder.dataset.rdAlarmsItems !== key) {
    holder.dataset.rdAlarmsItems = key;
    holder.replaceChildren(...view.items.map((item) => itemRow(parent, item)));
  }
}

function paintError(root: HTMLElement, error: string | undefined): void {
  for (const name of ["error", "dialog-error"]) {
    const node = root.querySelector(slot(name));
    if (!node) continue;
    node.textContent = error ?? "";
    hide(node, !error);
  }
}

function itemRow(parent: HTMLElement, item: RedisplayAlarmItem): HTMLElement {
  const classes = ["rd-alarms-item"];
  if (!item.enabled) classes.push("rd-alarms-item-off");
  const row = el("div", classes.join(" "));
  const main = el("div", "rd-alarms-item-main");
  const primary = el("div", "rd-alarms-item-primary");
  const time = el("span", "rd-alarms-item-time");
  time.textContent = (item.displayTime ?? item.time) || item.label;
  primary.append(time);
  if (item.time && item.label) {
    const label = el("span", "rd-alarms-item-label");
    label.textContent = item.label;
    primary.append(label);
  }
  main.append(primary);
  if (item.detail) {
    const meta = el("p", "rd-alarms-meta");
    meta.textContent = item.detail;
    main.append(meta);
  }

  const extra: AlarmScriptExtra = { time: item.time, label: item.label, days: item.days.slice() };
  const actions = el("div", "rd-alarms-actions");
  const toggleLabel = item.enabled ? "Turn off" : "Turn on";
  const toggle = iconButton(
    toggleLabel,
    "toggle",
    item.enabled ? ICON_BELL_ON : ICON_BELL_OFF,
    () => callbacksFor.get(parent)?.onScript(item.action, extra),
    item.enabled ? "active" : undefined,
  );
  toggle.setAttribute("aria-pressed", item.enabled ? "true" : "false");
  actions.append(
    toggle,
    iconButton("Delete", "delete", ICON_DELETE, () => callbacksFor.get(parent)?.onScript("delete", extra), "danger"),
  );
  row.append(main, actions);
  return row;
}

function iconButton(
  caption: string,
  name: string,
  iconPath: string,
  onClick: () => void,
  variant?: "active" | "danger",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rd-alarms-icon-button";
  if (variant === "active") button.className += " rd-alarms-icon-button-active";
  if (variant === "danger") button.className += " rd-alarms-icon-button-danger";
  button.setAttribute("aria-label", caption);
  button.setAttribute("title", caption);
  mark(button, name);
  button.append(svgIcon(iconPath));
  button.addEventListener("click", onClick);
  return button;
}

/** Parse user-entered alarm time (e.g. "07:00", "7:00 PM", "7pm", "06:30:00") into 24h "HH:MM". */
export function parseAlarmInputTime(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const colonMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(am|pm))?$/i.exec(trimmed);
  const shortMatch = colonMatch ? null : /^(\d{1,2})\s*(am|pm)$/i.exec(trimmed);
  const match = colonMatch ?? shortMatch;
  if (!match) return undefined;
  let hours = Number(match[1]);
  const minutes = colonMatch ? Number(match[2]) : 0;
  const meridiem = (colonMatch ? match[3] : match[2])?.toLowerCase();
  if (minutes > 59) return undefined;
  if (meridiem) {
    if (hours < 1 || hours > 12) return undefined;
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return undefined;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function readForm(root: HTMLElement, time: string): AlarmScriptExtra {
  const label = valueOf(root.querySelector(slot("label"))).trim();
  const days: string[] = [];
  for (const box of root.querySelectorAll("[data-rd-alarms-day]")) {
    if (checkedOf(box)) days.push(valueOf(box));
  }
  return { time, label, days };
}

function actionButton(
  caption: string,
  name: string,
  onClick: () => void,
  variant?: "primary" | "danger",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rd-alarms-button";
  if (variant === "primary") button.className += " rd-alarms-button-primary";
  if (variant === "danger") button.className += " rd-alarms-button-danger";
  button.textContent = caption;
  mark(button, name);
  button.addEventListener("click", onClick);
  return button;
}

function nextAlarmText(state: string | undefined, locale?: TimeLocale): string {
  if (!state || state === "unknown" || state === "unavailable") return "None";
  return formatAlarmStamp(state, locale) ?? state;
}

function presentAlarm(alarm: RedisplayAlarmEntry, locale?: TimeLocale): RedisplayAlarmItem {
  const time = typeof alarm.time === "string" ? alarm.time : "";
  const displayTime = formatAlarmTime(time, locale);
  const label = typeof alarm.label === "string" ? alarm.label : "";
  const days = Array.isArray(alarm.days) ? alarm.days.filter((day) => typeof day === "string" && day.length > 0) : [];
  const enabled = alarm.enabled !== false;
  return {
    time,
    displayTime,
    label,
    days,
    enabled,
    summary: [displayTime, label].filter(Boolean).join(" "),
    detail: days.join(", "),
    action: enabled ? "turn_off" : "turn_on",
    next: false,
  };
}

/** The script list is the source of saved alarms. A next-alarm timestamp still belongs in that list when the script omitted it. */
function withSensorAlarm(items: RedisplayAlarmItem[], nextRaw: string | undefined, locale?: TimeLocale): RedisplayAlarmItem[] {
  const target = nextClock(nextRaw);
  if (!target) return items;
  if (items.some((item) => item.enabled && clockMinutes(item.time) === target.minutes)) return items;
  const hours = Math.floor(target.minutes / 60);
  const minutes = target.minutes % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const row = presentAlarm({ time, label: "", days: [], enabled: true }, locale);
  return [...items.map((item) => ({ ...item, days: item.days.slice() })), row]
    .sort((a, b) => compareAlarmTime(a, b));
}

function orderAlarms(alarms: readonly RedisplayAlarmEntry[], locale?: TimeLocale): RedisplayAlarmItem[] {
  return alarms
    .map((alarm, index) => ({ item: presentAlarm(alarm, locale), index }))
    .sort((a, b) => compareAlarmTime(a.item, b.item) || a.index - b.index)
    .map((entry) => entry.item);
}

function compareAlarmTime(a: RedisplayAlarmItem, b: RedisplayAlarmItem): number {
  const aMinutes = clockMinutes(a.time);
  const bMinutes = clockMinutes(b.time);
  if (aMinutes !== undefined && bMinutes !== undefined) return aMinutes - bMinutes;
  if (aMinutes !== undefined) return -1;
  if (bMinutes !== undefined) return 1;
  return 0;
}

function nextClock(raw: string | undefined): { minutes: number } | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return { minutes: date.getHours() * 60 + date.getMinutes() };
}

function clockMinutes(time: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return undefined;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  const rest = time.trim().slice(match[0].length).trim().toLowerCase();
  if (rest.startsWith("pm") && hours < 12) hours += 12;
  if (rest.startsWith("am") && hours === 12) hours = 0;
  if (hours > 23) return undefined;
  return hours * 60 + minutes;
}

function unwrapAlarmPayload(result: unknown): Record<string, unknown> | undefined {
  const record = asRecord(result);
  if (!record) return undefined;
  for (const key of ["response", "service_response"]) {
    const nested = asRecord(record[key]);
    if (
      nested &&
      (Array.isArray(nested.alarms) || Array.isArray(nested.list) || "ok" in nested || "error" in nested)
    ) {
      return nested;
    }
  }
  return record;
}

function parseAlarmList(record: Record<string, unknown>): RedisplayAlarmEntry[] | undefined {
  const raw = Array.isArray(record.alarms) ? record.alarms : Array.isArray(record.list) ? record.list : undefined;
  if (!raw) return undefined;
  return raw.map(parseAlarm).filter((item): item is RedisplayAlarmEntry => item !== undefined);
}

function parseAlarm(value: unknown): RedisplayAlarmEntry | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const time = typeof record.time === "string" ? record.time : "";
  const label = typeof record.label === "string" ? record.label : "";
  if (!time && !label) return undefined;
  let enabled = true;
  if (typeof record.enabled === "boolean") enabled = record.enabled;
  else if (typeof record.on === "boolean") enabled = record.on;
  return { time, label, days: daysOf(record.days), enabled };
}

function applySingleAlarm(
  existing: readonly RedisplayAlarmEntry[],
  entry: RedisplayAlarmEntry,
  result: unknown,
): RedisplayAlarmEntry[] {
  const index = existing.findIndex((item) => sameAlarmSlot(item, entry));
  if (result === "deleted") {
    return index < 0 ? existing.slice() : [...existing.slice(0, index), ...existing.slice(index + 1)];
  }
  if (index < 0) return [...existing, entry];
  return [...existing.slice(0, index), entry, ...existing.slice(index + 1)];
}

function sameAlarmSlot(a: RedisplayAlarmEntry, b: RedisplayAlarmEntry): boolean {
  const aMins = clockMinutes(a.time);
  const bMins = clockMinutes(b.time);
  if (aMins !== undefined && bMins !== undefined) {
    if (aMins !== bMins) return false;
  } else if (a.time !== b.time) {
    return false;
  }
  const aDays = a.days.map((d) => d.toLowerCase()).sort().join(",");
  const bDays = b.days.map((d) => d.toLowerCase()).sort().join(",");
  return aDays === bDays;
}

function daysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.trim()) {
    if (value.trim().toLowerCase() === "once") return [];
    return value.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

function failureText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const record = asRecord(error);
  if (record && typeof record.message === "string" && record.message) return record.message;
  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function mark(node: HTMLElement, name: string): void {
  node.setAttribute("data-rd-alarms", name);
}

function slot(name: string): string {
  return `[data-rd-alarms="${name}"]`;
}

function elementChild(parent: HTMLElement): HTMLElement | null {
  const node = parent.firstElementChild;
  if (!node || !("dataset" in node) || !("classList" in node)) return null;
  return node as HTMLElement;
}

function hide(node: Element, hidden: boolean): void {
  if ("hidden" in node) (node as HTMLElement).hidden = hidden;
}

function valueOf(node: Element | null): string {
  if (!node || !("value" in node)) return "";
  const value = (node as HTMLInputElement).value;
  return typeof value === "string" ? value : "";
}

function checkedOf(node: Element): boolean {
  return "checked" in node && (node as HTMLInputElement).checked === true;
}
