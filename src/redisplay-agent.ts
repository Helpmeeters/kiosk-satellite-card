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

const handlers = new WeakMap<HTMLElement, AgentSelectChange>();
const drawn = new WeakMap<HTMLElement, string>();

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
  gap: 16px;
  padding: 20px 2px 8px;
  color: var(--primary-text-color);
}
.rd-agent-label {
  margin: 0;
  color: var(--primary-text-color);
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.2;
}
.rd-agent-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
  margin: 0;
}
.rd-agent-name {
  color: var(--secondary-text-color);
  font-size: 1.05rem;
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
  padding: 14px 48px 14px 16px;
  border: 1px solid var(--divider-color);
  border-radius: 16px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 2rem;
  font-weight: 500;
  line-height: 1.15;
  cursor: pointer;
}
.rd-agent-select:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-agent-mark {
  position: absolute;
  top: 50%;
  right: 18px;
  width: 9px;
  height: 9px;
  margin-top: -7px;
  border-right: 2px solid var(--secondary-text-color);
  border-bottom: 2px solid var(--secondary-text-color);
  transform: rotate(45deg);
  pointer-events: none;
}
`;

export function renderAgent(parent: HTMLElement, view: AgentView | undefined, onSelect: AgentSelectChange): void {
  handlers.set(parent, onSelect);
  if (!view || view.selects.length === 0) {
    drawn.delete(parent);
    parent.replaceChildren();
    return;
  }
  const signature = JSON.stringify(view.selects);
  if (drawn.get(parent) === signature && hasSection(parent)) return;
  drawn.set(parent, signature);
  const root = document.createElement("section");
  root.className = "rd-agent";
  root.setAttribute("aria-label", "Voice Agent");
  root.append(text("h2", "rd-agent-label", "Voice Agent"));
  for (const item of view.selects) root.append(field(parent, item));
  parent.replaceChildren(root);
}

/** Same option list the control card writes. A live value the entity left out is included. */
function listedOptions(options: readonly string[], value: string): string[] {
  const listed = options.slice();
  if (value && value !== "unknown" && value !== "unavailable" && !listed.includes(value)) listed.unshift(value);
  return listed;
}

function hasSection(parent: HTMLElement): boolean {
  for (const child of parent.children) {
    if (child.className.split(/\s+/).includes("rd-agent")) return true;
  }
  return false;
}

function text(tag: "h2" | "span", className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function field(parent: HTMLElement, item: AgentSelectView): HTMLElement {
  const label = document.createElement("label");
  label.className = "rd-agent-field";
  const name = text("span", "rd-agent-name", item.name);
  const control = document.createElement("span");
  control.className = "rd-agent-control";
  const select = document.createElement("select");
  select.className = "rd-agent-select";
  select.dataset.entity = item.entityId;
  select.setAttribute("aria-label", item.name);
  select.replaceChildren(
    ...item.options.map((option) => {
      const node = document.createElement("option");
      node.value = option;
      node.textContent = option;
      return node;
    }),
  );
  select.value = item.value;
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
