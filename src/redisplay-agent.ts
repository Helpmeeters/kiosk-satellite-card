import type { SatelliteModel, SwitchControl, VolumeControl } from "./model";
import { formatVolumeReadout } from "./redisplay";

export interface AgentSelectView {
  entityId: string;
  name: string;
  options: string[];
  value: string;
}

export interface AgentVolumeView {
  entityId: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
}

export interface AgentSwitchView {
  entityId: string;
  name: string;
  on: boolean;
}

export interface AgentView {
  selects: AgentSelectView[];
  /** Assistant volume, the same slider shape as Media volume. */
  volume?: AgentVolumeView;
  /** Mute. Chimes, noise gate, and mute timers stay off this tab. */
  mute?: AgentSwitchView;
  /** Stop word. */
  stopWord?: AgentSwitchView;
}

/**
 * The control card calls `select.select_option` with `{ option }` and `{ entity_id }`.
 * `option` is the string chosen on the select.
 */
export type AgentSelectChange = (
  domain: "select",
  service: "select_option",
  data: { option: string },
  target: { entity_id: string },
) => void;

export interface AgentHandlers {
  onSelect: AgentSelectChange;
  onVolume?: (entityId: string, value: number) => void;
  onSwitch?: (entityId: string, on: boolean) => void;
}

interface AgentRow {
  /** Finished speaking detection fills the row. Pairs stay two columns. */
  single: boolean;
  selects: AgentSelectView[];
}

const ROWS: ReadonlyArray<{ names: readonly string[]; single: boolean }> = [
  { names: ["wake word", "wake word 2"], single: false },
  { names: ["assistant", "assistant 2"], single: false },
  { names: ["finished speaking detection"], single: true },
  { names: ["wake word engine", "wake word sensitivity"], single: false },
];

const handlers = new WeakMap<HTMLElement, AgentHandlers>();
const layouts = new WeakMap<HTMLElement, string>();

/**
 * Wake word, wake word 2, assistant, assistant 2, finished speaking detection,
 * wake word engine, and sensitivity, plus Assistant volume, Mute, and Stop word.
 * Chimes, noise gate, mute timers, and other settings stay out.
 */
export function buildAgent(model: SatelliteModel): AgentView | undefined {
  const selects = model.voiceSelects.map((select) => ({
    entityId: select.entityId,
    name: select.name,
    options: listedOptions(select.options, select.value),
    value: select.value,
  }));
  const volume = namedVolume(model, "assistant volume");
  const mute = namedSwitch(model, "mute");
  const stopWord = namedSwitch(model, "stop word");
  if (selects.length === 0 && !volume && !mute && !stopWord) return undefined;
  const view: AgentView = { selects };
  if (volume) view.volume = volumeView(volume);
  if (mute) view.mute = { entityId: mute.entityId, name: mute.name, on: mute.on };
  if (stopWord) view.stopWord = { entityId: stopWord.entityId, name: stopWord.name, on: stopWord.on };
  return view;
}

export const agentCss = `
.rd-agent {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 16px 16px 18px;
  color: var(--primary-text-color);
}
.rd-agent-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: end;
}
.rd-agent-row-single {
  grid-template-columns: 1fr;
}
.rd-agent-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
  margin: 0;
}
.rd-agent-name {
  color: var(--secondary-text-color);
  font-size: 0.92rem;
  font-weight: 500;
  line-height: 1.3;
}
.rd-agent-control {
  position: relative;
  display: block;
  min-width: 0;
}
.rd-agent-select {
  appearance: none;
  -webkit-appearance: none;
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 9px 34px 9px 12px;
  border: 1px solid var(--divider-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 500;
  line-height: 1.25;
  cursor: pointer;
}
.rd-agent-select:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-agent-mark {
  position: absolute;
  top: 50%;
  right: 13px;
  width: 8px;
  height: 8px;
  margin-top: -6px;
  border-right: 2px solid var(--secondary-text-color);
  border-bottom: 2px solid var(--secondary-text-color);
  transform: rotate(45deg);
  pointer-events: none;
}
.rd-agent-volume {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}
.rd-agent-slider {
  width: 100%;
  accent-color: var(--primary-color);
}
.rd-agent-volume-value {
  min-width: 3.2em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--secondary-text-color);
}
.rd-agent-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 36px;
}
.rd-agent-switch {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-text-color) 16%, transparent);
  color: inherit;
  cursor: pointer;
}
.rd-agent-switch-on {
  background: var(--primary-color);
}
.rd-agent-switch-knob {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--ha-card-background, var(--card-background-color, Canvas));
  transition: transform 160ms ease;
}
.rd-agent-switch-on .rd-agent-switch-knob {
  transform: translateX(20px);
}
`;

export function renderAgent(
  parent: HTMLElement,
  view: AgentView | undefined,
  onSelect: AgentSelectChange,
  extra?: Omit<AgentHandlers, "onSelect">,
): void {
  handlers.set(parent, { onSelect, ...extra });
  if (!view || (view.selects.length === 0 && !view.volume && !view.mute && !view.stopWord)) {
    const existing = findSection(parent);
    if (existing) layouts.delete(existing);
    parent.replaceChildren();
    return;
  }
  const rows = groupSelects(view.selects);
  const key = layoutKey(rows, view);
  let section = findSection(parent);
  if (!section || layouts.get(section) !== key) {
    if (!section) {
      section = createSection();
      parent.replaceChildren(section);
    }
    rebuildRows(section, parent, rows, view);
    layouts.set(section, key);
    return;
  }
  patchRows(section, rows, view);
}

/** Same option list the control card writes. A live value the entity left out is included. */
function listedOptions(options: readonly string[], value: string): string[] {
  const listed = options.slice();
  if (value && value !== "unknown" && value !== "unavailable" && !listed.includes(value)) listed.unshift(value);
  return listed;
}

function groupSelects(selects: readonly AgentSelectView[]): AgentRow[] {
  const used = new Set<AgentSelectView>();
  const rows: AgentRow[] = [];
  for (const row of ROWS) {
    const picked: AgentSelectView[] = [];
    for (const name of row.names) {
      const found = selects.find((item) => !used.has(item) && normalize(item.name) === name);
      if (!found) continue;
      used.add(found);
      picked.push(found);
    }
    if (picked.length > 0) rows.push({ single: row.single, selects: picked });
  }
  for (const item of selects) {
    if (used.has(item)) continue;
    rows.push({ single: true, selects: [item] });
  }
  return rows;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/^vs\s+/, "");
}

function layoutKey(rows: readonly AgentRow[], view: AgentView): string {
  const rowsKey = rows.map((row) => `${row.single ? "s" : "p"}:${row.selects.map((item) => item.entityId).join(",")}`).join("|");
  const switches = agentSwitches(view).map((item) => item.entityId).join(",");
  return `${rowsKey}|v:${view.volume?.entityId ?? ""}|s:${switches}`;
}

function agentSwitches(view: AgentView): AgentSwitchView[] {
  return [view.mute, view.stopWord].filter((item): item is AgentSwitchView => Boolean(item));
}

function namedVolume(model: SatelliteModel, name: string): VolumeControl | undefined {
  return model.volumes.find((item) => normalize(item.name) === name);
}

function namedSwitch(model: SatelliteModel, name: string): SwitchControl | undefined {
  return model.voiceSwitches.find((item) => normalize(item.name) === name);
}

function volumeView(volume: VolumeControl): AgentVolumeView {
  return {
    entityId: volume.entityId,
    name: volume.name,
    min: volume.min,
    max: volume.max,
    step: volume.step,
    value: volume.value,
  };
}

function findSection(parent: HTMLElement): HTMLElement | undefined {
  for (const child of parent.children) {
    if (hasClass(child as HTMLElement, "rd-agent")) return child as HTMLElement;
  }
  return undefined;
}

function createSection(): HTMLElement {
  const root = document.createElement("section");
  root.className = "rd-agent";
  root.setAttribute("aria-label", "Voice Agent");
  return root;
}

function rebuildRows(section: HTMLElement, parent: HTMLElement, rows: readonly AgentRow[], view: AgentView): void {
  const existing = fieldMap(section);
  const nodes: HTMLElement[] = [];
  for (const row of rows) {
    const node = document.createElement("div");
    node.className = row.single ? "rd-agent-row rd-agent-row-single" : "rd-agent-row";
    for (const item of row.selects) {
      const field = existing.get(item.entityId);
      node.append(field ? updateField(field, item) : createField(parent, item));
    }
    nodes.push(node);
  }
  const extras: HTMLElement[] = [];
  if (view.volume) extras.push(existingVolume(section) ?? createVolume(parent, view.volume));
  for (const item of agentSwitches(view)) extras.push(switchRow(section, item.entityId) ?? createSwitch(parent, item));
  section.replaceChildren(...nodes, ...extras);
  if (view.volume) paintVolume(section, view.volume);
  for (const item of agentSwitches(view)) paintSwitchView(section, item);
}

function patchRows(section: HTMLElement, rows: readonly AgentRow[], view: AgentView): void {
  const existing = fieldMap(section);
  for (const row of rows) {
    for (const item of row.selects) {
      const field = existing.get(item.entityId);
      if (field) updateField(field, item);
    }
  }
  if (view.volume) paintVolume(section, view.volume);
  for (const item of agentSwitches(view)) paintSwitchView(section, item);
}

function fieldMap(section: HTMLElement): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  const walk = (node: HTMLElement): void => {
    for (const child of node.children) {
      const element = child as HTMLElement;
      if (hasClass(element, "rd-agent-field")) {
        const select = selectOf(element);
        const entityId = select?.dataset.entity;
        if (select && entityId) map.set(entityId, element);
      }
      walk(element);
    }
  };
  walk(section);
  return map;
}

function updateField(field: HTMLElement, item: AgentSelectView): HTMLElement {
  const name = findClass(field, "rd-agent-name");
  if (name && name.textContent !== item.name) name.textContent = item.name;
  const select = selectOf(field);
  if (!select) return field;
  if (select.getAttribute("aria-label") !== item.name) select.setAttribute("aria-label", item.name);
  if (isOpen(select)) return field;
  writeOptions(select, item);
  return field;
}

function createField(parent: HTMLElement, item: AgentSelectView): HTMLElement {
  const label = document.createElement("label");
  label.className = "rd-agent-field";
  const name = text("span", "rd-agent-name", item.name);
  const control = document.createElement("span");
  control.className = "rd-agent-control";
  const select = document.createElement("select");
  select.className = "rd-agent-select";
  select.dataset.entity = item.entityId;
  select.setAttribute("aria-label", item.name);
  writeOptions(select, item);
  select.addEventListener("change", () => {
    const handler = handlers.get(parent);
    if (!handler) return;
    handler.onSelect("select", "select_option", { option: select.value }, { entity_id: item.entityId });
  });
  const mark = document.createElement("span");
  mark.className = "rd-agent-mark";
  mark.setAttribute("aria-hidden", "true");
  control.append(select, mark);
  label.append(name, control);
  return label;
}

function writeOptions(select: HTMLSelectElement, item: AgentSelectView): void {
  const signature = JSON.stringify(item.options);
  if (select.dataset.options !== signature) {
    select.replaceChildren(
      ...item.options.map((option) => {
        const node = document.createElement("option");
        node.value = option;
        node.textContent = option;
        return node;
      }),
    );
    select.dataset.options = signature;
  }
  if (select.value !== item.value) select.value = item.value;
}

/** A focused select is the open dropdown. Leave its options and value alone. */
function isOpen(select: HTMLElement): boolean {
  const root = select.getRootNode();
  if (!("activeElement" in root)) return false;
  return (root as Document | ShadowRoot).activeElement === select;
}

function existingVolume(section: HTMLElement): HTMLElement | undefined {
  return findClass(section, "rd-agent-volume");
}

function switchRow(section: HTMLElement, entityId: string): HTMLElement | undefined {
  return switchRows(section).find((row) => findClass(row, "rd-agent-switch")?.dataset.entity === entityId);
}

function switchRows(section: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const walk = (node: HTMLElement): void => {
    for (const child of node.children) {
      const element = child as HTMLElement;
      if (hasClass(element, "rd-agent-switch-row")) rows.push(element);
      else walk(element);
    }
  };
  walk(section);
  return rows;
}

function createVolume(parent: HTMLElement, volume: AgentVolumeView): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-agent-volume";
  const label = text("span", "rd-agent-volume-label", "Assistant");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "rd-agent-slider";
  slider.dataset.entity = volume.entityId;
  slider.setAttribute("data-entity", volume.entityId);
  slider.setAttribute("aria-label", "Assistant volume");
  const readout = text("span", "rd-agent-volume-value", "");
  slider.addEventListener("input", () => {
    readout.textContent = formatVolumeReadout(Number(slider.value), numberAttr(slider.max, volume.max));
  });
  slider.addEventListener("change", () => {
    const entityId = slider.dataset.entity;
    if (!entityId) return;
    handlers.get(parent)?.onVolume?.(entityId, Number(slider.value));
  });
  row.append(label, slider, readout);
  return row;
}

function paintVolume(section: HTMLElement, volume: AgentVolumeView): void {
  const slider = findClass(section, "rd-agent-slider");
  if (!slider || !("value" in slider)) return;
  const input = slider as HTMLInputElement;
  if (isOpen(input)) return;
  input.min = String(volume.min);
  input.max = String(volume.max);
  input.step = String(volume.step);
  input.dataset.entity = volume.entityId;
  input.setAttribute("data-entity", volume.entityId);
  const readout = findClass(section, "rd-agent-volume-value");
  if (volume.value !== null && Number(input.value) !== volume.value) input.value = String(volume.value);
  if (readout && volume.value !== null) {
    const textValue = formatVolumeReadout(volume.value, volume.max);
    if (readout.textContent !== textValue) readout.textContent = textValue;
  }
}

function createSwitch(parent: HTMLElement, stopWord: AgentSwitchView): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-agent-switch-row";
  const label = text("span", "rd-agent-switch-label", stopWord.name);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rd-agent-switch";
  button.dataset.entity = stopWord.entityId;
  button.setAttribute("data-entity", stopWord.entityId);
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", stopWord.name);
  const knob = document.createElement("span");
  knob.className = "rd-agent-switch-knob";
  button.append(knob);
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") !== "true";
    paintSwitch(button, on);
    const entityId = button.dataset.entity;
    if (entityId) handlers.get(parent)?.onSwitch?.(entityId, on);
  });
  row.append(label, button);
  return row;
}

function paintSwitchView(section: HTMLElement, item: AgentSwitchView): void {
  const row = switchRow(section, item.entityId);
  const button = row ? findClass(row, "rd-agent-switch") : undefined;
  if (!button) return;
  button.dataset.entity = item.entityId;
  button.setAttribute("data-entity", item.entityId);
  if (button.getAttribute("aria-label") !== item.name) button.setAttribute("aria-label", item.name);
  const label = findClass(row as HTMLElement, "rd-agent-switch-label");
  if (label && label.textContent !== item.name) label.textContent = item.name;
  paintSwitch(button, item.on);
}

function paintSwitch(button: HTMLElement, on: boolean): void {
  button.className = on ? "rd-agent-switch rd-agent-switch-on" : "rd-agent-switch";
  button.setAttribute("aria-checked", on ? "true" : "false");
}

function numberAttr(value: string, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function selectOf(field: HTMLElement): HTMLSelectElement | undefined {
  return findClass(field, "rd-agent-select") as HTMLSelectElement | undefined;
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

function text(tag: "span", className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}
