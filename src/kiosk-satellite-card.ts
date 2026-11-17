import { KioskRedisplay } from "./kiosk-redisplay";

const RELEASE_MARKER = "kiosk-satellite-card@0.1.18";

KioskRedisplay.releaseMarker = RELEASE_MARKER;

/** Same UI under the previous element name. Not a second picker card. */
class KioskRedisplayAlias extends KioskRedisplay {}

if (!customElements.get("kiosk-satellite-card")) {
  customElements.define("kiosk-satellite-card", KioskRedisplay);
}

if (!customElements.get("kiosk-redisplay")) {
  customElements.define("kiosk-redisplay", KioskRedisplayAlias);
}

const cardWindow = window as unknown as { customCards?: Array<Record<string, unknown>> };
cardWindow.customCards = cardWindow.customCards || [];
if (!cardWindow.customCards.some((card) => card.type === "kiosk-satellite-card")) {
  cardWindow.customCards.push({
    type: "kiosk-satellite-card",
    name: "Kiosk Satellite Card",
    description: "Now playing, alarms and timers, intercom, and voice agent for an audio-only Kiosk Satellite.",
    preview: true,
  });
}
