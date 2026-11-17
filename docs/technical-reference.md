# Technical Reference

This document specifies how **Helpmeet: Kiosk Satellite Card** resolves Home Assistant entities, handles user interactions, and calls services. Contributors should read this before changing entity resolution, tab behavior, or service calls.

## Element Registration

- Primary custom element: `custom:kiosk-satellite-card`
- Legacy alias: `custom:kiosk-redisplay` (renders the exact same class; not registered as a second card in the Lovelace card picker)
- Card picker name: **Kiosk Satellite Card**

## Device Selection & Entity Pairing

The visual editor's **Kiosk satellite** field lists only devices whose:

- `manufacturer` is `kiosk_satellite`
- device has an `assist_satellite` entity

*(A Music Assistant speaker manufactured `"Kiosk Satellite"` is a separate device and is excluded.)*

The card collects every entity belonging to the selected ESPHome device and pairs the Music Assistant player and favorite button from the `assist_satellite` entity ID:

- Example: `assist_satellite.updoot_assist_satellite` pairs with `media_player.updoot` and `button.updoot_favorite_current_song`.

Lights on the device are intentionally excluded from this card.

## Header Controls & Popups

| Control | Behavior |
| --- | --- |
| **Title** | Displays the satellite device name. |
| **Volume & percent** | Master volume; clicking opens a vertical volume slider popup. |
| **Mic** | Toggles the voice mute `switch` when present. |
| **Battery** | Displays battery level and charging state. |
| **Info** | Opens a popup with available updates (**Install**), other device buttons, and collapsed diagnostics. Turns yellow when an update is available. |
| **Power** | Opens a menu with **Restart app** (prompts for confirmation), **Restart device** (prompts for confirmation), and **Device admin** (opens the kiosk's remote admin page). |

## Tabs, Persistence, and Compact Mode

Four tabs sit directly under the title row:

1. **Now playing**
2. **Alarms & Timers**
3. **Intercom**
4. **Voice Agent**

- A tab remains visible even when the device has no entities for that section.
- The selected tab persists across Home Assistant state updates and is remembered per device. A `Timers` or `Alarms` selection lands on **Alarms & Timers**.
- Clicking the currently active tab collapses the card into **Compact Mode** (four interactive mini tiles for Now Playing, Alarms & Timers, Intercom, and Voice Agent). Clicking a mini tile expands the card. Collapsed state is persisted per device in `localStorage`.

## Inline Ask Bar

The inline **Ask** bar targets the Kiosk's configured assistant pipeline with Kiosk and area context. Its open/closed state in Compact Mode is persisted per device.

## Tab Details

### Now Playing

- **Volume slider**: Writes the device's `Media volume` entity. When absent, falls back to the paired `media_player`'s volume.
- **Metadata & progress**: Shows artwork to the left of title, artist, and transport. Progress advances from the player's reported position while playing.
- **Transport & actions**:
  - **Previous / Play / Pause / Next**: Calls the paired `media_player` service.
  - **Favorite / Snooze / Stop**: Presses the corresponding device `button` entities.

### Alarms & Timers

Displays alarms and timers in two columns:

- **Alarms**:
  - Lists alarms with the next alarm first.
  - Turned-off alarms remain in the list and show `Off` (including when the next-alarm sensor is `unknown`).
  - A next-alarm timestamp is included when the script list has no alarm at that time.
  - **Snooze** and **Stop** appear while an alarm is ringing.
  - **Add** opens an inline card for time, label, and weekdays when `script.kiosk_satellite_alarms` answers, calling `script.kiosk_satellite_alarms` with `kiosk` set to the device name.
  - If the kiosk does not answer, the card displays the script error. Next alarm, snooze, and stop continue to work from device entities even when the script does not answer.
  - *Requirement*: The kiosk's Home Assistant token must have administrator permissions for `script.kiosk_satellite_alarms` to answer.
- **Timers**:
  - Shows the next timer, the active count (or `"No timers"`), and **Mute timers**.
  - **Add** opens an inline card for a label and hours, minutes, and seconds, calling the device's `esphome` `vs_start_timer` service when available.

### Intercom

- **Volume slider**: Shown at the top when the `Intercom volume` entity exists.
- **Mode buttons**: **Off**, **Ring**, **Answer**, and **DND**:
  - **Off** turns `Intercom enabled` off.
  - **Ring**, **Answer**, and **DND** turn `Intercom enabled` on and set `Intercom answer mode` to `Ring`, `Answer automatically`, or `Do not disturb`.
  - Any button whose target entity is missing stays disabled.

### Voice Agent

- **Volume slider**: Shown at the top for `Assistant volume`.
- **Controls**: Wake word and assistant selects, **Stop word** alongside **Finished speaking detection**, and **Chimes** alongside **Noise gate** (plus wake word engine and sensitivity when present).
- Displays `"No voice agent settings"` when the device has none of these entities.
