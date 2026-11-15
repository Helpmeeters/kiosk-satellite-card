import type { SatelliteModel } from "./model";
import { POPUP_SURFACE, popupSurfaceCss } from "./redisplay-popup";

export interface PowerActionView {
  entityId: string;
  name: string;
  confirm: boolean;
}

export interface PowerView {
  /** Restart app, then Restart device, when the device has them. */
  actions: PowerActionView[];
  /** Remote admin URL. The menu labels it Device admin. */
  admin?: string;
}

export interface PowerHandlers {
  /** button.press. `confirm` is true for Restart app and Restart device. */
  onPress: (entityId: string, confirm: boolean, name: string) => void;
}

const POWER_ACTIONS = ["restart app", "restart device"] as const;
const SVG_NS = "http://www.w3.org/2000/svg";
const POWER_PATH =
  "M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z";

const handlersFor = new WeakMap<HTMLElement, PowerHandlers>();
const layouts = new WeakMap<HTMLElement, string>();
const outside = new WeakMap<HTMLElement, (event: Event) => void>();

/**
 * Restart app, Restart device, and Device admin for the header power menu.
 * Undefined when the device has none of them.
 */
export function buildPower(model: SatelliteModel): PowerView | undefined {
  const actions = POWER_ACTIONS.flatMap((name) => {
    const found = model.actions.find((item) => normalize(item.name) === name);
    return found ? [{ entityId: found.entityId, name: found.name, confirm: found.confirm }] : [];
  });
  if (actions.length === 0 && !model.remoteAdmin) return undefined;
  const view: PowerView = { actions };
  if (model.remoteAdmin) view.admin = model.remoteAdmin;
  return view;
}

export const powerCss = `
.rd-power {
  position: relative;
  flex: 0 0 auto;
  line-height: 0;
}
.rd-power-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--primary-text-color);
  cursor: pointer;
}
.rd-power-button svg {
  width: 18px;
  height: 18px;
  display: block;
}
.rd-power-button[aria-expanded="true"] {
  background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
}
.rd-power-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-power-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  min-width: 168px;
  padding: 6px;
  overflow: auto;
  line-height: 1.3;
  ${popupSurfaceCss}
}
.rd-power-item {
  display: block;
  min-height: 36px;
  margin: 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px;
  background: ${POPUP_SURFACE};
  color: var(--primary-text-color);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.3;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.rd-power-item:hover,
.rd-power-item:focus-visible {
  background: color-mix(in srgb, var(--primary-text-color) 8%, ${POPUP_SURFACE});
}
.rd-power [hidden] {
  display: none !important;
}
`;

export function renderPower(parent: HTMLElement, view: PowerView | undefined, handlers: PowerHandlers): void {
  handlersFor.set(parent, handlers);
  if (!view) {
    const existing = findRoot(parent);
    if (existing) unbind(existing);
    layouts.delete(parent);
    parent.replaceChildren();
    return;
  }
  const key = layoutKey(view);
  let root = findRoot(parent);
  if (!root || layouts.get(parent) !== key) {
    const open = root ? isOpen(root) : false;
    if (root) unbind(root);
    root = createRoot(parent, view);
    if (open) setOpen(root, true);
    layouts.set(parent, key);
    parent.replaceChildren(root);
    ensureOutside(root);
    return;
  }
  patchRoot(root, view);
}

function layoutKey(view: PowerView): string {
  return [
    view.actions.map((action) => `${action.entityId}:${action.confirm ? "1" : "0"}`).join(","),
    view.admin ?? "",
  ].join("|");
}

function createRoot(parent: HTMLElement, view: PowerView): HTMLElement {
  const root = el("div", "rd-power");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rd-power-button";
  button.setAttribute("aria-label", "Power");
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "rd-power-menu");
  button.append(powerIcon());
  button.addEventListener("click", () => toggle(root));
  root.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    setOpen(root, false);
  });
  const menu = el("div", "rd-power-menu");
  menu.id = "rd-power-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Power");
  menu.hidden = true;
  for (const action of view.actions) menu.append(actionItem(parent, action));
  if (view.admin) menu.append(adminItem(view.admin, () => setOpen(root, false)));
  root.append(button, menu);
  return root;
}

function patchRoot(root: HTMLElement, view: PowerView): void {
  for (const action of view.actions) {
    const item = byEntity(root, action.entityId);
    if (item && item.textContent !== action.name) item.textContent = action.name;
  }
  const link = findClass(root, "rd-power-admin");
  if (link && view.admin && link.getAttribute("href") !== view.admin) link.setAttribute("href", view.admin);
}

function actionItem(parent: HTMLElement, action: PowerActionView): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rd-power-item";
  button.textContent = action.name;
  button.setAttribute("role", "menuitem");
  button.setAttribute("data-entity", action.entityId);
  button.addEventListener("click", () => {
    const root = findRoot(parent);
    if (root) setOpen(root, false);
    handlersFor.get(parent)?.onPress(action.entityId, action.confirm, action.name);
  });
  return button;
}

function adminItem(href: string, close: () => void): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "rd-power-item rd-power-admin";
  link.textContent = "Device admin";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("role", "menuitem");
  link.setAttribute("href", href);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  link.addEventListener("click", close);
  return link;
}

function powerIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("fill", "currentColor");
  shape.setAttribute("d", POWER_PATH);
  svg.append(shape);
  return svg;
}

function toggle(root: HTMLElement): void {
  setOpen(root, !isOpen(root));
}

function isOpen(root: HTMLElement): boolean {
  return findClass(root, "rd-power-button")?.getAttribute("aria-expanded") === "true";
}

function setOpen(root: HTMLElement, open: boolean): void {
  const button = findClass(root, "rd-power-button");
  const menu = findClass(root, "rd-power-menu");
  if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
  if (menu) menu.hidden = !open;
}

function ensureOutside(root: HTMLElement): void {
  if (outside.has(root)) return;
  const doc = root.ownerDocument;
  if (!doc || typeof doc.addEventListener !== "function") return;
  const listener = (event: Event): void => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(root)) return;
    setOpen(root, false);
  };
  doc.addEventListener("pointerdown", listener);
  outside.set(root, listener);
}

function unbind(root: HTMLElement): void {
  const listener = outside.get(root);
  if (!listener) return;
  root.ownerDocument?.removeEventListener("pointerdown", listener);
  outside.delete(root);
}

function findRoot(parent: HTMLElement): HTMLElement | undefined {
  for (const child of parent.children) {
    if (hasClass(child as HTMLElement, "rd-power")) return child as HTMLElement;
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

function findClass(root: HTMLElement, className: string): HTMLElement | undefined {
  if (hasClass(root, className)) return root;
  for (const child of root.children) {
    const found = findClass(child as HTMLElement, className);
    if (found) return found;
  }
  return undefined;
}

function hasClass(element: HTMLElement, className: string): boolean {
  const value = element.className;
  if (typeof value !== "string") return false;
  return value.split(/\s+/).includes(className);
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/^vs\s+/, "");
}

function el(tag: "div", className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
