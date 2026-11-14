import { batteryFillWidth, batteryMark } from "./battery";
import { buildModel, parseConfig, type DeviceEntry, type EntityState, type RegistryEntry, type SatelliteModel } from "./model";
import {
  buildRedisplay,
  formatVolumeReadout,
  playbackMix,
  playerSnapshot,
  redisplayTab,
  type PlaybackMix,
  type PlayerSnapshot,
  type RedisplayView,
} from "./redisplay";
import {
  alarmListFromFailure,
  alarmListFromPayload,
  buildRedisplayAlarms,
  redisplayAlarmServiceCall,
  redisplayAlarmsCss,
  renderRedisplayAlarms,
  type AlarmScriptAction,
  type AlarmScriptExtra,
  type RedisplayAlarmList,
} from "./redisplay-alarms";
import { agentCss, buildAgent, renderAgent } from "./redisplay-agent";
import { buildDevice, deviceCss, renderDevice } from "./redisplay-device";
import { buildIntercom, intercomCss, renderIntercom } from "./redisplay-intercom";
import { assistStem, buildTimers, renderTimers, timerStartService, timersCss, type TimerStart } from "./redisplay-timers";

interface Hass {
  states: Record<string, EntityState>;
  devices?: Record<string, { id: string; name?: string | null; name_by_user?: string | null; manufacturer?: string | null }>;
  entities?: Record<string, RegistryEntry & { entity_id?: string }>;
  services?: Record<string, Record<string, unknown> | undefined>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    returnResponse?: boolean,
  ) => Promise<unknown>;
}

const CONFIG_FORM = {
  schema: [
    {
      name: "device",
      required: true,
      selector: {
        device: {
          manufacturer: "kiosk_satellite",
          entity: { domain: "assist_satellite" },
        },
      },
    },
  ],
  computeLabel(schema: { name?: string }): string | undefined {
    if (schema.name === "device") return "Kiosk satellite";
    return undefined;
  },
};

const CSS = `
:host {
  display: block;
  color: var(--primary-text-color);
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
[hidden] {
  display: none !important;
}
ha-card {
  position: relative;
  display: block;
  overflow: hidden;
  background: var(--ha-card-background, var(--card-background-color));
  color: var(--primary-text-color);
}
.wash {
  position: absolute;
  inset: -48px;
  width: calc(100% + 96px);
  height: calc(100% + 96px);
  object-fit: cover;
  filter: blur(40px);
  opacity: 0.4;
  pointer-events: none;
}
.scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 76%, transparent);
  pointer-events: none;
}
.face > :not(.wash):not(.scrim) {
  position: relative;
  z-index: 1;
}
.face,
.missing {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
}
.status {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.2;
}
.assist,
.alarm,
.snoozed,
.artist,
.album {
  margin: 2px 0 0;
  color: var(--secondary-text-color);
  font-size: 0.95rem;
  line-height: 1.3;
}
.alarm,
.snoozed {
  margin: 0;
  text-align: right;
  white-space: nowrap;
}
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--error-color, #ba1a1a) 16%, transparent);
}
.banner p {
  margin: 0;
  font-weight: 600;
  color: var(--error-color, #ba1a1a);
}
.banner .actions {
  display: flex;
  gap: 8px;
}
.stage {
  display: flow-root;
}
.art,
.placeholder {
  float: left;
  width: 112px;
  height: 112px;
  margin: 0 14px 8px 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
}
.art {
  object-fit: cover;
  display: block;
}
.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.15;
}
.progress {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  color: var(--secondary-text-color);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.track {
  height: 4px;
  border-radius: 999px;
  background: var(--divider-color, rgba(127, 127, 127, 0.35));
  overflow: hidden;
}
.fill {
  height: 100%;
  width: 0;
  background: var(--primary-color);
}
.transport {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.transport button.icon {
  width: 40px;
  height: 40px;
}
.transport button.icon.primary {
  width: 48px;
  height: 48px;
}
.transport button.icon svg {
  width: 20px;
  height: 20px;
}
button {
  border: none;
  color: inherit;
  background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
  cursor: pointer;
  font: inherit;
}
button.icon {
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
}
button.icon.primary {
  width: 64px;
  height: 64px;
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
}
button.icon span {
  display: grid;
}
button.icon svg {
  width: 24px;
  height: 24px;
  display: block;
}
button.text {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
}
.volume {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  clear: both;
  margin-top: 4px;
}
.volume input {
  width: 100%;
  accent-color: var(--primary-color);
}
.volume .value {
  min-width: 3.2em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--secondary-text-color);
}
.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 0;
}
.title-copy {
  min-width: 0;
}
.subtitle {
  margin: 2px 0 0;
  color: var(--secondary-text-color);
  font-size: 0.95rem;
  line-height: 1.3;
}
.battery {
  flex: 0 0 auto;
  color: var(--primary-text-color);
  line-height: 0;
  pointer-events: none;
}
.battery.is-low {
  color: var(--error-color);
}
.battery svg {
  display: block;
  width: 25px;
  height: 12px;
}
.battery-fill {
  fill: currentColor;
}
.battery-bolt {
  fill: var(--ha-card-background, var(--card-background-color, Canvas));
  stroke: currentColor;
  stroke-width: 0.6;
  stroke-linejoin: round;
}
.missing p {
  margin: 0;
}
.panels {
  position: relative;
  container-type: inline-size;
}
.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
@container (max-width: 340px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
.panel {
  padding: 16px 16px 12px;
}
.quiet {
  margin: 0;
  padding: 0;
  color: var(--secondary-text-color);
  font-size: 1.25rem;
  line-height: 1.35;
}
.panel .rd-alarms,
.panel .rd-timers,
.panel .rd-intercom,
.panel .rd-agent,
.panel .rd-device {
  margin: 0;
  padding: 0;
  border-top: 0;
}
.tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin: 2px 10px 10px;
  padding: 6px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
}
.tabs button {
  min-width: 0;
  min-height: 64px;
  margin: 0;
  padding: 8px 2px 6px;
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  color: var(--secondary-text-color);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.15;
  text-align: center;
  white-space: normal;
  cursor: pointer;
}
.tabs button svg {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
}
.tabs button span {
  display: block;
  max-width: 100%;
}
.tabs button[aria-selected="true"] {
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
}
.tabs button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
`;

const SVG_NS = "http://www.w3.org/2000/svg";

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("fill", "currentColor");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

const ICONS = {
  previous: "M6 6h2v12H6zm3.5 6 8.5 6V6z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  now: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
  alarms: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z",
  intercom: "M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 12 12 0 0 0 3.6.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 12 12 0 0 0 .55 3.6 1 1 0 0 1-.25 1L6.6 10.8z",
  agent: "M3 9v6h4l5 5V4L7 9H3zm13.5 3a5 5 0 0 1-2.5 4.03V7.97A5 5 0 0 1 16.5 12zM14 3.23v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77z",
  device: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm5 16.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z",
};

const TABS = [
  { id: "now", label: "Now playing", icon: ICONS.now },
  { id: "alarms", label: "Alarms & Timers", icon: ICONS.alarms },
  { id: "intercom", label: "Intercom", icon: ICONS.intercom },
  { id: "agent", label: "Voice Agent", icon: ICONS.agent },
  { id: "device", label: "Device", icon: ICONS.device },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** A remembered Timers or Alarms selection lands on the combined Alarms & Timers panel. */
function chosenTab(id: string): TabId {
  return redisplayTab(id);
}

function devicesFrom(hass: Hass): DeviceEntry[] {
  if (!hass.devices) return [];
  return Object.entries(hass.devices).map(([key, device]) => ({ ...device, id: device.id || key }));
}

function entitiesFrom(hass: Hass): RegistryEntry[] {
  if (!hass.entities) return [];
  return Object.entries(hass.entities).map(([key, entry]) => ({ ...entry, entity_id: entry.entity_id || key }));
}

function alarmScriptAvailable(hass: Hass): boolean {
  return Boolean(hass.services?.script?.kiosk_satellite_alarms) || Boolean(hass.states?.["script.kiosk_satellite_alarms"]);
}

function faceSignature(view: RedisplayView, mix: PlaybackMix | undefined): string {
  if (view.missing) return "missing";
  const volume = view.volume ? `${view.volume.source}:${view.volume.entityId ?? ""}:${view.volume.min}:${view.volume.max}:${view.volume.step}` : "";
  const master = mix ? `${mix.volume.entityId ?? ""}:${mix.volume.min}:${mix.volume.max}:${mix.volume.step}` : "";
  return [view.playerId ?? "", view.favoriteId ?? "", volume, master, view.snoozeId ?? "", view.stopId ?? ""].join("|");
}

function batteryIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 28 14");
  svg.setAttribute("aria-hidden", "true");
  const bolt = document.createElementNS(SVG_NS, "path");
  bolt.setAttribute("class", "battery-bolt");
  bolt.setAttribute("d", "M14.15 2.8 10.7 7.5h2.15l-1.05 3.7 4.55-5.2h-2.25z");
  svg.append(
    svgRect({
      x: "0.8",
      y: "0.8",
      width: "22.2",
      height: "12.4",
      rx: "2.4",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.4",
    }),
    svgRect({ x: "24.2", y: "4.4", width: "2.2", height: "5.2", rx: "0.8", fill: "currentColor" }),
    svgRect({ x: "2.4", y: "2.5", width: "0", height: "9", rx: "1.1", class: "battery-fill" }),
    bolt,
  );
  return svg;
}

function svgRect(attrs: Record<string, string>): SVGRectElement {
  const node = document.createElementNS(SVG_NS, "rect");
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

class KioskRedisplay extends HTMLElement {
  private deviceId?: string;
  private _hass?: Hass;
  private model?: SatelliteModel;
  private player?: PlayerSnapshot;
  private view?: RedisplayView;
  private signature?: string;
  private boundDevice?: string;
  private tab: TabId = "now";
  private alarmList?: RedisplayAlarmList;
  private alarmsPresence?: "view" | "empty";
  private timersKey?: string;
  private intercomKey?: string;
  private agentKey?: string;
  private deviceKey?: string;
  private mix?: PlaybackMix;
  private dragId?: string;
  private clock = 0;
  private readonly endDrag = (): void => {
    this.dragId = undefined;
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigForm(): typeof CONFIG_FORM {
    return CONFIG_FORM;
  }

  getConfigForm(): typeof CONFIG_FORM {
    return KioskRedisplay.getConfigForm();
  }

  static getStubConfig(hass?: Hass): { device: string } {
    const devices = hass?.devices ? Object.values(hass.devices) : [];
    const entities = hass?.entities ? Object.values(hass.entities) : [];
    const assistDevices = new Set(
      entities
        .filter((entry) => (entry.entity_id ?? "").startsWith("assist_satellite.") && entry.device_id)
        .map((entry) => entry.device_id as string),
    );
    const match = devices.find(
      (device) =>
        device.manufacturer === "kiosk_satellite" &&
        Boolean(device.id) &&
        (assistDevices.size === 0 || assistDevices.has(device.id)),
    );
    return { device: match?.id ?? "" };
  }

  getCardSize(): number {
    return 6;
  }

  setConfig(config: unknown): void {
    this.deviceId = parseConfig(config).device;
    this.renderCard();
  }

  set hass(value: Hass) {
    this._hass = value;
    this.renderCard();
  }

  connectedCallback(): void {
    window.addEventListener("pointerup", this.endDrag);
    window.addEventListener("pointercancel", this.endDrag);
    this.renderCard();
    this.clock = window.setInterval(() => this.advanceProgress(), 1000);
  }

  disconnectedCallback(): void {
    window.removeEventListener("pointerup", this.endDrag);
    window.removeEventListener("pointercancel", this.endDrag);
    window.clearInterval(this.clock);
    this.dragId = undefined;
  }

  private renderCard(): void {
    if (!this.shadowRoot || !this.deviceId || !this._hass) return;
    const deviceChanged = this.boundDevice !== this.deviceId;
    if (deviceChanged) {
      this.boundDevice = this.deviceId;
      this.alarmList = undefined;
      this.alarmsPresence = undefined;
      this.timersKey = undefined;
      this.intercomKey = undefined;
      this.agentKey = undefined;
      this.deviceKey = undefined;
      this.signature = undefined;
    }
    this.model = buildModel({
      deviceId: this.deviceId,
      devices: devicesFrom(this._hass),
      entities: entitiesFrom(this._hass),
      states: this._hass.states ?? {},
      alarmScript: alarmScriptAvailable(this._hass),
    });
    const playerId = this.model.media.playerId;
    this.player = playerSnapshot(playerId ? this._hass.states[playerId] : undefined);
    const view = buildRedisplay(this.model, this.player, Date.now());
    this.view = view;
    this.mix = playbackMix(this.model);
    this.ensureShell();
    if (deviceChanged) this.clearPanels();
    const signature = faceSignature(view, this.mix);
    if (this.signature !== signature) {
      this.signature = signature;
      const now = this.piece("panel-now");
      if (now) now.replaceChildren(view.missing ? this.missing() : this.face(view));
    }
    this.paint(view);
    this.paintAlarms();
    this.paintTimers();
    this.paintIntercom();
    this.paintAgent();
    this.paintDevice();
    this.paintBattery();
    this.showTab(this.tab);
  }

  private advanceProgress(): void {
    if (!this.model || !this.player || !this.view?.playing) return;
    const view = buildRedisplay(this.model, this.player, Date.now());
    this.view = view;
    this.paintProgress(view);
  }

  private ensureShell(): void {
    const root = this.shadowRoot;
    if (!root || root.querySelector("ha-card")) return;
    const style = document.createElement("style");
    style.textContent = CSS + redisplayAlarmsCss + timersCss + intercomCss + agentCss + deviceCss;
    const card = document.createElement("ha-card");
    card.dataset.card = "kiosk-redisplay";
    const header = document.createElement("header");
    header.className = "title-row";
    const copy = document.createElement("div");
    copy.className = "title-copy";
    const name = document.createElement("h2");
    name.className = "name";
    name.dataset.part = "name";
    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.dataset.part = "subtitle";
    copy.append(name, subtitle);
    const battery = document.createElement("div");
    battery.className = "battery";
    battery.dataset.part = "battery";
    battery.setAttribute("role", "img");
    battery.hidden = true;
    battery.append(batteryIcon());
    header.append(copy, battery);
    const panels = document.createElement("div");
    panels.className = "panels";
    for (const tab of TABS) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.dataset.part = `panel-${tab.id}`;
      panel.dataset.tab = tab.id;
      panel.id = `rd-panel-${tab.id}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-label", tab.label);
      if (tab.id === "alarms") {
        const columns = document.createElement("div");
        columns.className = "columns";
        const alarms = document.createElement("div");
        alarms.dataset.part = "alarms-host";
        const timers = document.createElement("div");
        timers.dataset.part = "timers-host";
        columns.append(alarms, timers);
        panel.append(columns);
      }
      panels.append(panel);
    }
    const nav = document.createElement("nav");
    nav.className = "tabs";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Kiosk Redisplay");
    for (const tab of TABS) nav.append(this.tabButton(tab));
    card.append(header, panels, nav);
    root.append(style, card);
  }

  private tabButton(tab: (typeof TABS)[number]): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.dataset.tab = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `rd-panel-${tab.id}`);
    button.setAttribute("aria-label", tab.label);
    const label = document.createElement("span");
    label.textContent = tab.label;
    button.append(icon(tab.icon), label);
    button.addEventListener("click", () => this.showTab(tab.id));
    return button;
  }

  private showTab(id: string): void {
    const selected = chosenTab(id);
    this.tab = selected;
    const label = TABS.find((tab) => tab.id === selected)?.label ?? "Now playing";
    this.setText("subtitle", label);
    for (const tab of TABS) {
      const panel = this.piece(`panel-${tab.id}`);
      if (panel) panel.hidden = tab.id !== selected;
      const button = this.shadowRoot?.querySelector(`.tabs button[data-tab="${tab.id}"]`);
      if (button instanceof HTMLButtonElement) {
        const on = tab.id === selected;
        button.setAttribute("aria-selected", on ? "true" : "false");
        button.tabIndex = on ? 0 : -1;
      }
    }
  }

  private clearPanels(): void {
    for (const tab of TABS) {
      if (tab.id === "now") continue;
      if (tab.id === "alarms") {
        this.piece("alarms-host")?.replaceChildren();
        this.piece("timers-host")?.replaceChildren();
        continue;
      }
      this.piece(`panel-${tab.id}`)?.replaceChildren();
    }
  }

  private missing(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "missing";
    const message = document.createElement("p");
    message.textContent = "Kiosk satellite not found";
    wrap.append(message);
    return wrap;
  }

  private face(view: RedisplayView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "face";

    const wash = document.createElement("img");
    wash.className = "wash";
    wash.alt = "";
    wash.dataset.part = "wash";
    wash.hidden = true;
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.dataset.part = "scrim";
    scrim.hidden = true;

    const status = document.createElement("div");
    status.className = "status";
    status.dataset.part = "status";
    const identity = document.createElement("div");
    const assist = document.createElement("p");
    assist.className = "assist";
    assist.dataset.part = "assist";
    identity.append(assist);
    const clocks = document.createElement("div");
    const alarm = document.createElement("p");
    alarm.className = "alarm";
    alarm.dataset.part = "alarm";
    const snoozed = document.createElement("p");
    snoozed.className = "snoozed";
    snoozed.dataset.part = "snoozed";
    clocks.append(alarm, snoozed);
    status.append(identity, clocks);

    const banner = document.createElement("div");
    banner.className = "banner";
    banner.dataset.part = "banner";
    const ringing = document.createElement("p");
    ringing.textContent = "Alarm ringing";
    const actions = document.createElement("div");
    actions.className = "actions";
    if (view.snoozeId) actions.append(this.textButton("Snooze", () => this.press(this.view?.snoozeId)));
    if (view.stopId) actions.append(this.textButton("Stop", () => this.press(this.view?.stopId)));
    banner.append(ringing, actions);

    const art = document.createElement("img");
    art.className = "art";
    art.dataset.part = "art";
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.dataset.part = "placeholder";

    const title = document.createElement("h3");
    title.className = "title";
    title.dataset.part = "title";
    const artist = document.createElement("p");
    artist.className = "artist";
    artist.dataset.part = "artist";
    const album = document.createElement("p");
    album.className = "album";
    album.dataset.part = "album";

    const progress = document.createElement("div");
    progress.className = "progress";
    progress.dataset.part = "progress";
    const elapsed = document.createElement("span");
    elapsed.dataset.part = "elapsed";
    const track = document.createElement("div");
    track.className = "track";
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.dataset.part = "fill";
    track.append(fill);
    const duration = document.createElement("span");
    duration.dataset.part = "duration";
    progress.append(elapsed, track, duration);

    const transport = document.createElement("div");
    transport.className = "transport";
    if (view.playerId) {
      transport.append(
        this.iconButton("Previous", ICONS.previous, () => this.transport("media_previous_track")),
        this.playButton(),
        this.iconButton("Next", ICONS.next, () => this.transport("media_next_track")),
      );
      if (view.favoriteId) transport.append(this.textButton("Favorite", () => this.press(this.view?.favoriteId)));
    }

    const stage = document.createElement("div");
    stage.className = "stage";
    stage.append(art, placeholder, title, artist, album, progress, transport);
    if (view.volume) stage.append(this.mediaVolume(view.volume));
    if (this.mix) stage.append(this.masterVolume(this.mix.volume));
    wrap.append(wash, scrim, status, banner, stage);
    return wrap;
  }

  private masterVolume(volume: PlaybackMix["volume"]): HTMLElement {
    return this.rangeRow("Volume", "Volume", "master-volume", "master-readout", volume, (value) => this.commitMaster(value));
  }

  private playButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon primary";
    button.dataset.part = "play";
    button.setAttribute("aria-label", "Play");
    const play = document.createElement("span");
    play.dataset.part = "play-icon";
    play.append(icon(ICONS.play));
    const pause = document.createElement("span");
    pause.dataset.part = "pause-icon";
    pause.hidden = true;
    pause.append(icon(ICONS.pause));
    button.append(play, pause);
    button.addEventListener("click", () => {
      this.transport(this.view?.playing ? "media_pause" : "media_play");
    });
    return button;
  }

  private iconButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon";
    button.setAttribute("aria-label", label);
    button.append(icon(path));
    button.addEventListener("click", onClick);
    return button;
  }

  private textButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private mediaVolume(volume: NonNullable<RedisplayView["volume"]>): HTMLElement {
    return this.rangeRow("Media", "Media volume", "volume", "volume-readout", volume, (value) => this.commitVolume(value));
  }

  private rangeRow(
    labelText: string,
    aria: string,
    part: string,
    readoutPart: string,
    volume: { min: number; max: number; step: number; value: number | null },
    commit: (value: number) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "volume";
    const label = document.createElement("span");
    label.textContent = labelText;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.dataset.part = part;
    slider.min = String(volume.min);
    slider.max = String(volume.max);
    slider.step = String(volume.step);
    slider.value = String(volume.value ?? volume.min);
    slider.setAttribute("aria-label", aria);
    slider.addEventListener("pointerdown", () => {
      this.dragId = part;
    });
    slider.addEventListener("input", () => {
      this.setText(readoutPart, formatVolumeReadout(Number(slider.value), volume.max));
    });
    slider.addEventListener("change", () => {
      this.dragId = undefined;
      commit(Number(slider.value));
    });
    const readout = document.createElement("span");
    readout.className = "value";
    readout.dataset.part = readoutPart;
    row.append(label, slider, readout);
    return row;
  }

  private paint(view: RedisplayView): void {
    this.setText("name", view.name);
    if (view.missing) return;
    this.setText("title", view.title);
    this.setText("artist", view.artist);
    this.hide("artist", view.artist.length === 0);
    this.setText("album", view.album);
    this.hide("album", view.album.length === 0);
    this.paintArt(view);
    this.setText("assist", view.assist ?? "");
    this.hide("assist", !view.assist);
    this.setText("alarm", view.nextAlarm ?? "");
    this.hide("alarm", !view.nextAlarm);
    this.setText("snoozed", view.snoozedUntil ? `Snoozed ${view.snoozedUntil}` : "");
    this.hide("snoozed", !view.snoozedUntil);
    this.hide("status", !view.assist && !view.nextAlarm && !view.snoozedUntil);
    this.hide("banner", !view.ringing);
    this.paintProgress(view);
    this.paintPlay(view);
    this.paintVolume(view);
    this.paintMix();
  }

  private paintArt(view: RedisplayView): void {
    const art = this.piece("art");
    const wash = this.piece("wash");
    const placeholder = this.piece("placeholder");
    const picture = view.picture;
    if (art instanceof HTMLImageElement && picture) {
      if (art.getAttribute("src") !== picture) art.src = picture;
      art.alt = view.title;
    }
    if (wash instanceof HTMLImageElement && picture && wash.getAttribute("src") !== picture) wash.src = picture;
    if (art) art.hidden = !picture;
    if (wash) wash.hidden = !picture;
    this.hide("scrim", !picture);
    if (placeholder) placeholder.hidden = Boolean(picture);
  }

  private paintProgress(view: RedisplayView): void {
    const shown = view.progress !== undefined && view.elapsed !== undefined && view.duration !== undefined;
    this.hide("progress", !shown);
    if (!shown || view.progress === undefined) return;
    this.setText("elapsed", view.elapsed ?? "");
    this.setText("duration", view.duration ?? "");
    const fill = this.piece("fill");
    if (fill) fill.style.width = `${view.progress * 100}%`;
  }

  private paintPlay(view: RedisplayView): void {
    const button = this.piece("play");
    const play = this.piece("play-icon");
    const pause = this.piece("pause-icon");
    if (button) button.setAttribute("aria-label", view.playing ? "Pause" : "Play");
    if (play) play.hidden = view.playing;
    if (pause) pause.hidden = !view.playing;
  }

  private paintVolume(view: RedisplayView): void {
    if (!view.volume) return;
    this.paintRange("volume", "volume-readout", view.volume.value, view.volume.max);
  }

  private paintMix(): void {
    const volume = this.mix?.volume;
    if (volume) this.paintRange("master-volume", "master-readout", volume.value, volume.max);
  }

  private paintRange(part: string, readout: string, value: number | null, max: number): void {
    if (this.dragId === part || value === null) return;
    const slider = this.piece(part);
    if (slider instanceof HTMLInputElement && Number(slider.value) !== value) slider.value = String(value);
    this.setText(readout, formatVolumeReadout(value, max));
  }

  private transport(service: string): void {
    const player = this.view?.playerId;
    if (!player) return;
    this.call("media_player", service, undefined, { entity_id: player });
  }

  private commitVolume(value: number): void {
    const volume = this.view?.volume;
    if (!volume || !Number.isFinite(value)) return;
    if (volume.source === "number" && volume.entityId) {
      this.call("number", "set_value", { value }, { entity_id: volume.entityId });
      return;
    }
    const player = this.view?.playerId;
    if (!player) return;
    this.call("media_player", "volume_set", { volume_level: value / 100 }, { entity_id: player });
  }

  private commitMaster(value: number): void {
    const entityId = this.mix?.volume?.entityId;
    if (!entityId || !Number.isFinite(value)) return;
    this.call("number", "set_value", { value }, { entity_id: entityId });
  }

  private press(entityId: string | undefined): void {
    if (!entityId) return;
    this.call("button", "press", undefined, { entity_id: entityId });
  }

  private call(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): void {
    const hass = this._hass;
    if (!hass) return;
    void hass.callService(domain, service, data, target).catch(() => undefined);
  }

  private paintAlarms(): void {
    const host = this.piece("alarms-host");
    const model = this.model;
    if (!host || !model) return;
    const view = buildRedisplayAlarms(model, this.alarmList);
    if (!view) {
      if (this.alarmsPresence !== "empty") {
        this.alarmsPresence = "empty";
        host.replaceChildren(this.quiet("No alarms"));
      }
      return;
    }
    this.alarmsPresence = "view";
    renderRedisplayAlarms(host, view, {
      onPress: (entityId) => this.call("button", "press", undefined, { entity_id: entityId }),
      onScript: (action, extra) => this.runAlarmScript(view.kioskName, action, extra),
      onError: (message) => {
        const next: RedisplayAlarmList = { error: message };
        if (this.alarmList?.alarms) next.alarms = this.alarmList.alarms;
        this.alarmList = next;
      },
    });
  }

  private runAlarmScript(kioskName: string, action: AlarmScriptAction, extra?: AlarmScriptExtra): void {
    const hass = this._hass;
    const device = this.deviceId;
    if (!hass || !kioskName || !device) return;
    const call = redisplayAlarmServiceCall(kioskName, action, extra);
    void hass
      .callService(call.domain, call.service, call.data, undefined, true)
      .then(
        (result) => {
          if (this.deviceId !== device) return;
          this.alarmList = alarmListFromPayload(result, this.alarmList);
          this.paintAlarms();
        },
        (error: unknown) => {
          if (this.deviceId !== device) return;
          this.alarmList = alarmListFromFailure(error, this.alarmList);
          this.paintAlarms();
        },
      );
  }

  private paintTimers(): void {
    const host = this.piece("timers-host");
    const model = this.model;
    if (!host || !model) return;
    const view = buildTimers(model) ?? { headline: "No timers" };
    const service = timerStartService(this._hass?.services, assistStem(model.assistEntityId));
    const sensors = model.timers.length > 0;
    if (!sensors && !service) {
      if (this.timersKey !== "empty") {
        this.timersKey = "empty";
        host.replaceChildren(this.quiet("No timers"));
      }
      return;
    }
    const key = JSON.stringify({ view, service: service ?? "" });
    if (key === this.timersKey && host.querySelector(".rd-timers")) return;
    this.timersKey = key;
    const start = service
      ? (data: TimerStart) => {
          this.call("esphome", service, { ...data });
        }
      : undefined;
    renderTimers(
      host,
      view,
      (entityId, on) => {
        this.call("switch", on ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
      },
      start,
    );
  }

  private paintIntercom(): void {
    const host = this.piece("panel-intercom");
    const model = this.model;
    if (!host || !model) return;
    const view = buildIntercom(model);
    const key = view ? JSON.stringify(view) : "";
    if (key === this.intercomKey) return;
    this.intercomKey = key;
    if (!view) {
      host.replaceChildren(this.quiet("No intercom switches"));
      return;
    }
    renderIntercom(
      host,
      view,
      (domain, service, data, target) => {
        this.call(domain, service, data, target);
      },
      (entityId, value) => {
        this.call("number", "set_value", { value }, { entity_id: entityId });
      },
    );
  }

  private paintAgent(): void {
    const host = this.piece("panel-agent");
    const model = this.model;
    if (!host || !model) return;
    const view = buildAgent(model);
    if (!view) {
      if (this.agentKey !== "") {
        this.agentKey = "";
        host.replaceChildren(this.quiet("No voice agent settings"));
      }
      return;
    }
    this.agentKey = "view";
    renderAgent(
      host,
      view,
      (domain, service, data, target) => {
        this.call(domain, service, data, target);
      },
      {
        onVolume: (entityId, value) => {
          this.call("number", "set_value", { value }, { entity_id: entityId });
        },
        onSwitch: (entityId, on) => {
          this.call("switch", on ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
        },
      },
    );
  }

  private paintDevice(): void {
    const host = this.piece("panel-device");
    const model = this.model;
    if (!host || !model) return;
    const view = buildDevice(model);
    if (!view) {
      if (this.deviceKey !== "") {
        this.deviceKey = "";
        host.replaceChildren(this.quiet("No device controls"));
      }
      return;
    }
    this.deviceKey = "view";
    renderDevice(host, view, {
      onInstall: (entityId) => {
        this.call("update", "install", undefined, { entity_id: entityId });
      },
      onPress: (entityId, confirm, name) => {
        if (confirm && !window.confirm(name)) return;
        this.press(entityId);
      },
      onSwitch: (entityId, on) => {
        this.call("switch", on ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
      },
    });
  }

  private paintBattery(): void {
    const node = this.piece("battery");
    const mark = this.model ? batteryMark(this.model.header) : undefined;
    if (node) node.hidden = !mark;
    if (!node) return;
    if (!mark) {
      node.removeAttribute("aria-label");
      return;
    }
    node.classList.toggle("is-low", mark.low);
    node.setAttribute("aria-label", mark.label);
    const fill = node.querySelector(".battery-fill");
    if (fill) {
      const width = batteryFillWidth(mark.percent);
      fill.setAttribute("width", width.toFixed(2));
      (fill as SVGElement).style.display = width <= 0 ? "none" : "";
    }
    const bolt = node.querySelector(".battery-bolt");
    if (bolt) (bolt as SVGElement).style.display = mark.charging ? "" : "none";
  }

  private quiet(text: string): HTMLElement {
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = text;
    return note;
  }

  private piece(name: string): HTMLElement | null {
    const node = this.shadowRoot?.querySelector(`[data-part="${name}"]`);
    return node instanceof HTMLElement ? node : null;
  }

  private setText(name: string, text: string): void {
    const node = this.piece(name);
    if (node && node.textContent !== text) node.textContent = text;
  }

  private hide(name: string, hidden: boolean): void {
    const node = this.piece(name);
    if (node) node.hidden = hidden;
  }
}

if (!customElements.get("kiosk-redisplay")) {
  customElements.define("kiosk-redisplay", KioskRedisplay);
}

const cardWindow = window as unknown as { customCards?: Array<Record<string, unknown>> };
cardWindow.customCards = cardWindow.customCards || [];
if (!cardWindow.customCards.some((card) => card.type === "kiosk-redisplay")) {
  cardWindow.customCards.push({
    type: "kiosk-redisplay",
    name: "Kiosk Redisplay",
    description: "Now playing, alarms and timers, intercom, voice agent, and device for an audio-only Kiosk Satellite.",
    preview: true,
  });
}
