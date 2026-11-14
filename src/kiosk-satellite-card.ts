import {
  alarmServiceCall,
  buildModel,
  parseConfig,
  type ButtonControl,
  type CardConfig,
  type DeviceEntry,
  type EntityState,
  type LightControl,
  type RegistryEntry,
  type SatelliteModel,
  type SelectControl,
  type SensorLine,
  type SwitchControl,
  type UpdateControl,
  type VolumeControl,
} from "./model";

interface Hass {
  states: Record<string, EntityState>;
  devices?: Record<
    string,
    {
      id: string;
      name?: string | null;
      name_by_user?: string | null;
      manufacturer?: string | null;
      model?: string | null;
    }
  >;
  entities?: Record<string, RegistryEntry & { entity_id?: string }>;
  services?: Record<string, Record<string, unknown> | undefined>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    returnResponse?: boolean,
  ) => Promise<unknown>;
  localize?: (key: string) => string;
}

type SettingControl = VolumeControl | SelectControl | SwitchControl | ButtonControl | LightControl;

interface SliderElement extends HTMLElement {
  min: number;
  max: number;
  step: number;
  value: number;
}

interface SwitchElement extends HTMLElement {
  checked: boolean;
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

interface AlarmEntry {
  time: string;
  label: string;
  days: string[];
  enabled: boolean;
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
    {
      name: "style",
      selector: {
        select: {
          options: [
            { value: "panel", label: "Panel" },
            { value: "button", label: "Button" },
          ],
        },
      },
    },
  ],
  computeLabel(schema: { name?: string }): string | undefined {
    if (schema.name === "device") return "Kiosk satellite";
    if (schema.name === "style") return "Style";
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
  display: block;
  width: 100%;
  background: var(--ha-card-background);
  color: var(--primary-text-color);
}
.panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 16px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.section + .section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--divider-color);
}
.label {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--secondary-text-color);
}
.device-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--primary-text-color);
}
.muted {
  margin: 0;
  color: var(--secondary-text-color);
}
.line,
.switch-row,
.control-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.line,
.switch-row {
  min-height: 48px;
}
.value {
  color: var(--secondary-text-color);
  text-align: right;
}
.control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
ha-control-slider {
  display: block;
  width: 100%;
  min-height: 40px;
  --control-slider-color: var(--primary-color);
}
button,
select,
input[type="time"],
input[type="text"] {
  min-height: 48px;
  padding: 8px 16px;
  border: 1px solid var(--divider-color);
  border-radius: 8px;
  background: var(--ha-card-background);
  color: var(--primary-text-color);
  font: inherit;
}
button {
  cursor: pointer;
}
button.accent {
  color: var(--primary-color);
  border-color: var(--primary-color);
}
select,
input[type="time"],
input[type="text"] {
  width: 100%;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.now {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.art {
  width: 88px;
  height: 88px;
  object-fit: cover;
  flex: 0 0 auto;
  background: var(--divider-color);
}
.now-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.track {
  margin: 0;
  font-size: 1.05rem;
}
.button-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--primary-text-color);
}
.button-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.button-name {
  font-size: 1.05rem;
}
ha-icon {
  color: var(--primary-color);
  --mdc-icon-size: 28px;
  flex: 0 0 auto;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  color: var(--secondary-text-color);
}
.days {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.days label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  color: var(--primary-text-color);
}
.days input {
  width: 20px;
  height: 20px;
}
.alarm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding-top: 8px;
}
.ringing {
  margin: 0;
  font-weight: 600;
  color: var(--primary-color);
}
.error {
  margin: 0;
  color: var(--primary-color);
}
.dialog-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
a {
  color: var(--primary-color);
  min-height: 48px;
  display: inline-flex;
  align-items: center;
}
details {
  width: 100%;
}
summary {
  min-height: 48px;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--secondary-text-color);
}
.missing p {
  margin: 0 0 8px;
}
`;

function devicesFrom(hass: Hass): DeviceEntry[] {
  if (!hass.devices) return [];
  return Object.entries(hass.devices).map(([key, device]) => ({
    ...device,
    id: device.id || key,
  }));
}

function entitiesFrom(hass: Hass): RegistryEntry[] {
  if (!hass.entities) return [];
  return Object.entries(hass.entities).map(([key, entry]) => ({
    ...entry,
    entity_id: entry.entity_id || key,
  }));
}

function alarmScriptAvailable(hass: Hass): boolean {
  return Boolean(hass.services?.script?.kiosk_satellite_alarms) || Boolean(hass.states?.["script.kiosk_satellite_alarms"]);
}

function isIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function sensorValue(line: SensorLine): string {
  if (line.deviceClass === "timestamp" && isIso(line.state)) return new Date(line.state).toLocaleString();
  if (line.unit) return `${line.state} ${line.unit}`;
  return line.state;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} %`;
}

function deviceClassOf(hass: Hass | undefined, entityId: string | undefined): string | undefined {
  if (!hass || !entityId) return undefined;
  const value = hass.states[entityId]?.attributes?.device_class;
  return typeof value === "string" ? value : undefined;
}

function nextAlarmText(state: string | undefined, deviceClass: string | undefined): string {
  if (!state || state === "unknown" || state === "unavailable") return "None";
  if ((deviceClass === "timestamp" || deviceClass === undefined) && isIso(state)) return new Date(state).toLocaleString();
  return state;
}

function localeTimestamp(state: string | undefined): string | undefined {
  if (!state || state === "unknown" || state === "unavailable") return undefined;
  if (!isIso(state)) return undefined;
  return new Date(state).toLocaleString();
}

function shortAlarmTime(state: string | undefined): string | undefined {
  if (!state || state === "unknown" || state === "unavailable") return undefined;
  if (!isIso(state)) return undefined;
  return new Date(state).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function buttonSubtitle(model: SatelliteModel): string {
  const playing = model.media.state === "playing" || model.media.state === "paused";
  const primary = playing ? (model.media.title ?? "") : (model.assistState ?? "");
  const alarm = shortAlarmTime(model.alarms.nextAlarm);
  if (primary && alarm) return `${primary} · ${alarm}`;
  return primary || alarm || "";
}

function trackLabel(model: SatelliteModel): string {
  if (model.media.title) return model.media.title;
  return model.media.state ?? "";
}

function showBrightness(light: LightControl): boolean {
  return typeof light.brightness === "number" || light.state === "on";
}

function isVolume(control: SettingControl): control is VolumeControl {
  return "min" in control && "step" in control && "max" in control;
}

function isLight(control: SettingControl): control is LightControl {
  return "brightness" in control && "state" in control;
}

function isSelect(control: SettingControl): control is SelectControl {
  return "options" in control;
}

function isSwitch(control: SettingControl): control is SwitchControl {
  return "on" in control;
}

function entityIds(model: SatelliteModel): string[] {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) ids.add(id);
  };
  add(model.assistEntityId);
  add(model.media.playerId);
  add(model.media.favoriteId);
  add(model.alarms.nextAlarmId);
  add(model.alarms.snoozedUntilId);
  add(model.alarms.ringingId);
  add(model.alarms.snoozeId);
  add(model.alarms.stopId);
  add(model.light?.entityId);
  add(model.light?.effectEntityId);
  const lists = [
    model.volumes,
    model.voiceSelects,
    model.voiceSwitches,
    model.timers,
    model.ambient,
    model.header,
    model.updates,
    model.actions,
    model.settings,
    model.diagnostics,
  ];
  for (const list of lists) {
    for (const item of list) add(item.entityId);
  }
  return [...ids].sort();
}

function structureSignature(style: CardConfig["style"], model: SatelliteModel): string {
  return [
    style,
    model.missing ? "missing" : "ready",
    model.alarms.scriptAvailable ? "script" : "noscript",
    entityIds(model).join("|"),
  ].join("::");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

/** The script response is the event payload. callService may still wrap it. */
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

function daysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function parseAlarm(value: unknown): AlarmEntry | undefined {
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

function parseAlarmList(record: Record<string, unknown>): AlarmEntry[] | undefined {
  const raw = Array.isArray(record.alarms) ? record.alarms : Array.isArray(record.list) ? record.list : undefined;
  if (!raw) return undefined;
  return raw.map(parseAlarm).filter((item): item is AlarmEntry => item !== undefined);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const record = asRecord(error);
  if (record && typeof record.message === "string" && record.message) return record.message;
  return String(error);
}

function eventNumber(event: Event): number | undefined {
  const detail = (event as CustomEvent<{ value?: unknown }>).detail?.value;
  if (typeof detail === "number" && Number.isFinite(detail)) return detail;
  if (typeof detail === "string" && detail.trim()) {
    const parsed = Number(detail);
    if (Number.isFinite(parsed)) return parsed;
  }
  const value = (event.currentTarget as { value?: unknown } | null)?.value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function optionList(options: string[], value: string): string[] {
  if (value && value !== "unknown" && value !== "unavailable" && !options.includes(value)) return [value, ...options];
  return options;
}

class KioskSatelliteCard extends HTMLElement {
  private _config?: CardConfig;
  private _hass?: Hass;
  private model?: SatelliteModel;
  private signature?: string;
  private readonly dragging = new Set<string>();
  private syncing = false;
  private muted = 0;
  private readonly sliderStamp = new Map<string, number>();
  private alarmError?: string;
  private alarmItems?: AlarmEntry[];
  private alarmPaintKey = "";
  private alarmDevice?: string;

  private readonly endDrag = (): void => {
    this.dragging.clear();
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigForm(): typeof CONFIG_FORM {
    return CONFIG_FORM;
  }

  getConfigForm(): typeof CONFIG_FORM {
    return KioskSatelliteCard.getConfigForm();
  }

  static getStubConfig(hass?: Hass): CardConfig {
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
    return { device: match?.id ?? "", style: "panel" };
  }

  getCardSize(): number {
    return this._config?.style === "button" ? 1 : 4;
  }

  setConfig(config: unknown): void {
    this._config = parseConfig(config);
    this.renderCard();
  }

  get hass(): Hass | undefined {
    return this._hass;
  }

  set hass(value: Hass) {
    this._hass = value;
    this.renderCard();
  }

  connectedCallback(): void {
    window.addEventListener("pointerup", this.endDrag);
    window.addEventListener("pointercancel", this.endDrag);
    this.renderCard();
  }

  disconnectedCallback(): void {
    window.removeEventListener("pointerup", this.endDrag);
    window.removeEventListener("pointercancel", this.endDrag);
    this.dragging.clear();
  }

  private renderCard(): void {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const model = buildModel({
      deviceId: this._config.device,
      devices: devicesFrom(this._hass),
      entities: entitiesFrom(this._hass),
      states: this._hass.states ?? {},
      alarmScript: alarmScriptAvailable(this._hass),
    });
    if (this.alarmDevice !== model.deviceId) {
      this.alarmDevice = model.deviceId;
      this.alarmError = undefined;
      this.alarmItems = undefined;
      this.alarmPaintKey = "";
    }
    this.model = model;
    const signature = structureSignature(this._config.style, model);
    if (this.signature !== signature || !this.shadowRoot.querySelector("ha-card")) {
      const dialog = this.shadowRoot.querySelector("[data-dialog]") as DialogElement | null;
      const wasOpen = Boolean(dialog?.open);
      this.signature = signature;
      this.build(model);
      if (wasOpen) this.openDialog();
      this.alarmPaintKey = "";
      this.paintAlarmResult();
    }
    this.patch(model);
  }

  private build(model: SatelliteModel): void {
    const root = this.shadowRoot;
    if (!root) return;
    let style = root.querySelector("style");
    if (!style) {
      style = document.createElement("style");
      style.textContent = CSS;
      root.append(style);
    }
    root.querySelector("ha-card")?.remove();
    const card = document.createElement("ha-card");
    if (model.missing) card.append(this.missingView());
    else if (this._config?.style === "button") card.append(this.buttonRow(), this.dialogShell());
    else card.append(this.panel(model));
    root.append(card);
  }

  private missingView(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "missing panel";
    const id = document.createElement("p");
    id.className = "device-name";
    id.dataset.part = "missing-id";
    const message = document.createElement("p");
    message.textContent = "Kiosk satellite not found";
    wrap.append(id, message);
    return wrap;
  }

  private buttonRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "button-row";
    row.tabIndex = 0;
    row.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      this.openDialog();
    });
    row.addEventListener("keydown", (event) => {
      if (event.target !== row) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.openDialog();
    });

    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:tablet-dashboard");
    icon.setAttribute("aria-hidden", "true");

    const copy = document.createElement("div");
    copy.className = "button-copy";
    const name = document.createElement("div");
    name.className = "button-name";
    name.dataset.part = "button-name";
    const subtitle = document.createElement("div");
    subtitle.className = "muted";
    subtitle.dataset.part = "button-subtitle";
    copy.append(name, subtitle);

    row.append(icon, copy);
    const snoozeId = this.model?.alarms.snoozeId;
    const stopId = this.model?.alarms.stopId;
    if (snoozeId || stopId) {
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.dataset.ringing = "";
      actions.hidden = !this.model?.alarms.ringing;
      if (snoozeId) actions.append(this.alarmPress("Snooze", "snooze"));
      if (stopId) actions.append(this.alarmPress("Stop", "stop"));
      row.append(actions);
    }
    return row;
  }

  private dialogShell(): HTMLElement {
    const dialog = document.createElement("ha-dialog") as DialogElement;
    dialog.dataset.dialog = "";
    dialog.addEventListener("closed", () => {
      dialog.open = false;
    });

    const heading = document.createElement("div");
    heading.slot = "heading";
    heading.className = "dialog-heading";
    const title = document.createElement("span");
    title.className = "device-name";
    title.dataset.part = "dialog-name";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => {
      this.closeDialog();
    });
    heading.append(title, close);

    const model = this.model;
    dialog.append(heading, model ? this.panel(model) : document.createElement("div"));
    return dialog;
  }

  private panel(model: SatelliteModel): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.dataset.panel = "";
    const sections = [
      this.headerSection(),
      this.nowPlayingSection(model),
      this.volumeSection(model),
      this.alarmSection(model),
      this.voiceSection(model),
      this.lightSection(model),
      this.settingsSection(model),
      this.deviceSection(model),
    ];
    for (const section of sections) {
      if (section) panel.append(section);
    }
    return panel;
  }

  private section(title: string | undefined, part: string): HTMLElement {
    const node = document.createElement("section");
    node.className = "section";
    node.dataset.section = part;
    if (title) {
      const heading = document.createElement("h3");
      heading.className = "label";
      heading.textContent = title;
      node.append(heading);
    }
    return node;
  }

  private headerSection(): HTMLElement {
    const section = this.section(undefined, "header");
    const name = document.createElement("h2");
    name.className = "device-name";
    name.dataset.part = "title";
    const assist = document.createElement("p");
    assist.className = "muted";
    assist.dataset.part = "assist";
    const sensors = document.createElement("div");
    sensors.dataset.part = "header-sensors";
    for (const line of this.model?.header ?? []) sensors.append(this.sensorLine(line));
    section.append(name, assist, sensors);
    return section;
  }

  private nowPlayingSection(model: SatelliteModel): HTMLElement | undefined {
    if (!model.media.playerId) return undefined;
    const section = this.section("Now playing", "now-playing");
    const row = document.createElement("div");
    row.className = "now";
    const image = document.createElement("img");
    image.className = "art";
    image.alt = "";
    image.dataset.part = "picture";
    image.hidden = true;
    const copy = document.createElement("div");
    copy.className = "now-copy";
    const title = document.createElement("p");
    title.className = "track";
    title.dataset.part = "track";
    const artist = document.createElement("p");
    artist.className = "muted";
    artist.dataset.part = "artist";
    copy.append(title, artist);
    row.append(image, copy);

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      this.mediaButton("Previous", "media_previous_track"),
      this.mediaButton("Play", "play"),
      this.mediaButton("Next", "media_next_track"),
    );
    if (model.media.favoriteId) {
      const favorite = document.createElement("button");
      favorite.type = "button";
      favorite.textContent = "Favorite";
      favorite.addEventListener("click", () => this.press(this.model?.media.favoriteId));
      actions.append(favorite);
    }
    section.append(row, actions);
    return section;
  }

  private mediaButton(label: string, action: "media_previous_track" | "media_next_track" | "play"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "accent";
    button.textContent = label;
    if (action === "play") button.dataset.part = "play";
    button.addEventListener("click", () => {
      const playerId = this.model?.media.playerId;
      if (!playerId) return;
      const service =
        action === "play" ? (this.model?.media.state === "playing" ? "media_pause" : "media_play") : action;
      this.callService("media_player", service, undefined, { entity_id: playerId });
    });
    return button;
  }

  private volumeSection(model: SatelliteModel): HTMLElement | undefined {
    if (model.volumes.length === 0) return undefined;
    const section = this.section("Volume", "volume");
    for (const volume of model.volumes) section.append(this.volumeControl(volume, true));
    return section;
  }

  private volumeControl(volume: VolumeControl, percent: boolean): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "control";
    const head = document.createElement("div");
    head.className = "control-head";
    const name = document.createElement("span");
    name.dataset.label = volume.entityId;
    name.textContent = volume.name;
    const readout = document.createElement("span");
    readout.className = "value";
    readout.dataset.readout = volume.entityId;
    readout.dataset.format = percent ? "percent" : "number";
    head.append(name, readout);
    wrap.append(head, this.slider(volume.entityId, "volume"));
    return wrap;
  }

  private slider(entityId: string, kind: "volume" | "brightness"): SliderElement {
    const slider = document.createElement("ha-control-slider") as SliderElement;
    slider.dataset.slider = entityId;
    slider.dataset.kind = kind;
    const stamp = `${kind}:${entityId}`;
    slider.addEventListener(
      "pointerdown",
      () => {
        this.dragging.add(entityId);
        this.sliderStamp.delete(stamp);
      },
      true,
    );
    const commit = (event: Event) => {
      if (this.syncing || this.muted > 0) return;
      const value = eventNumber(event);
      if (value === undefined || this.sliderStamp.get(stamp) === value) return;
      this.sliderStamp.set(stamp, value);
      if (kind === "brightness") this.setBrightness(entityId, value);
      else this.setNumber(entityId, value);
      const readout = this.byEntity("data-readout", entityId);
      if (readout) {
        readout.textContent = readout.dataset.format === "percent" ? formatPercent(value) : formatNumber(value);
      }
    };
    slider.addEventListener("value-changed", commit);
    slider.addEventListener("change", commit);
    return slider;
  }

  private alarmSection(model: SatelliteModel): HTMLElement | undefined {
    const alarms = model.alarms;
    const hasSensors = Boolean(alarms.nextAlarmId || alarms.snoozedUntilId || alarms.ringingId || alarms.snoozeId || alarms.stopId);
    if (!hasSensors && !alarms.scriptAvailable) return undefined;
    const section = this.section("Alarms", "alarms");
    if (alarms.ringingId || alarms.snoozeId || alarms.stopId) {
      const line = document.createElement("p");
      line.className = "ringing";
      line.dataset.ringing = "";
      line.textContent = "Alarm ringing";
      line.hidden = !alarms.ringing;
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.dataset.ringing = "";
      actions.hidden = !alarms.ringing;
      if (alarms.snoozeId) actions.append(this.alarmPress("Snooze", "snooze"));
      if (alarms.stopId) actions.append(this.alarmPress("Stop", "stop"));
      section.append(line, actions);
    }
    if (alarms.nextAlarmId) {
      section.append(this.labeledValue("Next alarm", "next-alarm"));
    }
    if (alarms.snoozedUntilId) {
      const row = this.labeledValue("Snoozed until", "snoozed-until");
      row.dataset.snoozed = "";
      section.append(row);
    }
    if (alarms.scriptAvailable) {
      section.append(this.alarmForm(), this.listButton(), this.alarmResultHost());
    }
    return section;
  }

  private labeledValue(label: string, part: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "line";
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("span");
    value.className = "value";
    value.dataset.part = part;
    row.append(name, value);
    return row;
  }

  private alarmPress(label: string, which: "snooze" | "stop"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "accent";
    button.textContent = label;
    button.dataset.ringing = "";
    button.dataset.alarmPress = which;
    button.hidden = !this.model?.alarms.ringing;
    const stop = (event: Event) => {
      event.stopPropagation();
    };
    button.addEventListener("pointerdown", stop);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = which === "snooze" ? this.model?.alarms.snoozeId : this.model?.alarms.stopId;
      this.press(id);
    });
    return button;
  }

  private alarmForm(): HTMLElement {
    const form = document.createElement("div");
    form.dataset.alarmForm = "";
    const time = document.createElement("label");
    time.className = "field";
    time.append("Time");
    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.dataset.alarmTime = "";
    time.append(timeInput);

    const label = document.createElement("label");
    label.className = "field";
    label.append("Label");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.dataset.alarmLabel = "";
    label.append(labelInput);

    const days = document.createElement("div");
    days.className = "days";
    for (const [value, text] of DAYS) {
      const boxLabel = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = value;
      box.dataset.alarmDay = "";
      boxLabel.append(box, document.createTextNode(text));
      days.append(boxLabel);
    }

    const set = document.createElement("button");
    set.type = "button";
    set.className = "accent";
    set.textContent = "Set";
    set.addEventListener("click", () => {
      const entry = this.readAlarmForm();
      if (!entry.time) {
        this.alarmError = "Time is required";
        this.paintAlarmResult();
        return;
      }
      void this.runAlarm("set", entry);
    });
    form.append(time, label, days, set);
    return form;
  }

  private listButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "List";
    button.addEventListener("click", () => {
      void this.runAlarm("list");
    });
    return button;
  }

  private alarmResultHost(): HTMLElement {
    const host = document.createElement("div");
    host.dataset.alarmResult = "";
    return host;
  }

  private readAlarmForm(): { time: string; label: string; days: string[] } {
    const root = this.shadowRoot;
    let time = root?.querySelector<HTMLInputElement>("[data-alarm-time]")?.value ?? "";
    if (time.length > 5) time = time.slice(0, 5);
    const label = root?.querySelector<HTMLInputElement>("[data-alarm-label]")?.value.trim() ?? "";
    const days: string[] = [];
    const boxes = root?.querySelectorAll<HTMLInputElement>("[data-alarm-day]");
    if (boxes) {
      for (const box of boxes) {
        if (box.checked) days.push(box.value);
      }
    }
    return { time, label, days };
  }

  private voiceSection(model: SatelliteModel): HTMLElement | undefined {
    if (model.voiceSelects.length === 0 && model.voiceSwitches.length === 0 && model.timers.length === 0) return undefined;
    const section = this.section("Voice", "voice");
    for (const select of model.voiceSelects) section.append(this.selectControl(select));
    for (const toggle of model.voiceSwitches) section.append(this.switchControl(toggle));
    for (const line of model.timers) section.append(this.sensorLine(line));
    return section;
  }

  private selectControl(control: SelectControl): HTMLElement {
    const field = document.createElement("label");
    field.className = "field";
    const name = document.createElement("span");
    name.dataset.label = control.entityId;
    name.textContent = control.name;
    const select = document.createElement("select");
    select.dataset.select = control.entityId;
    select.addEventListener("change", () => {
      if (this.syncing || this.muted > 0) return;
      this.callService("select", "select_option", { option: select.value }, { entity_id: control.entityId });
    });
    field.append(name, select);
    return field;
  }

  private switchControl(control: SwitchControl): HTMLElement {
    return this.toggleRow(control.entityId, control.name, "switch");
  }

  private toggleRow(entityId: string, name: string, domain: "switch" | "light"): HTMLElement {
    const row = document.createElement("div");
    row.className = "switch-row";
    const label = document.createElement("span");
    label.dataset.label = entityId;
    label.textContent = name;
    const toggle = document.createElement("ha-switch") as SwitchElement;
    toggle.dataset.switch = entityId;
    toggle.dataset.domain = domain;
    toggle.addEventListener("change", () => {
      if (this.syncing || this.muted > 0) return;
      if (domain === "light") {
        this.callService("light", toggle.checked ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
      } else {
        this.callService("switch", toggle.checked ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
      }
    });
    row.append(label, toggle);
    return row;
  }

  private lightSection(model: SatelliteModel): HTMLElement | undefined {
    if (!model.light && model.ambient.length === 0) return undefined;
    const section = this.section("Light", "light");
    if (model.light) section.append(this.lightControl(model.light));
    for (const line of model.ambient) section.append(this.sensorLine(line));
    return section;
  }

  private lightControl(light: LightControl): HTMLElement {
    const wrap = document.createElement("div");
    wrap.dataset.light = light.entityId;
    wrap.append(this.toggleRow(light.entityId, light.name, "light"));
    const brightness = document.createElement("div");
    brightness.className = "control";
    brightness.dataset.brightnessWrap = light.entityId;
    const head = document.createElement("div");
    head.className = "control-head";
    const name = document.createElement("span");
    name.textContent = "Brightness";
    const readout = document.createElement("span");
    readout.className = "value";
    readout.dataset.readout = light.entityId;
    readout.dataset.format = "number";
    head.append(name, readout);
    brightness.append(head, this.slider(light.entityId, "brightness"));
    wrap.append(brightness);
    if (light.effectEntityId) {
      wrap.append(
        this.selectControl({
          entityId: light.effectEntityId,
          name: "Effect",
          options: light.effectOptions,
          value: light.effect ?? "",
        }),
      );
    }
    return wrap;
  }

  private settingsSection(model: SatelliteModel): HTMLElement | undefined {
    if (model.settings.length === 0) return undefined;
    const section = this.section("Settings", "settings");
    for (const control of model.settings) section.append(this.settingControl(control));
    return section;
  }

  private settingControl(control: SettingControl): HTMLElement {
    if (isVolume(control)) return this.volumeControl(control, false);
    if (isLight(control)) return this.lightControl(control);
    if (isSelect(control)) return this.selectControl(control);
    if (isSwitch(control)) return this.switchControl(control);
    return this.pressButton(control);
  }

  private pressButton(control: ButtonControl): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pressButton = control.entityId;
    button.dataset.confirm = control.confirm ? "true" : "false";
    button.textContent = control.name;
    button.addEventListener("click", () => {
      const confirm = button.dataset.confirm === "true";
      this.press(button.dataset.pressButton, confirm, button.textContent ?? "");
    });
    return button;
  }

  private deviceSection(model: SatelliteModel): HTMLElement | undefined {
    if (model.updates.length === 0 && model.actions.length === 0 && !model.remoteAdmin && model.diagnostics.length === 0) {
      return undefined;
    }
    const section = this.section("Device", "device");
    for (const update of model.updates) section.append(this.updateControl(update));
    if (model.actions.length > 0) {
      const actions = document.createElement("div");
      actions.className = "actions";
      for (const action of model.actions) actions.append(this.pressButton(action));
      section.append(actions);
    }
    if (model.remoteAdmin) {
      const link = document.createElement("a");
      link.dataset.part = "remote-admin";
      link.textContent = "Remote admin";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.href = model.remoteAdmin;
      section.append(link);
    }
    if (model.diagnostics.length > 0) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Diagnostics";
      const body = document.createElement("div");
      for (const line of model.diagnostics) body.append(this.sensorLine(line));
      details.append(summary, body);
      section.append(details);
    }
    return section;
  }

  private updateControl(update: UpdateControl): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "control";
    wrap.dataset.update = update.entityId;
    const name = document.createElement("div");
    name.dataset.part = "name";
    const title = document.createElement("p");
    title.className = "muted";
    title.dataset.part = "title";
    const installed = document.createElement("p");
    installed.className = "muted";
    installed.dataset.part = "installed";
    const latest = document.createElement("p");
    latest.className = "muted";
    latest.dataset.part = "latest";
    const install = document.createElement("button");
    install.type = "button";
    install.className = "accent";
    install.dataset.part = "install";
    install.textContent = "Install";
    install.addEventListener("click", () => {
      this.callService("update", "install", undefined, { entity_id: update.entityId });
    });
    wrap.append(name, title, installed, latest, install);
    return wrap;
  }

  private sensorLine(line: SensorLine): HTMLElement {
    const row = document.createElement("div");
    row.className = "line";
    row.dataset.line = line.entityId;
    const name = document.createElement("span");
    name.dataset.part = "name";
    name.textContent = line.name;
    const value = document.createElement("span");
    value.className = "value";
    value.dataset.part = "value";
    value.textContent = sensorValue(line);
    row.append(name, value);
    return row;
  }

  private patch(model: SatelliteModel): void {
    this.syncing = true;
    this.muted += 1;
    try {
      if (model.missing) {
        this.setText("missing-id", model.deviceId);
        return;
      }
      this.setText("title", model.name);
      this.setText("button-name", model.name);
      this.setText("dialog-name", model.name);
      this.setText("button-subtitle", buttonSubtitle(model));
      const assist = this.piece("assist");
      if (assist) {
        assist.textContent = model.assistState ?? "";
        assist.hidden = !model.assistState;
      }
      this.patchLines(model.header);
      this.patchLines(model.timers);
      this.patchLines(model.ambient);
      this.patchLines(model.diagnostics);
      this.patchMedia(model);
      this.patchVolumes(model);
      this.patchAlarms(model);
      this.patchSelects(model);
      this.patchSwitches(model);
      this.patchLights(model);
      this.patchUpdates(model);
      this.patchButtons(model);
      this.patchRemote(model);
      const ringingNodes = this.shadowRoot?.querySelectorAll<HTMLElement>("[data-ringing]");
      if (ringingNodes) {
        for (const node of ringingNodes) node.hidden = !model.alarms.ringing;
      }
    } finally {
      this.syncing = false;
      queueMicrotask(() => {
        this.muted = Math.max(0, this.muted - 1);
      });
    }
  }

  private patchMedia(model: SatelliteModel): void {
    const image = this.piece("picture") as HTMLImageElement | null;
    if (image) {
      const picture = model.media.picture;
      if (picture) {
        if (image.getAttribute("src") !== picture) image.src = picture;
        image.hidden = false;
      } else {
        image.removeAttribute("src");
        image.hidden = true;
      }
    }
    this.setText("track", trackLabel(model));
    const artist = this.piece("artist");
    if (artist) {
      artist.textContent = model.media.artist ?? "";
      artist.hidden = !model.media.artist;
    }
    const play = this.piece("play");
    if (play) play.textContent = model.media.state === "playing" ? "Pause" : "Play";
  }

  private patchVolumes(model: SatelliteModel): void {
    const volumes = new Map<string, { control: VolumeControl; percent: boolean }>();
    for (const control of model.volumes) volumes.set(control.entityId, { control, percent: true });
    for (const control of model.settings) {
      if (isVolume(control)) volumes.set(control.entityId, { control, percent: false });
    }
    for (const [entityId, entry] of volumes) {
      this.setLabel(entityId, entry.control.name);
      const readout = this.byEntity("data-readout", entityId);
      if (readout) readout.dataset.format = entry.percent ? "percent" : "number";
      const text =
        entry.control.value === null
          ? ""
          : entry.percent
            ? formatPercent(entry.control.value)
            : formatNumber(entry.control.value);
      this.patchSlider(entityId, entry.control.value, entry.control.min, entry.control.max, entry.control.step, text);
    }
  }

  private patchSlider(
    entityId: string,
    value: number | null,
    min: number,
    max: number,
    step: number,
    text: string,
  ): void {
    const readout = this.byEntity("data-readout", entityId);
    const slider = this.byEntity("data-slider", entityId) as SliderElement | null;
    if (this.dragging.has(entityId)) return;
    if (readout && readout.textContent !== text) readout.textContent = text;
    if (!slider) return;
    if (Number(slider.min) !== min) slider.min = min;
    if (Number(slider.max) !== max) slider.max = max;
    if (Number(slider.step) !== step) slider.step = step;
    const next = value === null ? min : value;
    if (Number(slider.value) !== next) slider.value = next;
  }

  private patchAlarms(model: SatelliteModel): void {
    const next = this.piece("next-alarm");
    if (next) {
      next.textContent = nextAlarmText(model.alarms.nextAlarm, deviceClassOf(this._hass, model.alarms.nextAlarmId));
    }
    const snoozed = this.piece("snoozed-until");
    const snoozedRow = snoozed?.parentElement;
    if (snoozed && snoozedRow) {
      const formatted = localeTimestamp(model.alarms.snoozedUntil);
      snoozed.textContent = formatted ?? "";
      snoozedRow.hidden = !formatted;
    }
  }

  private patchSelects(model: SatelliteModel): void {
    const selects = new Map<string, SelectControl>();
    for (const control of model.voiceSelects) selects.set(control.entityId, control);
    for (const control of model.settings) {
      if (isSelect(control)) selects.set(control.entityId, control);
    }
    if (model.light?.effectEntityId) {
      selects.set(model.light.effectEntityId, {
        entityId: model.light.effectEntityId,
        name: "Effect",
        options: model.light.effectOptions,
        value: model.light.effect ?? "",
      });
    }
    for (const light of model.settings) {
      if (!isLight(light) || !light.effectEntityId) continue;
      selects.set(light.effectEntityId, {
        entityId: light.effectEntityId,
        name: "Effect",
        options: light.effectOptions,
        value: light.effect ?? "",
      });
    }
    for (const [entityId, control] of selects) {
      this.setLabel(entityId, control.name);
      const select = this.byEntity("data-select", entityId) as HTMLSelectElement | null;
      if (!select) continue;
      const options = optionList(control.options, control.value);
      const signature = options.join("\n");
      if (select.dataset.options !== signature) {
        select.replaceChildren();
        for (const option of options) {
          const node = document.createElement("option");
          node.value = option;
          node.textContent = option;
          select.append(node);
        }
        select.dataset.options = signature;
      }
      if (this.shadowRoot?.activeElement !== select && select.value !== control.value) select.value = control.value;
    }
  }

  private patchSwitches(model: SatelliteModel): void {
    const switches = new Map<string, boolean>();
    for (const control of model.voiceSwitches) switches.set(control.entityId, control.on);
    for (const control of model.settings) {
      if (isSwitch(control)) switches.set(control.entityId, control.on);
    }
    for (const [entityId, on] of switches) {
      const name = [...model.voiceSwitches, ...model.settings].find((item) => item.entityId === entityId)?.name;
      if (name) this.setLabel(entityId, name);
      this.setSwitch(entityId, on);
    }
  }

  private patchLights(model: SatelliteModel): void {
    const lights: LightControl[] = [];
    if (model.light) lights.push(model.light);
    for (const control of model.settings) {
      if (isLight(control)) lights.push(control);
    }
    for (const light of lights) {
      this.setLabel(light.entityId, light.name);
      this.setSwitch(light.entityId, light.state === "on");
      const wrap = this.byEntity("data-brightness-wrap", light.entityId);
      const show = showBrightness(light);
      if (wrap) wrap.hidden = !show;
      if (show) {
        const value = typeof light.brightness === "number" ? light.brightness : light.state === "on" ? 255 : 0;
        this.patchSlider(light.entityId, value, 0, 255, 1, formatNumber(value));
      }
    }
  }

  private setSwitch(entityId: string, on: boolean): void {
    const toggle = this.byEntity("data-switch", entityId) as SwitchElement | null;
    if (!toggle || this.shadowRoot?.activeElement === toggle) return;
    if (toggle.checked !== on) toggle.checked = on;
  }

  private patchUpdates(model: SatelliteModel): void {
    for (const update of model.updates) {
      const wrap = this.byEntity("data-update", update.entityId);
      if (!wrap) continue;
      const name = wrap.querySelector("[data-part='name']");
      if (name) name.textContent = update.name;
      const title = wrap.querySelector("[data-part='title']");
      if (title) {
        title.textContent = update.title ?? "";
        (title as HTMLElement).hidden = !update.title;
      }
      const available = update.state === "on";
      const installed = wrap.querySelector("[data-part='installed']");
      if (installed) {
        installed.textContent = `Installed ${update.installed ?? ""}`;
        (installed as HTMLElement).hidden = !available;
      }
      const latest = wrap.querySelector("[data-part='latest']");
      if (latest) {
        latest.textContent = `Latest ${update.latest ?? ""}`;
        (latest as HTMLElement).hidden = !available;
      }
      const install = wrap.querySelector("[data-part='install']");
      if (install) (install as HTMLElement).hidden = !available;
    }
  }

  private patchButtons(model: SatelliteModel): void {
    const buttons = new Map<string, ButtonControl>();
    for (const control of model.actions) buttons.set(control.entityId, control);
    for (const control of model.settings) {
      if (!isVolume(control) && !isLight(control) && !isSelect(control) && !isSwitch(control)) {
        buttons.set(control.entityId, control);
      }
    }
    const pressButtons = this.shadowRoot?.querySelectorAll<HTMLButtonElement>("[data-press-button]");
    if (!pressButtons) return;
    for (const button of pressButtons) {
      const control = buttons.get(button.dataset.pressButton ?? "");
      if (!control) continue;
      if (button.textContent !== control.name) button.textContent = control.name;
      button.dataset.confirm = control.confirm ? "true" : "false";
    }
  }

  private patchRemote(model: SatelliteModel): void {
    const link = this.piece("remote-admin") as HTMLAnchorElement | null;
    if (!link) return;
    if (model.remoteAdmin) {
      if (link.href !== model.remoteAdmin) link.href = model.remoteAdmin;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  }

  private patchLines(lines: SensorLine[]): void {
    for (const line of lines) {
      const row = this.byEntity("data-line", line.entityId);
      if (!row) continue;
      const name = row.querySelector("[data-part='name']");
      if (name && name.textContent !== line.name) name.textContent = line.name;
      const value = row.querySelector("[data-part='value']");
      const text = sensorValue(line);
      if (value && value.textContent !== text) value.textContent = text;
    }
  }

  private paintAlarmResult(): void {
    const host = this.shadowRoot?.querySelector("[data-alarm-result]");
    if (!host) return;
    const key = JSON.stringify({ error: this.alarmError ?? "", alarms: this.alarmItems ?? null });
    if (key === this.alarmPaintKey) return;
    this.alarmPaintKey = key;
    host.replaceChildren();
    if (this.alarmError) {
      const error = document.createElement("p");
      error.className = "error";
      error.dataset.alarmError = "";
      error.textContent = this.alarmError;
      host.append(error);
    }
    for (const alarm of this.alarmItems ?? []) host.append(this.alarmRow(alarm));
  }

  private alarmRow(alarm: AlarmEntry): HTMLElement {
    const row = document.createElement("div");
    row.className = "alarm";
    const text = document.createElement("div");
    text.className = "line";
    const summary = document.createElement("span");
    const parts = [alarm.time, alarm.label].filter(Boolean);
    summary.textContent = parts.join(" ");
    const meta = document.createElement("span");
    meta.className = "value";
    const detail = [alarm.days.join(", "), alarm.enabled ? "On" : "Off"].filter(Boolean);
    meta.textContent = detail.join(" · ");
    text.append(summary, meta);

    const actions = document.createElement("div");
    actions.className = "actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = alarm.enabled ? "Turn off" : "Turn on";
    toggle.addEventListener("click", () => {
      void this.runAlarm(alarm.enabled ? "turn_off" : "turn_on", {
        time: alarm.time,
        label: alarm.label,
        days: alarm.days,
      });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      void this.runAlarm("delete", { time: alarm.time, label: alarm.label, days: alarm.days });
    });
    actions.append(toggle, remove);
    row.append(text, actions);
    return row;
  }

  private async runAlarm(
    action: "list" | "set" | "turn_on" | "turn_off" | "delete",
    extra?: { time?: string; label?: string; days?: string[] },
  ): Promise<void> {
    const hass = this._hass;
    const kioskName = this.model?.alarms.kioskName;
    const device = this._config?.device;
    if (!hass || !kioskName || !device) return;
    const call = alarmServiceCall(action, kioskName, extra);
    try {
      const result = await hass.callService(call.domain, call.service, call.data, undefined, true);
      if (this._config?.device !== device) return;
      this.applyAlarmRecord(unwrapAlarmPayload(result));
    } catch (error) {
      if (this._config?.device !== device) return;
      this.alarmError = errorMessage(error);
      this.paintAlarmResult();
    }
  }

  private applyAlarmRecord(record: Record<string, unknown> | undefined): void {
    if (record?.ok === false) {
      this.alarmError =
        typeof record.error === "string" && record.error.trim() ? record.error : "Alarm request failed";
    } else {
      this.alarmError = undefined;
    }
    if (record) {
      const alarms = parseAlarmList(record);
      if (alarms) this.alarmItems = alarms;
    }
    this.paintAlarmResult();
  }

  private openDialog(): void {
    const dialog = this.shadowRoot?.querySelector("[data-dialog]") as DialogElement | null;
    if (!dialog) return;
    dialog.open = true;
  }

  private closeDialog(): void {
    const dialog = this.shadowRoot?.querySelector("[data-dialog]") as DialogElement | null;
    if (!dialog) return;
    dialog.open = false;
  }

  private press(entityId: string | undefined, confirm = false, name = ""): void {
    if (!entityId) return;
    if (confirm && !window.confirm(name)) return;
    this.callService("button", "press", undefined, { entity_id: entityId });
  }

  private setNumber(entityId: string, value: number): void {
    this.callService("number", "set_value", { value }, { entity_id: entityId });
  }

  private setBrightness(entityId: string, value: number): void {
    const brightness = Math.max(0, Math.min(255, Math.round(value)));
    this.callService("light", "turn_on", { brightness }, { entity_id: entityId });
  }

  private callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): void {
    const hass = this._hass;
    if (!hass) return;
    void hass.callService(domain, service, data, target).catch(() => undefined);
  }

  private piece(name: string): HTMLElement | null {
    const node = this.shadowRoot?.querySelector(`[data-part="${name}"]`);
    return node instanceof HTMLElement ? node : null;
  }

  private setText(part: string, text: string): void {
    const node = this.piece(part);
    if (node && node.textContent !== text) node.textContent = text;
  }

  private setLabel(entityId: string, name: string): void {
    const node = this.byEntity("data-label", entityId);
    if (node && node.textContent !== name) node.textContent = name;
  }

  private byEntity(attribute: string, entityId: string): HTMLElement | null {
    const nodes = this.shadowRoot?.querySelectorAll<HTMLElement>(`[${attribute}]`);
    if (!nodes) return null;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.getAttribute(attribute) === entityId) return node;
    }
    return null;
  }
}

if (!customElements.get("kiosk-satellite-card")) {
  customElements.define("kiosk-satellite-card", KioskSatelliteCard);
}

const w = window as unknown as { customCards?: Array<Record<string, unknown>> };
w.customCards = w.customCards || [];
if (!w.customCards.some((card) => card.type === "kiosk-satellite-card")) {
  w.customCards.push({
    type: "kiosk-satellite-card",
    name: "Helpmeet: Kiosk Satellite Card",
    description: "Controls for one Kiosk Satellite: volume, alarms, voice, and the device.",
    preview: true,
  });
}
