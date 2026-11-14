import { buildModel, parseConfig, type DeviceEntry, type EntityState, type RegistryEntry, type SatelliteModel } from "./model";
import { buildRedisplay, playerSnapshot, type PlayerSnapshot, type RedisplayView } from "./redisplay";

interface Hass {
  states: Record<string, EntityState>;
  devices?: Record<string, { id: string; name?: string | null; name_by_user?: string | null; manufacturer?: string | null }>;
  entities?: Record<string, RegistryEntry & { entity_id?: string }>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
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
  gap: 12px;
  padding: 16px 16px 18px;
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
.timer,
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
.art,
.placeholder {
  width: min(72%, 280px);
  aspect-ratio: 1;
  margin: 4px auto 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
}
.art {
  object-fit: cover;
  display: block;
}
.title {
  margin: 4px 0 0;
  font-size: 1.6rem;
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
  justify-content: center;
  align-items: center;
  gap: 16px;
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
.missing p {
  margin: 0;
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
};

function devicesFrom(hass: Hass): DeviceEntry[] {
  if (!hass.devices) return [];
  return Object.entries(hass.devices).map(([key, device]) => ({ ...device, id: device.id || key }));
}

function entitiesFrom(hass: Hass): RegistryEntry[] {
  if (!hass.entities) return [];
  return Object.entries(hass.entities).map(([key, entry]) => ({ ...entry, entity_id: entry.entity_id || key }));
}

function faceSignature(view: RedisplayView): string {
  if (view.missing) return "missing";
  const volume = view.volume ? `${view.volume.source}:${view.volume.entityId ?? ""}:${view.volume.min}:${view.volume.max}:${view.volume.step}` : "";
  return [view.playerId ?? "", view.favoriteId ?? "", volume, view.snoozeId ?? "", view.stopId ?? ""].join("|");
}

class KioskRedisplay extends HTMLElement {
  private deviceId?: string;
  private _hass?: Hass;
  private model?: SatelliteModel;
  private player?: PlayerSnapshot;
  private view?: RedisplayView;
  private signature?: string;
  private dragging = false;
  private clock = 0;
  private readonly endDrag = (): void => {
    this.dragging = false;
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
    this.dragging = false;
  }

  private renderCard(): void {
    if (!this.shadowRoot || !this.deviceId || !this._hass) return;
    this.model = buildModel({
      deviceId: this.deviceId,
      devices: devicesFrom(this._hass),
      entities: entitiesFrom(this._hass),
      states: this._hass.states ?? {},
    });
    const playerId = this.model.media.playerId;
    this.player = playerSnapshot(playerId ? this._hass.states[playerId] : undefined);
    const view = buildRedisplay(this.model, this.player, Date.now());
    this.view = view;
    const signature = faceSignature(view);
    if (this.signature !== signature || !this.shadowRoot.querySelector("ha-card")) {
      this.signature = signature;
      this.build(view);
    }
    this.paint(view);
  }

  private advanceProgress(): void {
    if (!this.model || !this.player || !this.view?.playing) return;
    const view = buildRedisplay(this.model, this.player, Date.now());
    this.view = view;
    this.paintProgress(view);
  }

  private build(view: RedisplayView): void {
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
    card.dataset.card = "kiosk-redisplay";
    card.append(view.missing ? this.missing(view) : this.face(view));
    root.append(card);
  }

  private missing(view: RedisplayView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "missing";
    const id = document.createElement("p");
    id.className = "name";
    id.dataset.part = "missing-id";
    id.textContent = view.name;
    const message = document.createElement("p");
    message.textContent = "Kiosk satellite not found";
    wrap.append(id, message);
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
    const identity = document.createElement("div");
    const name = document.createElement("h2");
    name.className = "name";
    name.dataset.part = "name";
    const assist = document.createElement("p");
    assist.className = "assist";
    assist.dataset.part = "assist";
    identity.append(name, assist);
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

    wrap.append(wash, scrim, status, banner, art, placeholder, title, artist, album, progress, transport);
    if (view.volume) wrap.append(this.volumeControl(view));
    const timer = document.createElement("p");
    timer.className = "timer";
    timer.dataset.part = "timer";
    wrap.append(timer);
    return wrap;
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

  private volumeControl(view: RedisplayView): HTMLElement {
    const volume = view.volume;
    const row = document.createElement("div");
    row.className = "volume";
    const label = document.createElement("span");
    label.textContent = "Media";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.dataset.part = "volume";
    if (volume) {
      slider.min = String(volume.min);
      slider.max = String(volume.max);
      slider.step = String(volume.step);
      slider.value = String(volume.value ?? volume.min);
      slider.setAttribute("aria-label", "Media volume");
    }
    slider.addEventListener("pointerdown", () => {
      this.dragging = true;
    });
    slider.addEventListener("input", () => {
      this.setText("volume-readout", this.volumeText(Number(slider.value), view.volume?.max ?? 100));
    });
    slider.addEventListener("change", () => {
      this.dragging = false;
      this.commitVolume(Number(slider.value));
    });
    const readout = document.createElement("span");
    readout.className = "value";
    readout.dataset.part = "volume-readout";
    row.append(label, slider, readout);
    return row;
  }

  private paint(view: RedisplayView): void {
    if (view.missing) {
      this.setText("missing-id", view.name);
      return;
    }
    this.setText("name", view.name);
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
    this.hide("banner", !view.ringing);
    this.paintProgress(view);
    this.paintPlay(view);
    this.paintVolume(view);
    this.setText("timer", view.timer ?? "");
    this.hide("timer", !view.timer);
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
    if (this.dragging || !view.volume || view.volume.value === null) return;
    const slider = this.piece("volume");
    if (slider instanceof HTMLInputElement && Number(slider.value) !== view.volume.value) {
      slider.value = String(view.volume.value);
    }
    this.setText("volume-readout", this.volumeText(view.volume.value, view.volume.max));
  }

  private volumeText(value: number, max: number): string {
    const rounded = Math.round(value * 10) / 10;
    return max === 100 ? `${rounded}%` : String(rounded);
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

  private press(entityId: string | undefined): void {
    if (!entityId) return;
    this.call("button", "press", undefined, { entity_id: entityId });
  }

  private call(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): void {
    const hass = this._hass;
    if (!hass) return;
    void hass.callService(domain, service, data, target).catch(() => undefined);
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
    description: "A display for an audio-only Kiosk Satellite.",
    preview: true,
  });
}
