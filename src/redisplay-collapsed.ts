import type { SatelliteModel } from "./model";
import { formatClock, type RedisplayView, type TimeLocale } from "./redisplay";
import { buildIntercom, type IntercomButtonView, type IntercomView } from "./redisplay-intercom";
import { buildTimers, formatTimerRemaining } from "./redisplay-timers";

export interface CollapsedNowView {
  playerId?: string;
  playing: boolean;
  picture?: string;
  title: string;
}

export interface CollapsedAlarmsView {
  kind: "ringing" | "snoozed" | "alarm" | "timer" | "none";
  kicker: string;
  value: string;
}

export interface CollapsedAgentView {
  kicker: string;
  wakeWord: string;
  assistant?: string;
}

export interface AssistPipelineInfo {
  id: string;
  name: string;
}

export interface CollapsedView {
  now: CollapsedNowView;
  alarms: CollapsedAlarmsView;
  intercom: IntercomView;
  agent: CollapsedAgentView;
}

const FALLBACK_INTERCOM_BUTTONS: readonly IntercomButtonView[] = [
  { id: "off", label: "Off", selected: false, disabled: true },
  { id: "ring", label: "Ring", selected: false, disabled: true },
  { id: "answer", label: "Answer", selected: false, disabled: true },
  { id: "dnd", label: "DND", selected: false, disabled: true },
];

const NON_TRIGGER_VALUES = new Set(["", "unknown", "unavailable", "none", "null"]);
const TITLE_INTERACTIVE_PARTS = new Set(["master", "mute", "info", "power"]);
const TITLE_INTERACTIVE_TAGS = new Set(["BUTTON", "INPUT", "SELECT", "A"]);

/** Build the collapsed nav-bar view from the current satellite model and media view. */
export function buildCollapsedView(
  model: SatelliteModel,
  view: RedisplayView,
  locale?: TimeLocale,
  nowMs = Date.now(),
): CollapsedView {
  return {
    now: {
      playerId: view.playerId,
      playing: view.playing,
      picture: view.picture,
      title: view.title,
    },
    alarms: buildCollapsedAlarms(model, locale, nowMs),
    intercom: buildIntercom(model) ?? {
      buttons: FALLBACK_INTERCOM_BUTTONS.map((button) => ({ ...button })),
    },
    agent: buildCollapsedAgent(model),
  };
}

/**
 * True when a click on the title bar landed outside of any icon or interactive tool control.
 * Battery has pointer-events: none, so clicking on the title, battery, or bar background toggles.
 */
export function isTitleBarToggleEvent(path: readonly EventTarget[]): boolean {
  for (const node of path) {
    if (!node || typeof node !== "object") continue;
    const el = node as { tagName?: unknown; dataset?: Record<string, unknown> };
    const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (TITLE_INTERACTIVE_TAGS.has(tag)) return false;
    const part = el.dataset && typeof el.dataset.part === "string" ? el.dataset.part : "";
    if (TITLE_INTERACTIVE_PARTS.has(part)) return false;
  }
  return true;
}

/** True when a click on a collapsed mini tile landed outside any internal button/control. */
export function isTileExpandEvent(path: readonly EventTarget[]): boolean {
  for (const node of path) {
    if (!node || typeof node !== "object") continue;
    const el = node as { tagName?: unknown };
    const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (TITLE_INTERACTIVE_TAGS.has(tag)) return false;
  }
  return true;
}

function buildCollapsedAlarms(model: SatelliteModel, locale?: TimeLocale, nowMs = Date.now()): CollapsedAlarmsView {
  if (model.alarms.ringing) {
    return { kind: "ringing", kicker: "Alarm", value: "Ringing" };
  }

  const candidates: Array<{ kind: "snoozed" | "alarm" | "timer"; kicker: string; ms: number; raw: string }> = [];

  const snoozedRaw = model.alarms.snoozedUntil;
  const snoozedMs = parseTimestamp(snoozedRaw);
  if (snoozedMs !== undefined && snoozedRaw) {
    candidates.push({ kind: "snoozed", kicker: "Snoozed", ms: snoozedMs, raw: snoozedRaw });
  }

  const alarmRaw = model.alarms.nextAlarm;
  const alarmMs = parseTimestamp(alarmRaw);
  if (alarmMs !== undefined && alarmRaw) {
    candidates.push({ kind: "alarm", kicker: "Next alarm", ms: alarmMs, raw: alarmRaw });
  }

  const nextTimer = model.timers.find((line) => normalize(line.name) === "next timer");
  const timerRaw = nextTimer?.state;
  const timerMs = parseTimestamp(timerRaw);
  if (timerMs !== undefined && timerRaw) {
    candidates.push({ kind: "timer", kicker: "Next timer", ms: timerMs, raw: timerRaw });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.ms - b.ms);
    const earliest = candidates[0];
    if (earliest.kind === "timer") {
      const remaining = Math.max(0, Math.round((earliest.ms - nowMs) / 1000));
      return { kind: "timer", kicker: earliest.kicker, value: formatTimerRemaining(remaining) };
    }
    const clock = formatClock(earliest.raw, locale) ?? earliest.raw.trim();
    return { kind: earliest.kind, kicker: earliest.kicker, value: clock };
  }

  const timers = buildTimers(model, locale);
  if (timers && timers.headline && timers.headline !== "No timers") {
    return { kind: "timer", kicker: "Timers", value: timers.headline };
  }

  if (alarmRaw && !NON_TRIGGER_VALUES.has(alarmRaw.trim().toLowerCase())) {
    return { kind: "alarm", kicker: "Next alarm", value: alarmRaw.trim() };
  }

  return { kind: "none", kicker: "Alarms & Timers", value: "None" };
}

function buildCollapsedAgent(model: SatelliteModel): CollapsedAgentView {
  const select = model.voiceSelects.find((item) => normalize(item.name) === "wake word");
  const raw = select?.value?.trim() ?? "";
  const valid = raw.length > 0 && !NON_TRIGGER_VALUES.has(raw.toLowerCase());
  const assistantSelect = model.voiceSelects.find((item) => normalize(item.name) === "assistant");
  const assistantRaw = assistantSelect?.value?.trim() ?? "";
  const assistantValid = assistantRaw.length > 0 && !NON_TRIGGER_VALUES.has(assistantRaw.toLowerCase());
  const view: CollapsedAgentView = {
    kicker: "Wake word",
    wakeWord: valid ? raw : "—",
  };
  if (assistantValid) view.assistant = assistantRaw;
  return view;
}

/** Resolve the HA Assist pipeline_id for the Kiosk's configured assistant select value. */
export function resolveAssistPipelineId(
  assistantName: string | undefined,
  pipelines: readonly AssistPipelineInfo[],
  preferredPipeline?: string | null,
): string | undefined {
  const trimmed = assistantName?.trim() ?? "";
  if (!trimmed || NON_TRIGGER_VALUES.has(trimmed.toLowerCase())) return undefined;
  if (trimmed.toLowerCase() === "preferred") {
    return typeof preferredPipeline === "string" && preferredPipeline.length > 0 ? preferredPipeline : undefined;
  }
  const exact = pipelines.find((pipeline) => pipeline.name.trim() === trimmed);
  if (exact) return exact.id;
  const lower = trimmed.toLowerCase();
  return pipelines.find((pipeline) => pipeline.name.trim().toLowerCase() === lower)?.id;
}

/** Build the Lovelace hass-action config payload for opening Assist. */
export function buildAssistActionConfig(pipelineId: string | undefined): {
  tap_action: { action: "assist"; pipeline_id?: string };
} {
  return {
    tap_action: pipelineId ? { action: "assist", pipeline_id: pipelineId } : { action: "assist" },
  };
}

function parseTimestamp(state: string | undefined): number | undefined {
  if (!state || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(state)) return undefined;
  const ms = new Date(state).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/^vs\s+/, "");
}
