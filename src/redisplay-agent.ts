import type { SatelliteModel } from "./model";

export interface AgentSelectView {
  entityId: string;
  name: string;
  options: string[];
  value: string;
}

export interface AgentView {
  selects: AgentSelectView[];
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

const handlers = new WeakMap<HTMLElement, AgentSelectChange>();
const layouts = new WeakMap<HTMLElement, string>();

/**
 * Wake word, wake word 2, assistant, assistant 2, finished speaking detection,
 * wake word engine, and sensitivity. Those are the voice selects. Settings stay out.
 */
export function buildAgent(model: SatelliteModel): AgentView | undefined {
  if (model.voiceSelects.length === 0) return undefined;
  return {
    selects: model.voiceSelects.map((select) => ({
      entityId: select.entityId,
      name: select.name,
      options: listedOptions(select.options, select.value),
      value: select.value,
    })),
  };
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
.rd-agent-label {
  margin: 0;
  color: var(--primary-text-color);
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.2;
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
`;

export function renderAgent(parent: HTMLElement, view: AgentView | undefined, onSelect: AgentSelectChange): void {
  handlers.set(parent, onSelect);
  if (!view || view.selects.length === 0) {
    const existing = findSection(parent);
    if (existing) layouts.delete(existing);
    parent.replaceChildren();
    return;
  }
  const rows = groupSelects(view.selects);
  const key = layoutKey(rows);
  let section = findSection(parent);
  if (!section || layouts.get(section) !== key) {
    if (!section) {
      section = createSection();
      parent.replaceChildren(section);
    }
    rebuildRows(section, parent, rows);
    layouts.set(section, key);
    return;
  }
  patchRows(section, rows);
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

function layoutKey(rows: readonly AgentRow[]): string {
  return rows.map((row) => `${row.single ? "s" : "p"}:${row.selects.map((item) => item.entityId).join(",")}`).join("|");
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
  root.append(text("h2", "rd-agent-label", "Voice Agent"));
  return root;
}

function rebuildRows(section: HTMLElement, parent: HTMLElement, rows: readonly AgentRow[]): void {
  const existing = fieldMap(section);
  const heading = ensureHeading(section);
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
  section.replaceChildren(heading, ...nodes);
}

function patchRows(section: HTMLElement, rows: readonly AgentRow[]): void {
  const existing = fieldMap(section);
  for (const row of rows) {
    for (const item of row.selects) {
      const field = existing.get(item.entityId);
      if (field) updateField(field, item);
    }
  }
}

function ensureHeading(section: HTMLElement): HTMLElement {
  for (const child of section.children) {
    if (hasClass(child as HTMLElement, "rd-agent-label")) {
      const heading = child as HTMLElement;
      heading.textContent = "Voice Agent";
      return heading;
    }
  }
  const heading = text("h2", "rd-agent-label", "Voice Agent");
  return heading;
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
    handler("select", "select_option", { option: select.value }, { entity_id: item.entityId });
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

function text(tag: "h2" | "span", className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}
