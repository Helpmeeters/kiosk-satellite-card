import { batteryFillWidth, batteryMark } from "./battery";
import {
  tabFromUserData,
  updatesPending,
  userDataGet,
  userDataSet,
  voiceMute,
  type StoredTab,
} from "./redisplay-header";
import { buildModel, parseConfig, type DeviceEntry, type EntityState, type RegistryEntry, type SatelliteModel } from "./model";
import {
  buildRedisplay,
  extractItemInLibrary,
  extractQueueFavorite,
  extractQueueTrackUri,
  formatElapsed,
  formatVolumeReadout,
  playbackMix,
  playerSnapshot,
  redisplayTab,
  type PlaybackMix,
  type PlayerSnapshot,
  type RedisplayView,
  type TimeLocale,
} from "./redisplay";
import { popupSurfaceCss } from "./redisplay-popup";
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
import { agentCss, agentHasPanel, buildAgent, renderAgent } from "./redisplay-agent";
import { buildDevice, deviceCss, renderDevice } from "./redisplay-device";
import { buildPower, powerCss, renderPower } from "./redisplay-power";
import { buildIntercom, intercomCss, renderIntercom, type IntercomModeId } from "./redisplay-intercom";
import {
  buildCollapsedView,
  isTileExpandEvent,
  isTitleBarToggleEvent,
  type CollapsedView,
} from "./redisplay-collapsed";
import {
  buildAskPrompt,
  extractConversationId,
  extractConversationSpeech,
  resolveAskPipeline,
  type AskPipelineInfo,
} from "./redisplay-ask";
import {
  assistStem,
  buildTimers,
  renderTimers,
  timerCancelService,
  timerListFromFailure,
  timerListFromPayload,
  timerListService,
  timerStartService,
  timersCss,
  type TimerList,
  type TimerStart,
} from "./redisplay-timers";

interface Hass {
  states: Record<string, EntityState>;
  locale?: TimeLocale;
  devices?: Record<
    string,
    { id: string; name?: string | null; name_by_user?: string | null; manufacturer?: string | null; area_id?: string | null }
  >;
  entities?: Record<string, RegistryEntry & { entity_id?: string }>;
  areas?: Record<string, { area_id?: string; name?: string | null }>;
  services?: Record<string, Record<string, unknown> | undefined>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    /** Show a toast when the call fails. This is not the response flag. */
    notifyOnError?: boolean,
    /** Include the service response. Required to read script.kiosk_satellite_alarms. */
    returnResponse?: boolean,
  ) => Promise<unknown>;
  /** Home Assistant websocket. Optional so a stub hass still typechecks. */
  callWS?: (message: Record<string, unknown>) => Promise<unknown>;
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
.wash,
.scrim {
  display: none;
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
  background: transparent;
}
.status {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.name {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  column-gap: 14px;
  align-items: start;
  min-width: 0;
  width: 100%;
}
.stage > .art,
.stage > .placeholder {
  grid-column: 1;
  grid-row: 1 / span 8;
  width: 112px;
  height: 112px;
  margin: 0;
}
.stage > :not(.art):not(.placeholder) {
  grid-column: 2;
  min-width: 0;
}
.art,
.placeholder {
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
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
  flex-wrap: nowrap;
  gap: 6px;
  width: 100%;
  min-width: 0;
  margin-top: 8px;
}
.transport button.icon {
  width: 40px;
  height: auto;
  aspect-ratio: 1;
  flex: 0 1 40px;
  min-width: 28px;
}
.transport button.icon.primary {
  width: 48px;
  height: auto;
  aspect-ratio: 1;
  flex: 0 1 48px;
  min-width: 34px;
}
.transport button.icon span {
  width: 100%;
  height: 100%;
  place-items: center;
}
.transport button.icon svg {
  width: 50%;
  height: 50%;
}
.transport button.icon.favorite,
.transport button.icon.library {
  width: 34px;
  height: auto;
  aspect-ratio: 1;
  flex: 0 1 34px;
  min-width: 24px;
}
.transport button.icon.favorite svg,
.transport button.icon.library svg {
  width: 50%;
  height: 50%;
}
.transport button.icon.favorite,
.transport button.icon.library {
  transition: color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}
.transport button.icon.favorite.is-busy,
.transport button.icon.library.is-busy {
  opacity: 0.6;
  pointer-events: none;
}
.transport button.icon.favorite.is-favorited,
.transport button.icon.library.is-in-library {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 16%, transparent);
}
.transport button.icon.favorite.is-pop svg,
.transport button.icon.library.is-pop svg {
  animation: rd-fav-pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3);
}
.transport button.icon.favorite.is-error,
.transport button.icon.library.is-error {
  color: var(--error-color, #ba1a1a);
  background: color-mix(in srgb, var(--error-color, #ba1a1a) 16%, transparent);
}
@keyframes rd-fav-pop {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.28);
  }
  100% {
    transform: scale(1);
  }
}
.stage .art.is-clickable,
.stage .placeholder.is-clickable,
.stage .title.is-clickable {
  cursor: pointer;
}
.progress.is-seekable .track {
  position: relative;
  height: 6px;
  cursor: pointer;
  touch-action: none;
}
.volume .speaker-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--secondary-text-color);
}
.volume .speaker-btn:hover {
  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  color: var(--primary-text-color);
}
.volume .speaker-btn.is-muted {
  color: var(--error-color, #ba1a1a);
}
.volume .speaker-btn svg {
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
}
.volume .speaker {
  display: grid;
  width: 22px;
  height: 22px;
  color: var(--secondary-text-color);
}
.volume .speaker svg {
  width: 22px;
  height: 22px;
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
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 0;
  cursor: pointer;
}
.title-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.title-copy {
  min-width: 0;
}
.title-power {
  flex: 0 0 auto;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 8px 10px 0;
  padding: 6px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
}
.tabs button.tab {
  min-width: 0;
  min-height: 76px;
  margin: 0;
  padding: 6px 2px 5px;
  border: none;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
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
.tabs button.tab svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}
.tabs button.tab span {
  display: block;
  max-width: 100%;
}
.tabs button.tab[aria-selected="true"] {
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
}
.tabs button.tab:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.rd-master,
.rd-info {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}
.rd-master-trigger,
.rd-mute,
.rd-info-button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--primary-text-color);
  cursor: pointer;
  font: inherit;
}
.rd-master-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 2px;
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.rd-master-trigger [data-part="master-icon"] {
  display: grid;
}
.rd-mute,
.rd-info-button {
  width: 24px;
  height: 24px;
  padding: 0;
  display: grid;
  place-items: center;
}
.rd-master-trigger svg,
.rd-mute svg,
.rd-info-button svg {
  width: 18px;
  height: 18px;
  display: block;
}
.rd-master-percent {
  white-space: nowrap;
}
.rd-master-trigger[aria-expanded="true"],
.rd-info-button[aria-expanded="true"] {
  background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
}
.rd-master-trigger:focus-visible,
.rd-mute:focus-visible,
.rd-info-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-mute.is-muted {
  color: var(--error-color, #ba1a1a);
  background: color-mix(in srgb, var(--error-color, #ba1a1a) 16%, transparent);
}
.rd-info-button.is-update,
.rd-info-button.is-update[aria-expanded="true"] {
  color: var(--warning-color, #f6c343);
}
.rd-info-button.is-update[aria-expanded="true"] {
  background: color-mix(in srgb, var(--warning-color, #f6c343) 18%, transparent);
}
.rd-master-menu,
.rd-info-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  ${popupSurfaceCss}
}
.rd-master-menu {
  display: flex;
  justify-content: center;
  padding: 12px 10px;
}
.rd-master-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 140px;
}
.rd-master-slot input {
  width: 140px;
  height: 28px;
  margin: 0;
  transform: rotate(-90deg);
  accent-color: var(--primary-color);
  cursor: pointer;
}
.rd-info-menu {
  width: min(360px, calc(100vw - 24px));
  max-height: min(70vh, 480px);
  overflow: auto;
  padding: 6px;
  line-height: 1.3;
}
.rd-info-menu .rd-device {
  margin: 0;
  padding: 8px;
  gap: 10px;
  border-top: 0;
}
.rd-info-menu .quiet {
  margin: 0;
  padding: 8px 12px;
  font-size: 0.95rem;
}
ha-card.is-collapsed .tabs {
  margin: 8px 10px 10px;
}
.mini-tile {
  position: relative;
  min-width: 0;
  min-height: 76px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  overflow: hidden;
  cursor: pointer;
}
.mini-now {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 6px;
}
.mini-now-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.mini-now-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.58));
  pointer-events: none;
}
.mini-now-play {
  position: relative;
  z-index: 1;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
  cursor: pointer;
}
.mini-now-play span {
  display: grid;
}
.mini-now-play svg {
  width: 18px;
  height: 18px;
  display: block;
}
.mini-now-transport {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 4px;
}
.mini-now-step {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 76%, transparent);
  color: var(--primary-text-color);
  cursor: pointer;
}
.mini-now-step svg {
  width: 14px;
  height: 14px;
  display: block;
}
.mini-now-play:disabled,
.mini-now-step:disabled,
.mini-intercom-mode:disabled {
  opacity: 0.45;
  cursor: default;
}
.mini-now-play:focus-visible,
.mini-now-step:focus-visible,
.mini-intercom-mode:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.mini-alarms,
.mini-agent {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 4px;
  text-align: center;
}
.mini-alarms.is-ringing {
  background: color-mix(in srgb, var(--error-color, #ba1a1a) 16%, transparent);
}
.mini-kicker {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--secondary-text-color);
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-value {
  font-size: 0.96rem;
  font-weight: 600;
  color: var(--primary-text-color);
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-alarms.is-ringing .mini-value {
  color: var(--error-color, #ba1a1a);
}
.mini-alarms.is-none .mini-value {
  color: var(--secondary-text-color);
  font-weight: 500;
}
.mini-agent .mini-value {
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: 0.9rem;
}
.mini-agent-assist {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  max-width: 100%;
  margin-top: 2px;
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.15;
  cursor: pointer;
}
.mini-agent-assist svg {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  display: block;
}
.mini-agent-assist span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-agent-assist:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-ask {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 16px 0;
}
ha-card.is-collapsed .rd-ask {
  margin: 0 10px 10px;
}
.rd-ask-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rd-ask-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.35));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 0.92rem;
}
.rd-ask-input::placeholder {
  color: var(--secondary-text-color);
}
.rd-ask-input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}
.rd-ask-input:disabled {
  opacity: 0.6;
  cursor: default;
}
.rd-ask-button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.rd-ask-button.is-busy {
  background: color-mix(in srgb, var(--primary-text-color) 14%, transparent);
  color: var(--primary-text-color);
}
.rd-ask-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-ask-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 999px;
  animation: rd-ask-spin 0.75s linear infinite;
}
@keyframes rd-ask-spin {
  to {
    transform: rotate(360deg);
  }
}
.rd-ask-reply {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--secondary-text-color);
  font-size: 0.84rem;
  line-height: 1.3;
}
.rd-ask-reply.is-error {
  color: var(--error-color, #ba1a1a);
  background: color-mix(in srgb, var(--error-color, #ba1a1a) 12%, transparent);
}
.rd-ask-reply-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.rd-ask-reply-close {
  flex: 0 0 auto;
  border: 0;
  padding: 0 2px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.mini-intercom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
}
.mini-intercom-mode {
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 2px 3px;
  border: 0;
  border-radius: 9px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.1;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-intercom-mode.is-on {
  background: var(--primary-color);
  color: var(--text-primary-color, #fff);
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
  speaker: "M3 9v6h4l5 5V4L7 9H3zm13.5 3a5 5 0 0 1-2.5 4.03V7.97A5 5 0 0 1 16.5 12zM14 3.23v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77z",
  mic: "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z",
  micOff: "M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9L19.73 21 21 19.73 4.27 3z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  alert: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
  chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
  mute: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z",
  stop: "M6 6h12v12H6z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  libraryAdd: "M19 11h-4v4h-2v-4H9V9h4V5h2v4h4m1-7H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M4 6H2v14a2 2 0 0 0 2 2h14v-2H4V6z",
  libraryIn: "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z",
};

const TABS = [
  { id: "now", label: "Now playing", icon: ICONS.now },
  { id: "alarms", label: "Alarms & Timers", icon: ICONS.alarms },
  { id: "intercom", label: "Intercom", icon: ICONS.intercom },
  { id: "agent", label: "Voice Agent", icon: ICONS.agent },
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

function massQueueAvailable(hass: Hass): boolean {
  return Boolean(hass.services?.music_assistant?.get_queue && hass.services?.mass_queue?.send_command);
}

function faceSignature(view: RedisplayView, mix: PlaybackMix | undefined): string {
  if (view.missing) return "missing";
  const volume = view.volume ? `${view.volume.source}:${view.volume.entityId ?? ""}:${view.volume.min}:${view.volume.max}:${view.volume.step}` : "";
  const master = mix ? `${mix.volume.entityId ?? ""}:${mix.volume.min}:${mix.volume.max}:${mix.volume.step}` : "";
  const caps = [
    view.canSeek ? "1" : "0",
    view.canMute ? "1" : "0",
    view.canShuffle ? "1" : "0",
    view.canRepeat ? "1" : "0",
    view.canStop ? "1" : "0",
    view.canPower ? "1" : "0",
    view.canGroup ? "1" : "0",
    view.canBrowse ? "1" : "0",
    view.canAddToLibrary ? "1" : "0",
  ].join("");
  return [view.playerId ?? "", view.favoriteId ?? "", volume, master, view.snoozeId ?? "", view.stopId ?? "", caps].join("|");
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

export class KioskRedisplay extends HTMLElement {
  static releaseMarker = "";

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
  private timerList?: TimerList;
  private timerListKey?: string;
  private timersKey?: string;
  private intercomKey?: string;
  private agentKey?: string;
  private deviceKey?: string;
  private mix?: PlaybackMix;
  private dragId?: string;
  private clock = 0;
  private collapsed = false;
  private collapsedView?: CollapsedView;
  private pendingMiniIntercomMode?: IntercomModeId;
  private assistPipelines?: AskPipelineInfo[];
  private assistPreferredPipeline?: string | null;
  private assistPipelinesLoading = false;
  private areaNames?: Record<string, string>;
  private areaNamesLoading = false;
  private askBusy = false;
  private askOpen = false;
  private askToken = 0;
  private askConversationId?: string;
  private favoriteState: "idle" | "busy" | "error" = "idle";
  private favoritePop = false;
  private favoriteResetTimer?: number;
  private favoriteTrackKey?: string;
  private trackFavorite?: boolean;
  private favoriteFetchToken = 0;
  private libraryState: "idle" | "busy" | "error" = "idle";
  private libraryPop = false;
  private libraryResetTimer?: number;
  private libraryTrackKey?: string;
  private trackInLibrary?: boolean;
  private trackUri?: string;
  private libraryFetchToken = 0;
  private massQueueConfigEntryId?: string;
  /** Device whose saved tab has already been requested. */
  private tabLoadKey?: string;
  /** The user picked a tab after this card was bound, so a late read must not overwrite it. */
  private tabTouched = false;
  private readonly endDrag = (): void => {
    this.dragId = undefined;
  };
  private readonly onPointerDown = (event: Event): void => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (!this.insidePart(path, "master")) this.setMenu("master", false);
    if (!this.insidePart(path, "info")) this.setMenu("info", false);
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
    return this.collapsed ? 2 : 6;
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
    window.addEventListener("pointerdown", this.onPointerDown);
    this.renderCard();
    this.clock = window.setInterval(() => this.advanceProgress(), 1000);
  }

  disconnectedCallback(): void {
    window.removeEventListener("pointerup", this.endDrag);
    window.removeEventListener("pointercancel", this.endDrag);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.clearInterval(this.clock);
    this.clearFavoriteTimer();
    this.favoriteState = "idle";
    this.favoritePop = false;
    this.favoriteFetchToken += 1;
    this.clearLibraryTimer();
    this.libraryState = "idle";
    this.libraryPop = false;
    this.libraryFetchToken += 1;
    this.dragId = undefined;
  }

  private renderCard(): void {
    if (!this.shadowRoot || !this.deviceId || !this._hass) return;
    const deviceChanged = this.boundDevice !== this.deviceId;
    if (deviceChanged) {
      this.boundDevice = this.deviceId;
      this.clearFavoriteTimer();
      this.favoriteState = "idle";
      this.favoritePop = false;
      this.favoriteTrackKey = undefined;
      this.trackFavorite = undefined;
      this.favoriteFetchToken += 1;
      this.clearLibraryTimer();
      this.libraryState = "idle";
      this.libraryPop = false;
      this.libraryTrackKey = undefined;
      this.trackInLibrary = undefined;
      this.trackUri = undefined;
      this.libraryFetchToken += 1;
      this.alarmList = undefined;
      this.alarmsPresence = undefined;
      this.timerList = undefined;
      this.timerListKey = undefined;
      this.timersKey = undefined;
      this.intercomKey = undefined;
      this.agentKey = undefined;
      this.deviceKey = undefined;
      this.signature = undefined;
      this.tab = "now";
      this.tabTouched = false;
      this.tabLoadKey = undefined;
      this.collapsed = this.readCollapsedState(this.deviceId);
      this.pendingMiniIntercomMode = undefined;
      this.askToken += 1;
      this.askBusy = false;
      this.askOpen = this.readAskOpenState(this.deviceId);
      this.askConversationId = undefined;
      this.clearAskReply();
      this.paintAskBusy();
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
    const view = buildRedisplay(this.model, this.player, Date.now(), this._hass.locale, {
      canAddToLibrary:
        massQueueAvailable(this._hass) &&
        (this.player.appId === "music_assistant" || Boolean(this.model.media.favoriteId)),
    });
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
    this.paintPower();
    this.paintMute();
    this.paintInfo();
    this.paintCollapsed();
    this.paintAsk();
    this.applyCollapsedState();
    this.loadSavedTab();
    this.loadAssistPipelines();
    this.loadAreaNames();
    this.showTab(this.tab);
  }

  private advanceProgress(): void {
    if (this.model && this.player && this.view?.playing) {
      const view = buildRedisplay(this.model, this.player, Date.now(), this._hass?.locale);
      this.view = view;
      this.paintProgress(view);
    }
    if (this.timerList?.timers?.some((entry) => entry.isActive && !entry.finished)) {
      this.paintTimers();
    }
    if (this.collapsed && this.collapsedView?.alarms.kind === "timer") {
      this.paintCollapsed();
    }
  }

  private ensureShell(): void {
    const root = this.shadowRoot;
    if (!root || root.querySelector("ha-card")) return;
    const style = document.createElement("style");
    style.textContent = CSS + redisplayAlarmsCss + timersCss + intercomCss + agentCss + deviceCss + powerCss;
    const card = document.createElement("ha-card");
    card.dataset.card = "kiosk-satellite-card";
    card.dataset.release = KioskRedisplay.releaseMarker;
    const header = document.createElement("header");
    header.className = "title-row";
    header.addEventListener("click", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : event.target ? [event.target] : [];
      if (!isTitleBarToggleEvent(path)) return;
      this.toggleCollapsed();
    });
    header.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
      this.setMenu("master", false);
      this.setMenu("info", false);
    });
    const copy = document.createElement("div");
    copy.className = "title-copy";
    const name = document.createElement("h2");
    name.className = "name";
    name.dataset.part = "name";
    copy.append(name);
    const tools = document.createElement("div");
    tools.className = "title-tools";
    const battery = document.createElement("div");
    battery.className = "battery";
    battery.dataset.part = "battery";
    battery.setAttribute("role", "img");
    battery.hidden = true;
    battery.append(batteryIcon());
    const power = document.createElement("div");
    power.className = "title-power";
    power.dataset.part = "power";
    tools.append(this.masterControl(), this.muteControl(), battery, this.infoControl(), power);
    header.append(copy, tools);
    const panels = document.createElement("div");
    panels.className = "panels";
    panels.dataset.part = "panels";
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
    nav.setAttribute("aria-label", "Kiosk Satellite Card");
    for (const tab of TABS) nav.append(this.tabButton(tab));
    const minis: ReadonlyArray<[TabId, HTMLElement]> = [
      ["now", this.miniNowTile()],
      ["alarms", this.miniAlarmsTile()],
      ["intercom", this.miniIntercomTile()],
      ["agent", this.miniAgentTile()],
    ];
    for (const [tabId, tile] of minis) {
      tile.addEventListener("click", (event) => {
        const path = typeof event.composedPath === "function" ? event.composedPath() : event.target ? [event.target] : [];
        if (!isTileExpandEvent(path)) return;
        this.expandToTab(tabId);
      });
      nav.append(tile);
    }
    card.addEventListener("click", (event) => {
      const path = event.composedPath();
      if (path.some((node) => node instanceof Element && node.classList.contains("rd-power-button"))) {
        this.setMenu("master", false);
        this.setMenu("info", false);
      }
    });
    card.append(header, nav, this.askBar(), panels);
    root.append(style, card);
  }

  private masterControl(): HTMLElement {
    const root = document.createElement("div");
    root.className = "rd-master";
    root.dataset.part = "master";
    root.hidden = true;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rd-master-trigger";
    button.dataset.part = "master-trigger";
    button.setAttribute("aria-label", "Volume");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "rd-master-menu");
    const glyph = document.createElement("span");
    glyph.dataset.part = "master-icon";
    glyph.append(icon(ICONS.speaker));
    const percent = document.createElement("span");
    percent.className = "rd-master-percent";
    percent.dataset.part = "master-readout";
    button.append(glyph, percent);
    button.addEventListener("click", () => this.toggleMenu("master"));
    const menu = document.createElement("div");
    menu.className = "rd-master-menu";
    menu.id = "rd-master-menu";
    menu.dataset.part = "master-menu";
    menu.hidden = true;
    const slot = document.createElement("div");
    slot.className = "rd-master-slot";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.dataset.part = "master-volume";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = "0";
    slider.setAttribute("aria-label", "Volume");
    slider.addEventListener("pointerdown", () => {
      this.dragId = "master-volume";
    });
    slider.addEventListener("input", () => {
      const max = Number(slider.max);
      this.setText("master-readout", formatVolumeReadout(Number(slider.value), Number.isFinite(max) ? max : 100));
    });
    slider.addEventListener("change", () => {
      this.dragId = undefined;
      this.commitMaster(Number(slider.value));
    });
    slot.append(slider);
    menu.append(slot);
    root.append(button, menu);
    return root;
  }

  private muteControl(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rd-mute";
    button.dataset.part = "mute";
    button.hidden = true;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Listening");
    const live = document.createElement("span");
    live.dataset.part = "mute-live";
    live.append(icon(ICONS.mic));
    const off = document.createElement("span");
    off.dataset.part = "mute-off";
    off.hidden = true;
    off.append(icon(ICONS.micOff));
    button.append(live, off);
    button.addEventListener("click", () => this.toggleMute());
    return button;
  }

  private infoControl(): HTMLElement {
    const root = document.createElement("div");
    root.className = "rd-info";
    root.dataset.part = "info";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rd-info-button";
    button.dataset.part = "info-button";
    button.setAttribute("aria-label", "Device");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "rd-info-menu");
    const mark = document.createElement("span");
    mark.dataset.part = "info-icon";
    mark.append(icon(ICONS.info));
    const alert = document.createElement("span");
    alert.dataset.part = "info-alert";
    alert.hidden = true;
    alert.append(icon(ICONS.alert));
    button.append(mark, alert);
    button.addEventListener("click", () => this.toggleMenu("info"));
    const menu = document.createElement("div");
    menu.className = "rd-info-menu";
    menu.id = "rd-info-menu";
    menu.dataset.part = "info-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Device");
    menu.hidden = true;
    const body = document.createElement("div");
    body.dataset.part = "device-body";
    menu.append(body);
    root.append(button, menu);
    return root;
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
    button.addEventListener("click", () => {
      if (!this.collapsed && this.tab === tab.id) {
        this.toggleCollapsed();
        return;
      }
      this.showTab(tab.id, true);
    });
    return button;
  }

  private showTab(id: string, persist = false): void {
    const selected = chosenTab(id);
    this.tab = selected;
    if (persist) {
      this.tabTouched = true;
      this.persistTab(selected);
    }
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
    const assist = document.createElement("p");
    assist.className = "assist";
    assist.dataset.part = "assist";
    status.append(assist);

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
    art.className = view.playerId ? "art is-clickable" : "art";
    art.dataset.part = "art";
    const placeholder = document.createElement("div");
    placeholder.className = view.playerId ? "placeholder is-clickable" : "placeholder";
    placeholder.dataset.part = "placeholder";

    const title = document.createElement("h3");
    title.className = view.playerId ? "title is-clickable" : "title";
    title.dataset.part = "title";
    if (view.playerId) {
      const open = () => this.openMoreInfo();
      art.addEventListener("click", open);
      placeholder.addEventListener("click", open);
      title.addEventListener("click", open);
    }
    const artist = document.createElement("p");
    artist.className = "artist";
    artist.dataset.part = "artist";
    const album = document.createElement("p");
    album.className = "album";
    album.dataset.part = "album";

    const progress = document.createElement("div");
    progress.className = view.canSeek ? "progress is-seekable" : "progress";
    progress.dataset.part = "progress";
    const elapsed = document.createElement("span");
    elapsed.dataset.part = "elapsed";
    const track = document.createElement("div");
    track.className = "track";
    track.dataset.part = "seek-track";
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.dataset.part = "fill";
    track.append(fill);
    if (view.canSeek) this.wireSeekTrack(track, fill);
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
      if (view.canStop) {
        const stop = this.iconButton("Stop", ICONS.stop, () => this.transport("media_stop"));
        stop.dataset.part = "player-stop";
        transport.append(stop);
      }
      if (view.favoriteId) {
        const fav = this.iconButton("Favorite current song", ICONS.heart, () => this.pressFavorite());
        fav.classList.add("favorite");
        fav.dataset.part = "favorite";
        transport.append(fav);
      }
      if (view.canAddToLibrary) {
        const lib = this.iconButton("Add to library", ICONS.libraryAdd, () => this.pressLibrary());
        lib.classList.add("library");
        lib.dataset.part = "library";
        transport.append(lib);
      }
    }

    const stage = document.createElement("div");
    stage.className = "stage";
    stage.append(art, placeholder, title, artist, album, progress, transport);
    wrap.append(wash, scrim);
    if (view.volume) wrap.append(this.mediaVolume(view.volume, view.canMute));
    wrap.append(status, banner, stage);
    return wrap;
  }

  private playButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon primary";
    button.dataset.part = "play";
    button.setAttribute("aria-label", "Play");
    button.title = "Play";
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
    button.title = label;
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

  private mediaVolume(volume: NonNullable<RedisplayView["volume"]>, canMute = false): HTMLElement {
    return this.rangeRow(
      "Media volume",
      "volume",
      "volume-readout",
      volume,
      (value) => this.commitVolume(value),
      canMute,
    );
  }

  private rangeRow(
    aria: string,
    part: string,
    readoutPart: string,
    volume: { min: number; max: number; step: number; value: number | null },
    commit: (value: number) => void,
    canMute = false,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "volume";
    let label: HTMLElement;
    if (canMute) {
      const muteBtn = document.createElement("button");
      muteBtn.type = "button";
      muteBtn.className = "speaker-btn";
      muteBtn.dataset.part = "media-mute";
      muteBtn.setAttribute("aria-label", "Mute");
      muteBtn.title = "Mute";
      muteBtn.setAttribute("aria-pressed", "false");
      muteBtn.append(icon(ICONS.speaker));
      muteBtn.addEventListener("click", () => this.toggleMediaMute());
      label = muteBtn;
    } else {
      const span = document.createElement("span");
      span.className = "speaker";
      span.setAttribute("aria-hidden", "true");
      span.append(icon(ICONS.speaker));
      label = span;
    }
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
    this.hide("status", !view.assist);
    this.hide("banner", !view.ringing);
    this.paintProgress(view);
    this.paintPlay(view);
    this.paintFavorite(view);
    this.paintLibrary(view);
    this.paintVolume(view);
    this.paintMediaMute(view);
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
    this.setText("duration", view.duration ?? "");
    if (this.dragId === "seek") return;
    this.setText("elapsed", view.elapsed ?? "");
    const fill = this.piece("fill");
    if (fill) fill.style.width = `${view.progress * 100}%`;
  }

  private paintPlay(view: RedisplayView): void {
    const button = this.piece("play");
    const play = this.piece("play-icon");
    const pause = this.piece("pause-icon");
    const label = view.playing ? "Pause" : "Play";
    if (button) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    if (play) play.hidden = view.playing;
    if (pause) pause.hidden = !view.playing;
  }

  private paintVolume(view: RedisplayView): void {
    if (!view.volume) return;
    this.paintRange("volume", "volume-readout", view.volume.value, view.volume.max);
  }

  private paintMix(): void {
    const host = this.piece("master");
    const volume = this.mix?.volume;
    if (host) host.hidden = !volume;
    if (!volume) {
      this.setMenu("master", false);
      return;
    }
    const slider = this.piece("master-volume");
    if (slider instanceof HTMLInputElement) {
      slider.min = String(volume.min);
      slider.max = String(volume.max);
      slider.step = String(volume.step);
    }
    if (volume.value === null) {
      if (this.dragId !== "master-volume") {
        this.setText("master-readout", "—");
        this.piece("master-trigger")?.setAttribute("aria-label", "Volume");
      }
      return;
    }
    this.paintRange("master-volume", "master-readout", volume.value, volume.max);
    if (this.dragId === "master-volume") return;
    const readout = formatVolumeReadout(volume.value, volume.max);
    this.piece("master-trigger")?.setAttribute("aria-label", `Volume ${readout}`);
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

  private clearFavoriteTimer(): void {
    if (this.favoriteResetTimer !== undefined) {
      window.clearTimeout(this.favoriteResetTimer);
      this.favoriteResetTimer = undefined;
    }
  }

  private paintFavorite(view?: RedisplayView): void {
    if (view) {
      const hasTrack = Boolean(view.playerId && view.favoriteId && !view.playerOff && (view.playing || this.player?.state === "paused" || this.player?.contentId));
      const trackKey = hasTrack
        ? `${view.playerId ?? ""}|${this.player?.contentId ?? ""}|${view.title}|${view.artist}`
        : "";
      if (this.favoriteTrackKey !== trackKey) {
        this.favoriteTrackKey = trackKey;
        this.trackFavorite = undefined;
        this.favoritePop = false;
        this.clearFavoriteTimer();
        if (this.favoriteState !== "busy") this.favoriteState = "idle";
        if (hasTrack && view.playerId) {
          this.fetchTrackFavorite(view.playerId, trackKey);
        }
      }
    }
    const btn = this.piece("favorite");
    if (!(btn instanceof HTMLButtonElement)) return;
    const isFavorited = this.favoriteState !== "error" && this.trackFavorite === true;
    btn.classList.toggle("is-busy", this.favoriteState === "busy");
    btn.classList.toggle("is-favorited", isFavorited);
    btn.classList.toggle("is-pop", this.favoritePop);
    btn.classList.toggle("is-error", this.favoriteState === "error");
    btn.setAttribute("aria-pressed", isFavorited ? "true" : "false");
    btn.disabled = this.favoriteState === "busy";
    const label =
      this.favoriteState === "busy"
        ? "Favoriting..."
        : this.favoriteState === "error"
          ? "Favorite failed"
          : isFavorited
            ? "Favorited"
            : "Favorite current song";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  private fetchTrackFavorite(playerId: string, trackKey: string): void {
    const hass = this._hass;
    if (!hass?.services?.music_assistant?.get_queue) return;
    const token = ++this.favoriteFetchToken;
    const bound = this.boundDevice;
    Promise.resolve(hass.callService("music_assistant", "get_queue", {}, { entity_id: playerId }, false, true))
      .then((result) => {
        if (!this.isConnected || this.boundDevice !== bound || this.favoriteFetchToken !== token) return;
        if (this.favoriteTrackKey !== trackKey) return;
        const favorite = extractQueueFavorite(result, playerId);
        if (favorite !== undefined) {
          this.trackFavorite = favorite;
          this.paintFavorite();
        }
      })
      .catch(() => undefined);
  }

  private pressFavorite(): void {
    if (this.favoriteState === "busy") return;
    const entityId = this.view?.favoriteId;
    const playerId = this.view?.playerId;
    const hass = this._hass;
    if (!entityId || !hass) return;
    const bound = this.boundDevice;
    const trackKey = this.favoriteTrackKey ?? "";
    this.clearFavoriteTimer();
    this.favoriteState = "busy";
    this.favoritePop = false;
    this.paintFavorite();
    Promise.resolve(hass.callService("button", "press", undefined, { entity_id: entityId }, true))
      .then(() => {
        if (!this.isConnected || this.boundDevice !== bound) return;
        this.favoriteState = "idle";
        if (this.favoriteTrackKey === trackKey) {
          this.trackFavorite = true;
          this.favoritePop = true;
          this.favoriteResetTimer = window.setTimeout(() => {
            this.favoriteResetTimer = undefined;
            this.favoritePop = false;
            this.paintFavorite();
          }, 400);
        }
        this.paintFavorite();
        if (playerId && trackKey) this.fetchTrackFavorite(playerId, trackKey);
      })
      .catch(() => {
        if (!this.isConnected || this.boundDevice !== bound) return;
        this.favoriteState = "error";
        this.favoritePop = false;
        this.paintFavorite();
        this.favoriteResetTimer = window.setTimeout(() => {
          this.favoriteResetTimer = undefined;
          this.favoriteState = "idle";
          this.paintFavorite();
        }, 1800);
      });
  }

  private clearLibraryTimer(): void {
    if (this.libraryResetTimer !== undefined) {
      window.clearTimeout(this.libraryResetTimer);
      this.libraryResetTimer = undefined;
    }
  }

  private paintLibrary(view?: RedisplayView): void {
    if (view) {
      const hasTrack = Boolean(
        view.playerId &&
          view.canAddToLibrary &&
          !view.playerOff &&
          (view.playing || this.player?.state === "paused" || this.player?.contentId),
      );
      const trackKey = hasTrack
        ? `${view.playerId ?? ""}|${this.player?.contentId ?? ""}|${view.title}|${view.artist}`
        : "";
      if (this.libraryTrackKey !== trackKey) {
        this.libraryTrackKey = trackKey;
        this.trackInLibrary = this.player?.contentId?.startsWith("library://") ? true : undefined;
        this.trackUri = this.player?.contentId;
        this.libraryPop = false;
        this.clearLibraryTimer();
        if (this.libraryState !== "busy") this.libraryState = "idle";
        if (hasTrack && view.playerId) {
          this.fetchTrackLibrary(view.playerId, trackKey);
        }
      }
    }
    const btn = this.piece("library");
    if (!(btn instanceof HTMLButtonElement)) return;
    const isInLibrary = this.libraryState !== "error" && this.trackInLibrary === true;
    btn.classList.toggle("is-busy", this.libraryState === "busy");
    btn.classList.toggle("is-in-library", isInLibrary);
    btn.classList.toggle("is-pop", this.libraryPop);
    btn.classList.toggle("is-error", this.libraryState === "error");
    btn.setAttribute("aria-pressed", isInLibrary ? "true" : "false");
    btn.disabled = this.libraryState === "busy";
    btn.replaceChildren(icon(isInLibrary ? ICONS.libraryIn : ICONS.libraryAdd));
    const label =
      this.libraryState === "busy"
        ? "Adding to library..."
        : this.libraryState === "error"
          ? "Add to library failed"
          : isInLibrary
            ? "In library"
            : "Add to library";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  private async resolveMassQueueConfigEntryId(): Promise<string | undefined> {
    if (this.massQueueConfigEntryId) return this.massQueueConfigEntryId;
    const callWS = this._hass?.callWS;
    if (typeof callWS !== "function") return undefined;
    try {
      const entries = (await Promise.resolve(
        callWS({ type: "config_entries/get", domain: "mass_queue" }),
      )) as Array<{ entry_id?: string; state?: string }> | undefined;
      if (!Array.isArray(entries) || entries.length === 0) return undefined;
      const loaded = entries.find((entry) => entry?.state === "loaded" && typeof entry.entry_id === "string");
      const entryId = loaded?.entry_id ?? entries.find((entry) => typeof entry?.entry_id === "string")?.entry_id;
      if (entryId) this.massQueueConfigEntryId = entryId;
      return entryId;
    } catch {
      return undefined;
    }
  }

  private fetchTrackLibrary(playerId: string, trackKey: string): void {
    const hass = this._hass;
    if (!hass?.services?.music_assistant?.get_queue || !hass?.services?.mass_queue?.send_command) return;
    const token = ++this.libraryFetchToken;
    const bound = this.boundDevice;
    Promise.resolve(hass.callService("music_assistant", "get_queue", {}, { entity_id: playerId }, false, true))
      .then(async (queueResult) => {
        if (!this.isConnected || this.boundDevice !== bound || this.libraryFetchToken !== token) return;
        if (this.libraryTrackKey !== trackKey) return;
        const uri = extractQueueTrackUri(queueResult, playerId) ?? this.player?.contentId;
        if (!uri) return;
        this.trackUri = uri;
        if (uri.startsWith("library://")) {
          this.trackInLibrary = true;
          this.paintLibrary();
          return;
        }
        const configEntryId = await this.resolveMassQueueConfigEntryId();
        if (!configEntryId || !this.isConnected || this.boundDevice !== bound || this.libraryFetchToken !== token) return;
        if (this.libraryTrackKey !== trackKey) return;
        const itemResult = await Promise.resolve(
          hass.callService(
            "mass_queue",
            "send_command",
            {
              config_entry_id: configEntryId,
              command: "music/item_by_uri",
              data: { uri },
            },
            undefined,
            false,
            true,
          ),
        );
        if (!this.isConnected || this.boundDevice !== bound || this.libraryFetchToken !== token) return;
        if (this.libraryTrackKey !== trackKey) return;
        const inLibrary = extractItemInLibrary(itemResult);
        if (inLibrary !== undefined) {
          this.trackInLibrary = inLibrary;
          this.paintLibrary();
        }
      })
      .catch(() => undefined);
  }

  private pressLibrary(): void {
    if (this.libraryState === "busy" || this.trackInLibrary === true) return;
    const playerId = this.view?.playerId;
    const hass = this._hass;
    const uri = this.trackUri ?? this.player?.contentId;
    if (!hass || !uri) return;
    const bound = this.boundDevice;
    const trackKey = this.libraryTrackKey ?? "";
    this.clearLibraryTimer();
    this.libraryState = "busy";
    this.libraryPop = false;
    this.paintLibrary();
    this.resolveMassQueueConfigEntryId()
      .then((configEntryId) => {
        if (!configEntryId) throw new Error("mass_queue config entry not found");
        return Promise.resolve(
          hass.callService(
            "mass_queue",
            "send_command",
            {
              config_entry_id: configEntryId,
              command: "music/library/add_item",
              data: { item: uri },
            },
            undefined,
            true,
          ),
        );
      })
      .then(() => {
        if (!this.isConnected || this.boundDevice !== bound) return;
        this.libraryState = "idle";
        if (this.libraryTrackKey === trackKey) {
          this.trackInLibrary = true;
          this.libraryPop = true;
          this.libraryResetTimer = window.setTimeout(() => {
            this.libraryResetTimer = undefined;
            this.libraryPop = false;
            this.paintLibrary();
          }, 400);
        }
        this.paintLibrary();
        if (playerId && trackKey) this.fetchTrackLibrary(playerId, trackKey);
      })
      .catch(() => {
        if (!this.isConnected || this.boundDevice !== bound) return;
        this.libraryState = "error";
        this.libraryPop = false;
        this.paintLibrary();
        this.libraryResetTimer = window.setTimeout(() => {
          this.libraryResetTimer = undefined;
          this.libraryState = "idle";
          this.paintLibrary();
        }, 1800);
      });
  }

  private wireSeekTrack(track: HTMLElement, fill: HTMLElement): void {
    const ratioFromEvent = (event: PointerEvent): number => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    };
    const preview = (ratio: number): void => {
      fill.style.width = `${ratio * 100}%`;
      const dur = this.view?.durationSeconds;
      if (dur !== undefined && dur > 0) {
        this.setText("elapsed", formatElapsed(ratio * dur));
      }
    };
    track.addEventListener("pointerdown", (event) => {
      if (!this.view?.canSeek || !this.view.durationSeconds) return;
      this.dragId = "seek";
      if (typeof track.setPointerCapture === "function") {
        try {
          track.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures in synthetic environments.
        }
      }
      preview(ratioFromEvent(event));
    });
    track.addEventListener("pointermove", (event) => {
      if (this.dragId !== "seek") return;
      preview(ratioFromEvent(event));
    });
    const commit = (event: PointerEvent) => {
      if (this.dragId !== "seek") return;
      this.dragId = undefined;
      const ratio = ratioFromEvent(event);
      const dur = this.view?.durationSeconds;
      const player = this.view?.playerId;
      if (!player || dur === undefined || dur <= 0) return;
      preview(ratio);
      this.call("media_player", "media_seek", { seek_position: Math.round(ratio * dur) }, { entity_id: player });
    };
    track.addEventListener("pointerup", commit);
    track.addEventListener("pointercancel", () => {
      this.dragId = undefined;
    });
  }

  private paintMediaMute(view: RedisplayView): void {
    const btn = this.piece("media-mute");
    if (!btn) return;
    const label = view.muted ? "Unmute" : "Mute";
    btn.classList.toggle("is-muted", view.muted);
    btn.setAttribute("aria-pressed", view.muted ? "true" : "false");
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.replaceChildren(icon(view.muted ? ICONS.mute : ICONS.speaker));
  }

  private openMoreInfo(): void {
    const entityId = this.view?.playerId;
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }

  private toggleMediaMute(): void {
    const player = this.view?.playerId;
    if (!player) return;
    this.call("media_player", "volume_mute", { is_volume_muted: !this.view?.muted }, { entity_id: player });
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
    const view = buildRedisplayAlarms(model, this.alarmList, this._hass?.locale);
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
      .callService(call.domain, call.service, call.data, undefined, true, true)
      .then(
        (result) => {
          if (this.deviceId !== device) return;
          this.alarmList = alarmListFromPayload(result, this.alarmList);
          this.paintAlarms();
          if (action !== "list" && !this.alarmList.error) {
            this.runAlarmScript(kioskName, "list");
          }
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
    const stem = assistStem(model.assistEntityId);
    const service = timerStartService(this._hass?.services, stem);
    const listService = timerListService(this._hass?.services, stem);
    const cancelService = timerCancelService(this._hass?.services, stem);
    if (listService) {
      const listKey = JSON.stringify({
        device: this.deviceId,
        timers: model.timers.map((line) => [line.entityId, line.state]),
      });
      if (listKey !== this.timerListKey) {
        this.timerListKey = listKey;
        this.runTimerList(listService);
      }
    }
    const view = buildTimers(model, this._hass?.locale, this.timerList, Date.now()) ?? { headline: "No timers" };
    const sensors = model.timers.length > 0;
    if (!sensors && !service) {
      if (this.timersKey !== "empty") {
        this.timersKey = "empty";
        host.replaceChildren(this.quiet("No timers"));
      }
      return;
    }
    const key = JSON.stringify({ view, service: service ?? "", cancel: cancelService ?? "" });
    if (key === this.timersKey && host.querySelector(".rd-timers")) return;
    this.timersKey = key;
    const start = service
      ? (data: TimerStart) => {
          const hass = this._hass;
          if (!hass) return;
          void hass.callService("esphome", service, { ...data }).then(
            () => {
              if (listService) this.runTimerList(listService);
            },
            () => undefined,
          );
        }
      : undefined;
    const cancel = cancelService
      ? (timerId: string) => {
          const hass = this._hass;
          if (!hass) return;
          if (this.timerList?.timers) {
            this.timerList = {
              ...this.timerList,
              timers: this.timerList.timers.filter((entry) => entry.timerId !== timerId),
            };
            this.paintTimers();
          }
          void hass.callService("esphome", cancelService, { timer_id: timerId }).then(
            () => {
              if (listService) this.runTimerList(listService);
            },
            (error: unknown) => {
              this.timerList = timerListFromFailure(error, this.timerList);
              this.paintTimers();
              if (listService) this.runTimerList(listService);
            },
          );
        }
      : undefined;
    renderTimers(
      host,
      view,
      (entityId, on) => {
        this.call("switch", on ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
      },
      start,
      cancel,
    );
  }

  private runTimerList(listService: string): void {
    const hass = this._hass;
    const device = this.deviceId;
    if (!hass || !device) return;
    void hass.callService("esphome", listService, {}, undefined, true, true).then(
      (result) => {
        if (this.deviceId !== device) return;
        this.timerList = timerListFromPayload(result, this.timerList);
        this.paintTimers();
      },
      (error: unknown) => {
        if (this.deviceId !== device) return;
        this.timerList = timerListFromFailure(error, this.timerList);
        this.paintTimers();
      },
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
      (domain, service, data, target) => {
        this.call(domain, service, data, target);
      },
    );
  }

  private paintAgent(): void {
    const host = this.piece("panel-agent");
    const model = this.model;
    if (!host || !model) return;
    const view = buildAgent(model);
    if (!view || !agentHasPanel(view)) {
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
    const host = this.piece("device-body");
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
    });
  }

  private paintMute(): void {
    const button = this.piece("mute");
    const mute = this.model ? voiceMute(this.model) : undefined;
    if (button) button.hidden = !mute;
    if (!button || !mute) return;
    const muted = mute.on;
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Muted" : "Listening");
    button.dataset.entity = mute.entityId;
    const live = this.piece("mute-live");
    const off = this.piece("mute-off");
    if (live) live.hidden = muted;
    if (off) off.hidden = !muted;
  }

  private toggleMute(): void {
    const mute = this.model ? voiceMute(this.model) : undefined;
    if (!mute) return;
    this.call("switch", mute.on ? "turn_off" : "turn_on", undefined, { entity_id: mute.entityId });
  }

  private paintInfo(): void {
    const pending = this.model ? updatesPending(this.model.updates) : false;
    const button = this.piece("info-button");
    if (button) {
      button.classList.toggle("is-update", pending);
      button.setAttribute("aria-label", pending ? "Device update" : "Device");
    }
    const mark = this.piece("info-icon");
    const alert = this.piece("info-alert");
    if (mark) mark.hidden = pending;
    if (alert) alert.hidden = !pending;
  }

  private paintPower(): void {
    const host = this.piece("power");
    const model = this.model;
    if (!host || !model) return;
    const view = buildPower(model);
    host.hidden = !view;
    renderPower(host, view, {
      onPress: (entityId, confirm, name) => {
        if (confirm && !window.confirm(name)) return;
        this.press(entityId);
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

  private toggleMenu(which: "master" | "info"): void {
    const menu = this.piece(which === "master" ? "master-menu" : "info-menu");
    const open = menu?.hidden !== false;
    this.setMenu("master", which === "master" && open);
    this.setMenu("info", which === "info" && open);
    if (open) this.dismissPower();
  }

  private setMenu(which: "master" | "info", open: boolean): void {
    const menu = this.piece(which === "master" ? "master-menu" : "info-menu");
    const button = this.piece(which === "master" ? "master-trigger" : "info-button");
    if (menu) menu.hidden = !open;
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  private dismissPower(): void {
    const button = this.shadowRoot?.querySelector(".rd-power-button");
    if (!(button instanceof Element) || button.getAttribute("aria-expanded") !== "true") return;
    button.setAttribute("aria-expanded", "false");
    const menu = this.shadowRoot?.querySelector(".rd-power-menu");
    if (menu instanceof HTMLElement) menu.hidden = true;
  }

  private insidePart(path: readonly EventTarget[], part: string): boolean {
    const host = this.piece(part);
    return Boolean(host && path.includes(host));
  }

  private miniNowTile(): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "mini-tile mini-now";
    tile.dataset.mini = "now";
    tile.hidden = true;

    const art = document.createElement("img");
    art.className = "mini-now-art";
    art.alt = "";
    art.dataset.part = "mini-now-art";
    art.hidden = true;

    const scrim = document.createElement("div");
    scrim.className = "mini-now-scrim";
    scrim.dataset.part = "mini-now-scrim";
    scrim.hidden = true;

    const play = document.createElement("button");
    play.type = "button";
    play.className = "mini-now-play";
    play.dataset.part = "mini-now-play";
    play.setAttribute("aria-label", "Play");
    const playIcon = document.createElement("span");
    playIcon.dataset.part = "mini-now-play-icon";
    playIcon.append(icon(ICONS.play));
    const pauseIcon = document.createElement("span");
    pauseIcon.dataset.part = "mini-now-pause-icon";
    pauseIcon.hidden = true;
    pauseIcon.append(icon(ICONS.pause));
    play.append(playIcon, pauseIcon);
    play.addEventListener("click", () => {
      this.transport(this.view?.playing ? "media_pause" : "media_play");
    });

    const transport = document.createElement("div");
    transport.className = "mini-now-transport";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "mini-now-step";
    prev.dataset.part = "mini-now-prev";
    prev.setAttribute("aria-label", "Previous");
    prev.append(icon(ICONS.previous));
    prev.addEventListener("click", () => this.transport("media_previous_track"));

    const next = document.createElement("button");
    next.type = "button";
    next.className = "mini-now-step";
    next.dataset.part = "mini-now-next";
    next.setAttribute("aria-label", "Next");
    next.append(icon(ICONS.next));
    next.addEventListener("click", () => this.transport("media_next_track"));

    transport.append(prev, next);
    tile.append(art, scrim, play, transport);
    return tile;
  }

  private miniAlarmsTile(): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "mini-tile mini-alarms";
    tile.dataset.mini = "alarms";
    tile.dataset.part = "mini-alarms";
    tile.hidden = true;

    const kicker = document.createElement("span");
    kicker.className = "mini-kicker";
    kicker.dataset.part = "mini-alarms-kicker";
    const value = document.createElement("span");
    value.className = "mini-value";
    value.dataset.part = "mini-alarms-value";
    tile.append(kicker, value);
    return tile;
  }

  private miniIntercomTile(): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "mini-tile mini-intercom";
    tile.dataset.mini = "intercom";
    tile.dataset.part = "mini-intercom";
    tile.hidden = true;

    const modes: ReadonlyArray<readonly [IntercomModeId, string]> = [
      ["off", "Off"],
      ["ring", "Ring"],
      ["answer", "Answer"],
      ["dnd", "DND"],
    ];
    for (const [id, label] of modes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-intercom-mode";
      button.dataset.miniMode = id;
      button.textContent = label;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => this.handleMiniIntercom(id));
      tile.append(button);
    }
    return tile;
  }

  private miniAgentTile(): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "mini-tile mini-agent";
    tile.dataset.mini = "agent";
    tile.dataset.part = "mini-agent";
    tile.hidden = true;

    const kicker = document.createElement("span");
    kicker.className = "mini-kicker";
    kicker.dataset.part = "mini-agent-kicker";
    const value = document.createElement("span");
    value.className = "mini-value";
    value.dataset.part = "mini-agent-value";
    const assistButton = document.createElement("button");
    assistButton.type = "button";
    assistButton.className = "mini-agent-assist";
    assistButton.dataset.part = "mini-agent-assist";
    assistButton.setAttribute("aria-label", "Ask Assist");
    const assistLabel = document.createElement("span");
    assistLabel.textContent = "Ask";
    assistButton.append(icon(ICONS.chat), assistLabel);
    assistButton.addEventListener("click", () => {
      this.toggleAsk();
    });
    tile.append(kicker, value, assistButton);
    return tile;
  }

  private paintCollapsed(): void {
    if (!this.model || !this.view) return;
    const collapsed = buildCollapsedView(this.model, this.view, this._hass?.locale, Date.now());
    this.collapsedView = collapsed;

    const intercom = collapsed.intercom;
    if (this.pendingMiniIntercomMode && intercom.enabledOn !== false && intercom.answerId) {
      const pending = this.pendingMiniIntercomMode;
      this.pendingMiniIntercomMode = undefined;
      const match = intercom.buttons.find((item) => item.id === pending);
      if (match?.option && !match.selected) {
        this.call("select", "select_option", { option: match.option }, { entity_id: intercom.answerId });
      }
    }

    const art = this.piece("mini-now-art");
    const scrim = this.piece("mini-now-scrim");
    const picture = collapsed.now.picture;
    if (art instanceof HTMLImageElement) {
      if (picture && art.getAttribute("src") !== picture) art.src = picture;
      art.hidden = !picture;
    }
    if (scrim) scrim.hidden = !picture;

    const play = this.piece("mini-now-play");
    const playIcon = this.piece("mini-now-play-icon");
    const pauseIcon = this.piece("mini-now-pause-icon");
    const hasPlayer = Boolean(collapsed.now.playerId);
    if (play instanceof HTMLButtonElement) {
      play.disabled = !hasPlayer;
      play.setAttribute("aria-label", collapsed.now.playing ? "Pause" : "Play");
    }
    if (playIcon) playIcon.hidden = collapsed.now.playing;
    if (pauseIcon) pauseIcon.hidden = !collapsed.now.playing;
    const prev = this.piece("mini-now-prev");
    const next = this.piece("mini-now-next");
    if (prev instanceof HTMLButtonElement) prev.disabled = !hasPlayer;
    if (next instanceof HTMLButtonElement) next.disabled = !hasPlayer;

    const alarmsTile = this.piece("mini-alarms");
    if (alarmsTile) {
      alarmsTile.classList.toggle("is-ringing", collapsed.alarms.kind === "ringing");
      alarmsTile.classList.toggle("is-none", collapsed.alarms.kind === "none");
    }
    this.setText("mini-alarms-kicker", collapsed.alarms.kicker);
    this.setText("mini-alarms-value", collapsed.alarms.value);

    const intercomTile = this.piece("mini-intercom");
    if (intercomTile) {
      for (const node of intercomTile.querySelectorAll(".mini-intercom-mode")) {
        if (!(node instanceof HTMLButtonElement)) continue;
        const mode = node.dataset.miniMode;
        const item = intercom.buttons.find((button) => button.id === mode);
        if (!item) continue;
        node.disabled = item.disabled;
        node.classList.toggle("is-on", item.selected);
        node.setAttribute("aria-pressed", item.selected ? "true" : "false");
      }
    }

    this.setText("mini-agent-kicker", collapsed.agent.kicker);
    this.setText("mini-agent-value", collapsed.agent.wakeWord);
    const assistButton = this.piece("mini-agent-assist");
    if (assistButton) {
      const label = collapsed.agent.assistant ? `Ask ${collapsed.agent.assistant}` : "Ask Assist";
      assistButton.setAttribute("aria-label", label);
      assistButton.setAttribute("aria-pressed", this.askOpen ? "true" : "false");
      assistButton.title = label;
    }
  }

  private askBar(): HTMLElement {
    const wrap = document.createElement("form");
    wrap.className = "rd-ask";
    wrap.dataset.part = "ask";
    wrap.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.askBusy) void this.submitAsk();
    });

    const row = document.createElement("div");
    row.className = "rd-ask-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "rd-ask-input";
    input.dataset.part = "ask-input";
    input.placeholder = "Ask Assist";
    input.setAttribute("aria-label", "Ask Assist");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "rd-ask-button";
    button.dataset.part = "ask-button";
    button.setAttribute("aria-label", "Ask");

    const spinner = document.createElement("span");
    spinner.className = "rd-ask-spinner";
    spinner.dataset.part = "ask-spinner";
    spinner.hidden = true;
    spinner.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.dataset.part = "ask-button-label";
    label.textContent = "Ask";

    button.append(spinner, label);
    button.addEventListener("click", () => {
      if (this.askBusy) this.cancelAsk();
      else void this.submitAsk();
    });

    row.append(input, button);

    const reply = document.createElement("div");
    reply.className = "rd-ask-reply";
    reply.dataset.part = "ask-reply";
    reply.hidden = true;

    const replyText = document.createElement("span");
    replyText.className = "rd-ask-reply-text";
    replyText.dataset.part = "ask-reply-text";

    const replyClose = document.createElement("button");
    replyClose.type = "button";
    replyClose.className = "rd-ask-reply-close";
    replyClose.setAttribute("aria-label", "Dismiss reply");
    replyClose.textContent = "×";
    replyClose.addEventListener("click", () => this.clearAskReply());

    reply.append(replyText, replyClose);
    wrap.append(row, reply);
    return wrap;
  }

  private paintAsk(): void {
    const input = this.piece("ask-input");
    if (!(input instanceof HTMLInputElement)) return;
    const target = this.model?.name ? `Ask ${this.model.name}` : "Ask Assist";
    if (input.placeholder !== target) input.placeholder = target;
    if (input.getAttribute("aria-label") !== target) input.setAttribute("aria-label", target);
    this.paintAskBusy();
  }

  private paintAskBusy(): void {
    const input = this.piece("ask-input");
    if (input instanceof HTMLInputElement) input.disabled = this.askBusy;
    const button = this.piece("ask-button");
    if (button instanceof HTMLButtonElement) {
      button.classList.toggle("is-busy", this.askBusy);
      button.setAttribute("aria-label", this.askBusy ? "Cancel" : "Ask");
    }
    const spinner = this.piece("ask-spinner");
    if (spinner) spinner.hidden = !this.askBusy;
    this.setText("ask-button-label", this.askBusy ? "Cancel" : "Ask");
  }

  private showAskReply(text: string, isError = false): void {
    const reply = this.piece("ask-reply");
    if (!reply) return;
    reply.classList.toggle("is-error", isError);
    this.setText("ask-reply-text", text);
    reply.hidden = false;
  }

  private clearAskReply(): void {
    const reply = this.piece("ask-reply");
    if (!reply) return;
    reply.hidden = true;
    reply.classList.remove("is-error");
    this.setText("ask-reply-text", "");
  }

  private toggleAsk(): void {
    this.askOpen = !this.askOpen;
    this.writeAskOpenState(this.deviceId, this.askOpen);
    this.applyCollapsedState();
    const assistButton = this.piece("mini-agent-assist");
    if (assistButton) assistButton.setAttribute("aria-pressed", this.askOpen ? "true" : "false");
    if (this.askOpen) {
      const input = this.piece("ask-input");
      if (input instanceof HTMLInputElement && !input.disabled) input.focus();
    }
  }

  private loadAssistPipelines(): void {
    if (this.assistPipelines || this.assistPipelinesLoading) return;
    if (typeof this._hass?.callWS !== "function") return;
    this.assistPipelinesLoading = true;
    void this.fetchAssistPipelines().finally(() => {
      this.assistPipelinesLoading = false;
    });
  }

  private async fetchAssistPipelines(): Promise<void> {
    const callWS = this._hass?.callWS;
    if (typeof callWS !== "function") return;
    try {
      const result = (await Promise.resolve(callWS({ type: "assist_pipeline/pipeline/list" }))) as {
        pipelines?: Array<{ id?: unknown; name?: unknown; conversation_engine?: unknown; language?: unknown }>;
        preferred_pipeline?: unknown;
      } | null;
      if (result && Array.isArray(result.pipelines)) {
        this.assistPipelines = result.pipelines.filter(
          (entry): entry is AskPipelineInfo =>
            Boolean(entry) && typeof entry.id === "string" && typeof entry.name === "string",
        );
      }
      if (result && (typeof result.preferred_pipeline === "string" || result.preferred_pipeline === null)) {
        this.assistPreferredPipeline = result.preferred_pipeline;
      }
    } catch {
      // Fall back to default Assist pipeline when pipeline listing is unavailable.
    }
  }

  private loadAreaNames(): void {
    if (this.areaNames || this.areaNamesLoading) return;
    if (typeof this._hass?.callWS !== "function") return;
    this.areaNamesLoading = true;
    void this.fetchAreaNames().finally(() => {
      this.areaNamesLoading = false;
    });
  }

  private async fetchAreaNames(): Promise<void> {
    const callWS = this._hass?.callWS;
    if (typeof callWS !== "function") return;
    try {
      const result = (await Promise.resolve(callWS({ type: "config/area_registry/list" }))) as Array<{
        area_id?: unknown;
        name?: unknown;
      }> | null;
      if (!Array.isArray(result)) return;
      const map: Record<string, string> = {};
      for (const area of result) {
        if (typeof area?.area_id === "string" && typeof area.name === "string" && area.name.length > 0) {
          map[area.area_id] = area.name;
        }
      }
      this.areaNames = map;
    } catch {
      // Area context is optional if area registry cannot be read.
    }
  }

  private resolveAreaName(): string | undefined {
    if (!this.deviceId || !this._hass) return undefined;
    const areaId = this._hass.devices?.[this.deviceId]?.area_id;
    if (!areaId) return undefined;
    const fromHass = this._hass.areas?.[areaId]?.name;
    if (typeof fromHass === "string" && fromHass.length > 0) return fromHass;
    return this.areaNames?.[areaId];
  }

  private cancelAsk(): void {
    if (!this.askBusy) return;
    this.askToken += 1;
    this.askBusy = false;
    this.paintAskBusy();
  }

  private async submitAsk(): Promise<void> {
    const hass = this._hass;
    const input = this.piece("ask-input");
    if (!hass || !(input instanceof HTMLInputElement)) return;
    const rawText = input.value.trim();
    if (!rawText) return;

    const token = ++this.askToken;
    this.askBusy = true;
    this.clearAskReply();
    this.paintAskBusy();

    const assistant = this.collapsedView?.agent.assistant;
    let pipeline = resolveAskPipeline(
      assistant,
      this.assistPipelines ?? [],
      this.assistPreferredPipeline,
    );
    const needsPipelineRefresh =
      typeof hass.callWS === "function" &&
      (!this.assistPipelines || (Boolean(assistant) && assistant!.toLowerCase() !== "preferred" && !pipeline));
    if (needsPipelineRefresh) {
      await this.fetchAssistPipelines();
      if (this.askToken !== token) return;
      pipeline = resolveAskPipeline(
        assistant,
        this.assistPipelines ?? [],
        this.assistPreferredPipeline,
      );
    }

    let areaName = this.resolveAreaName();
    if (!areaName && !this.areaNames && typeof hass.callWS === "function") {
      await this.fetchAreaNames();
      if (this.askToken !== token) return;
      areaName = this.resolveAreaName();
    }

    const prompt = buildAskPrompt(rawText, {
      kioskName: this.model?.name ?? this.deviceId ?? "Kiosk",
      areaName,
      playerId: this.model?.media.playerId,
      assistEntityId: this.model?.assistEntityId,
      conversationEngine: pipeline?.conversation_engine,
    });

    const data: Record<string, unknown> = { text: prompt };
    if (pipeline?.conversation_engine) data.agent_id = pipeline.conversation_engine;
    if (pipeline?.language) data.language = pipeline.language;
    if (this.askConversationId) data.conversation_id = this.askConversationId;

    try {
      const result = await hass.callService("conversation", "process", data, undefined, false, true);
      if (this.askToken !== token) return;
      input.value = "";
      const nextConvId = extractConversationId(result);
      if (nextConvId) this.askConversationId = nextConvId;
      const speech = extractConversationSpeech(result);
      if (speech) this.showAskReply(speech, false);
    } catch (error) {
      if (this.askToken !== token) return;
      const message =
        error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Request failed";
      this.showAskReply(message, true);
    } finally {
      if (this.askToken === token) {
        this.askBusy = false;
        this.paintAskBusy();
      }
    }
  }

  private handleMiniIntercom(id: IntercomModeId): void {
    const view = this.collapsedView?.intercom;
    if (!view) return;
    const current = view.buttons.find((entry) => entry.id === id);
    if (!current || current.disabled) return;
    if (current.id === "off") {
      if (!view.enabledId) return;
      this.pendingMiniIntercomMode = undefined;
      this.paintMiniIntercomPressed("off");
      this.call("switch", "turn_off", undefined, { entity_id: view.enabledId });
      return;
    }
    if (!view.enabledId && (!view.answerId || !current.option)) return;
    this.paintMiniIntercomPressed(current.id);
    if (view.enabledId && view.enabledOn === false) {
      this.call("switch", "turn_on", undefined, { entity_id: view.enabledId });
    }
    if (view.answerId && current.option) {
      this.pendingMiniIntercomMode = undefined;
      this.call("select", "select_option", { option: current.option }, { entity_id: view.answerId });
    } else {
      this.pendingMiniIntercomMode = current.id;
    }
  }

  private paintMiniIntercomPressed(id: IntercomModeId): void {
    const tile = this.piece("mini-intercom");
    if (!tile) return;
    for (const node of tile.querySelectorAll(".mini-intercom-mode")) {
      if (!(node instanceof HTMLButtonElement)) continue;
      const on = node.dataset.miniMode === id;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.writeCollapsedState(this.deviceId, this.collapsed);
    this.setMenu("master", false);
    this.setMenu("info", false);
    this.dismissPower();
    this.applyCollapsedState();
  }

  private expandToTab(tab: TabId): void {
    if (!this.collapsed) return;
    this.collapsed = false;
    this.writeCollapsedState(this.deviceId, false);
    this.setMenu("master", false);
    this.setMenu("info", false);
    this.dismissPower();
    this.showTab(tab, true);
    this.applyCollapsedState();
  }

  private applyCollapsedState(): void {
    const card = this.shadowRoot?.querySelector("ha-card");
    if (card instanceof HTMLElement) {
      card.classList.toggle("is-collapsed", this.collapsed);
      card.dataset.collapsed = this.collapsed ? "true" : "false";
    }
    const panels = this.piece("panels");
    if (panels) panels.hidden = this.collapsed;
    const tabs = this.shadowRoot?.querySelectorAll(".tabs button.tab");
    if (tabs) {
      for (const button of tabs) {
        if (button instanceof HTMLElement) button.hidden = this.collapsed;
      }
    }
    const minis = this.shadowRoot?.querySelectorAll(".tabs .mini-tile");
    if (minis) {
      for (const tile of minis) {
        if (tile instanceof HTMLElement) tile.hidden = !this.collapsed;
      }
    }
    const ask = this.piece("ask");
    if (ask) ask.hidden = this.collapsed && !this.askOpen;
  }

  private readCollapsedState(deviceId: string | undefined): boolean {
    if (!deviceId) return false;
    try {
      return window.localStorage.getItem(`kiosk-satellite-card:collapsed:${deviceId}`) === "1";
    } catch {
      return false;
    }
  }

  private writeCollapsedState(deviceId: string | undefined, collapsed: boolean): void {
    if (!deviceId) return;
    try {
      const key = `kiosk-satellite-card:collapsed:${deviceId}`;
      if (collapsed) window.localStorage.setItem(key, "1");
      else window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors on restricted browsers.
    }
  }

  private readAskOpenState(deviceId: string | undefined): boolean {
    if (!deviceId) return false;
    try {
      return window.localStorage.getItem(`kiosk-satellite-card:ask-open:${deviceId}`) === "1";
    } catch {
      return false;
    }
  }

  private writeAskOpenState(deviceId: string | undefined, open: boolean): void {
    if (!deviceId) return;
    try {
      const key = `kiosk-satellite-card:ask-open:${deviceId}`;
      if (open) window.localStorage.setItem(key, "1");
      else window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors on restricted browsers.
    }
  }

  private loadSavedTab(): void {
    const deviceId = this.deviceId;
    const hass = this._hass;
    if (!deviceId || !hass) return;
    const key = userDataGet(deviceId).key;
    if (this.tabLoadKey === key) return;
    this.tabLoadKey = key;
    if (typeof hass.callWS !== "function") return;
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(hass.callWS(userDataGet(deviceId)));
    } catch {
      return;
    }
    void pending.then(
      (result) => {
        if (this.tabLoadKey !== key || this.tabTouched) return;
        const tab = tabFromUserData(result);
        if (!tab) return;
        this.showTab(tab);
      },
      () => undefined,
    );
  }

  private persistTab(tab: StoredTab): void {
    const hass = this._hass;
    const deviceId = this.deviceId;
    if (!hass || !deviceId || typeof hass.callWS !== "function") return;
    try {
      void Promise.resolve(hass.callWS(userDataSet(deviceId, tab))).catch(() => undefined);
    } catch {
      // A failed write leaves the tab on screen.
    }
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
