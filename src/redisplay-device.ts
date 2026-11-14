import type { ButtonControl, SatelliteModel, SensorLine, UpdateControl } from "./model";

export interface DeviceView {
  updates: UpdateControl[];
  actions: ButtonControl[];
  remoteAdmin?: string;
  diagnostics: SensorLine[];
}

export interface DeviceHandlers {
  /** update.install for one update entity. */
  onInstall: (entityId: string) => void;
  /** button.press. `confirm` is true for Restart app and Restart device. */
  onPress: (entityId: string, confirm: boolean, name: string) => void;
}

/**
 * The control card's Device section: updates, device buttons, the remote admin
 * link, and diagnostics. Light stays out. Undefined when the device has none of these.
 */
export function buildDevice(model: SatelliteModel): DeviceView | undefined {
  if (model.updates.length === 0 && model.actions.length === 0 && !model.remoteAdmin && model.diagnostics.length === 0) {
    return undefined;
  }
  const view: DeviceView = {
    updates: model.updates.map((update) => ({ ...update })),
    actions: model.actions.map((action) => ({ ...action })),
    diagnostics: model.diagnostics.map((line) => ({ ...line })),
  };
  if (model.remoteAdmin) view.remoteAdmin = model.remoteAdmin;
  return view;
}

export const deviceCss = `
.rd-device {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 16px 16px 18px;
  color: var(--primary-text-color);
}
.rd-device-label {
  margin: 0;
  color: var(--primary-text-color);
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.2;
}
.rd-device-update {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
}
.rd-device-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rd-device-name {
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.3;
}
.rd-device-meta,
.rd-device-line,
.rd-device-summary {
  color: var(--secondary-text-color);
  font-size: 0.92rem;
  line-height: 1.35;
}
.rd-device-meta {
  margin: 0;
}
.rd-device-button {
  border: none;
  color: inherit;
  background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
  cursor: pointer;
  font: inherit;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
}
.rd-device-install {
  flex: 0 0 auto;
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
}
.rd-device-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rd-device-link {
  color: var(--primary-color);
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.3;
}
.rd-device-diagnostics {
  border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.35));
  padding-top: 10px;
}
.rd-device-summary {
  cursor: pointer;
}
.rd-device-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
}
.rd-device-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.rd-device-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rd-device [hidden] {
  display: none !important;
}
`;

const structures = new WeakMap<HTMLElement, string>();

export function renderDevice(parent: HTMLElement, view: DeviceView | undefined, handlers: DeviceHandlers): void {
  if (!view) {
    const existing = findSection(parent);
    if (existing) structures.delete(existing);
    parent.replaceChildren();
    return;
  }
  const key = structureKey(view);
  let section = findSection(parent);
  if (!section || structures.get(section) !== key) {
    section = createSection(view, handlers);
    structures.set(section, key);
    parent.replaceChildren(section);
    return;
  }
  patchSection(section, view);
}

function structureKey(view: DeviceView): string {
  return [
    view.updates.map((update) => update.entityId).join(","),
    view.actions.map((action) => `${action.entityId}:${action.confirm ? "1" : "0"}`).join(","),
    view.remoteAdmin ? "link" : "",
    view.diagnostics.map((line) => line.entityId).join(","),
  ].join("|");
}

function createSection(view: DeviceView, handlers: DeviceHandlers): HTMLElement {
  const root = el("section", "rd-device");
  root.setAttribute("aria-label", "Device");
  root.append(text("h2", "rd-device-label", "Device"));
  for (const update of view.updates) root.append(updateRow(update, handlers));
  if (view.actions.length > 0) {
    const actions = el("div", "rd-device-actions");
    for (const action of view.actions) actions.append(actionButton(action, handlers));
    root.append(actions);
  }
  if (view.remoteAdmin) root.append(adminLink(view.remoteAdmin));
  if (view.diagnostics.length > 0) root.append(diagnostics(view.diagnostics));
  return root;
}

function patchSection(root: HTMLElement, view: DeviceView): void {
  for (const update of view.updates) {
    const row = byEntity(root, update.entityId);
    if (!row) continue;
    setText(row, "rd-device-name", update.name);
    const title = findClass(row, "rd-device-title");
    if (title) {
      title.textContent = update.title ?? "";
      title.hidden = !update.title;
    }
    const available = update.state === "on";
    const installed = findClass(row, "rd-device-installed");
    if (installed) {
      installed.textContent = versionText("Installed", update.installed);
      installed.hidden = !available;
    }
    const latest = findClass(row, "rd-device-latest");
    if (latest) {
      latest.textContent = versionText("Latest", update.latest);
      latest.hidden = !available;
    }
    const install = findClass(row, "rd-device-install");
    if (install) install.hidden = !available;
  }
  for (const action of view.actions) {
    const button = byEntity(root, action.entityId);
    if (!button) continue;
    if (button.textContent !== action.name) button.textContent = action.name;
    button.setAttribute("data-confirm", action.confirm ? "true" : "false");
  }
  const link = findClass(root, "rd-device-link");
  if (link && view.remoteAdmin && link.getAttribute("href") !== view.remoteAdmin) {
    link.setAttribute("href", view.remoteAdmin);
  }
  for (const line of view.diagnostics) {
    const row = byEntity(root, line.entityId);
    if (!row) continue;
    setText(row, "rd-device-name", line.name);
    setText(row, "rd-device-value", formatLine(line));
  }
}

function updateRow(update: UpdateControl, handlers: DeviceHandlers): HTMLElement {
  const row = el("div", "rd-device-update");
  row.setAttribute("data-entity", update.entityId);
  const copy = el("div", "rd-device-copy");
  const name = text("div", "rd-device-name", update.name);
  const title = text("p", "rd-device-meta rd-device-title", update.title ?? "");
  title.hidden = !update.title;
  const available = update.state === "on";
  const installed = text("p", "rd-device-meta rd-device-installed", versionText("Installed", update.installed));
  installed.hidden = !available;
  const latest = text("p", "rd-device-meta rd-device-latest", versionText("Latest", update.latest));
  latest.hidden = !available;
  copy.append(name, title, installed, latest);
  const install = document.createElement("button");
  install.type = "button";
  install.className = "rd-device-button rd-device-install";
  install.textContent = "Install";
  install.hidden = !available;
  install.addEventListener("click", () => handlers.onInstall(update.entityId));
  row.append(copy, install);
  return row;
}

function actionButton(action: ButtonControl, handlers: DeviceHandlers): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rd-device-button rd-device-action";
  button.textContent = action.name;
  button.setAttribute("data-entity", action.entityId);
  button.setAttribute("data-confirm", action.confirm ? "true" : "false");
  button.addEventListener("click", () => handlers.onPress(action.entityId, action.confirm, action.name));
  return button;
}

function adminLink(href: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "rd-device-link";
  link.textContent = "Remote admin";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("href", href);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  return link;
}

function diagnostics(lines: readonly SensorLine[]): HTMLElement {
  const details = el("details", "rd-device-diagnostics");
  const summary = text("summary", "rd-device-summary", "Diagnostics");
  const body = el("div", "rd-device-lines");
  for (const line of lines) {
    const row = el("div", "rd-device-line");
    row.setAttribute("data-entity", line.entityId);
    row.append(text("span", "rd-device-name", line.name), text("span", "rd-device-value", formatLine(line)));
    body.append(row);
  }
  details.append(summary, body);
  return details;
}

function versionText(label: string, version: string | undefined): string {
  return `${label} ${version ?? ""}`.trim();
}

function formatLine(line: SensorLine): string {
  if (line.deviceClass === "timestamp" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line.state)) {
    const date = new Date(line.state);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  if (line.unit) return `${line.state} ${line.unit}`;
  return line.state;
}

function findSection(parent: HTMLElement): HTMLElement | undefined {
  for (const child of parent.children) {
    if (hasClass(child as HTMLElement, "rd-device")) return child as HTMLElement;
  }
  return undefined;
}

function byEntity(root: HTMLElement, entityId: string): HTMLElement | undefined {
  const walk = (node: HTMLElement): HTMLElement | undefined => {
    if (node.getAttribute("data-entity") === entityId) return node;
    for (const child of node.children) {
      const found = walk(child as HTMLElement);
      if (found) return found;
    }
    return undefined;
  };
  return walk(root);
}

function setText(root: HTMLElement, className: string, value: string): void {
  const node = findClass(root, className);
  if (node && node.textContent !== value) node.textContent = value;
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

function el(tag: keyof HTMLElementTagNameMap, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function text(tag: keyof HTMLElementTagNameMap, className: string, value: string): HTMLElement {
  const node = el(tag, className);
  node.textContent = value;
  return node;
}
