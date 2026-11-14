import type { SatelliteModel, SwitchControl, VolumeControl } from "./model";
import { formatVolumeReadout } from "./redisplay";

const INTERCOM_SWITCHES = ["intercom enabled", "intercom do not disturb"] as const;

export interface IntercomSwitchView {
  entityId: string;
  name: string;
  on: boolean;
}

export interface IntercomVolumeView {
  entityId: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
}

export interface IntercomView {
  switches: IntercomSwitchView[];
  /** Intercom volume, drawn like the Media volume slider. */
  volume?: IntercomVolumeView;
}

/**
 * The control card calls `switch.turn_on` or `switch.turn_off`
 * with no service data and `{ entity_id }` as the target.
 */
export type IntercomSwitchChange = (
  domain: "switch",
  service: "turn_on" | "turn_off",
  data: undefined,
  target: { entity_id: string },
) => void;

export type IntercomVolumeChange = (entityId: string, value: number) => void;

/**
 * Intercom enabled and Intercom do not disturb, plus Intercom volume.
 * The Intercom and Intercom kiosk text sensors are not on SatelliteModel, so there is no call state.
 */
export function buildIntercom(model: SatelliteModel): IntercomView | undefined {
  const switches = INTERCOM_SWITCHES.flatMap((name) => {
    const found = findSwitch(model, name);
    return found ? [{ entityId: found.entityId, name: found.name, on: found.on }] : [];
  });
  const volume = model.volumes.find((item) => normalize(item.name) === "intercom volume");
  if (switches.length === 0 && !volume) return undefined;
  const view: IntercomView = { switches };
  if (volume) view.volume = volumeView(volume);
  return view;
}

export const intercomCss = `
.rd-intercom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 16px 16px 18px;
  color: var(--primary-text-color);
}
.rd-intercom-label {
  margin: 0;
  color: var(--secondary-text-color);
  font-size: 1.05rem;
  line-height: 1.35;
}
.rd-intercom-switch {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 14px 12px;
  border: 0;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rd-intercom-switch:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-intercom-switch-on {
  background: color-mix(in srgb, var(--primary-color) 16%, transparent);
}
.rd-intercom-name {
  color: var(--secondary-text-color);
  font-size: 1.05rem;
  line-height: 1.3;
}
.rd-intercom-value {
  color: var(--primary-text-color);
  font-size: 2.4rem;
  font-weight: 500;
  line-height: 1.05;
}
.rd-intercom-switch-on .rd-intercom-value {
  color: var(--primary-color);
}
.rd-intercom-volume {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rd-intercom-slider {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  accent-color: var(--primary-color);
}
.rd-intercom-volume-value {
  min-width: 3.2em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--secondary-text-color);
}
`;

export function renderIntercom(
  parent: HTMLElement,
  view: IntercomView | undefined,
  onSwitch: IntercomSwitchChange,
  onVolume?: IntercomVolumeChange,
): void {
  if (!view || (view.switches.length === 0 && !view.volume)) {
    parent.replaceChildren();
    return;
  }
  const root = document.createElement("section");
  root.className = "rd-intercom";
  root.setAttribute("aria-label", "Intercom");
  root.append(text("p", "rd-intercom-label", "Intercom"));
  for (const item of view.switches) root.append(switchButton(item, onSwitch));
  if (view.volume) root.append(volumeRow(view.volume, onVolume));
  parent.replaceChildren(root);
}

function volumeView(volume: VolumeControl): IntercomVolumeView {
  return {
    entityId: volume.entityId,
    name: volume.name,
    min: volume.min,
    max: volume.max,
    step: volume.step,
    value: volume.value,
  };
}

function volumeRow(volume: IntercomVolumeView, onVolume: IntercomVolumeChange | undefined): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-intercom-volume";
  const label = text("span", "rd-intercom-volume-label", "Intercom");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "rd-intercom-slider";
  slider.min = String(volume.min);
  slider.max = String(volume.max);
  slider.step = String(volume.step);
  slider.value = String(volume.value ?? volume.min);
  slider.dataset.entity = volume.entityId;
  slider.setAttribute("aria-label", "Intercom volume");
  const readout = text("span", "rd-intercom-volume-value", volume.value === null ? "" : formatVolumeReadout(volume.value, volume.max));
  slider.addEventListener("input", () => {
    readout.textContent = formatVolumeReadout(Number(slider.value), volume.max);
  });
  slider.addEventListener("change", () => {
    onVolume?.(volume.entityId, Number(slider.value));
  });
  row.append(label, slider, readout);
  return row;
}

function findSwitch(model: SatelliteModel, name: string): SwitchControl | undefined {
  const voice = model.voiceSwitches.find((item) => normalize(item.name) === name);
  if (voice) return voice;
  for (const item of model.settings) {
    if ("on" in item && normalize(item.name) === name) return item;
  }
  return undefined;
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

function switchButton(item: IntercomSwitchView, onSwitch: IntercomSwitchChange): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.entity = item.entityId;
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", item.name);
  const name = text("span", "rd-intercom-name", item.name);
  const value = text("span", "rd-intercom-value", "");
  button.append(name, value);
  paint(button, value, item.on);
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") !== "true";
    paint(button, value, on);
    onSwitch("switch", on ? "turn_on" : "turn_off", undefined, { entity_id: item.entityId });
  });
  return button;
}

function paint(button: HTMLButtonElement, value: HTMLElement, on: boolean): void {
  button.className = on ? "rd-intercom-switch rd-intercom-switch-on" : "rd-intercom-switch";
  button.setAttribute("aria-checked", on ? "true" : "false");
  value.textContent = on ? "On" : "Off";
}
