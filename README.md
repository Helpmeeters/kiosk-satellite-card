# Helpmeet: Kiosk Satellite Card

A [HACS](https://hacs.xyz/) Lovelace card for one Kiosk Satellite. Pick the device. The card reads every entity on that ESPHome device, plus the Music Assistant player and favorite button paired from its assist satellite, and renders a control panel.

The visual editor has one required field, labeled Kiosk satellite. It lists only devices whose manufacturer is `kiosk_satellite` and that have an `assist_satellite` entity. A Music Assistant speaker manufactured "Kiosk Satellite" is not that device.

```yaml
type: custom:kiosk-satellite-card
device: a78b06196d065fff7a9bf5c7331e0e5e
```

Leave `style` out and the card renders the control panel directly.

`style: button` renders a compact row: the name, the track or idle, and the next alarm. The row opens the same panel in a dialog. While an alarm is ringing, Snooze and Stop sit on that row.

```yaml
type: custom:kiosk-satellite-card
device: a78b06196d065fff7a9bf5c7331e0e5e
style: button
```

## What the card resolves

Every entity on the selected ESPHome device, plus the Music Assistant player and favorite button paired from the assist satellite. `assist_satellite.updoot_assist_satellite` pairs with `media_player.updoot` and `button.updoot_favorite_current_song`. The player's volume duplicates Media volume, so the player row is transport and favorite only.

## Panel

A section is omitted when the kiosk has none of those entities. It is absent, not an empty placeholder. Unrecognized config entities still appear as controls. Unrecognized diagnostics appear under Device.

**Header.** Name, assist state, battery, and charging.

**Now playing.**

**Volume.** Sliders for Volume, Media volume, Assistant volume, and any other volume number.

**Alarms.** Next alarm, snoozed until, and Snooze and Stop while an alarm is ringing. When `script.kiosk_satellite_alarms` exists, the section also has the alarm list and set, on, off, and delete.

Setting an alarm calls `script.kiosk_satellite_alarms` with `kiosk` set to the device name. If the kiosk does not answer, the card shows the script error. Next alarm, snooze, and stop work from the entities even when the script does not answer. The kiosk's Home Assistant token must be an administrator for the script to answer.

**Voice.** Wake words, assistants, finished speaking detection, engine, sensitivity, mute, chimes, mute timers, noise gate, stop word, intercom, timer count, and next timer.

**Light.** LED idle and effect, ambient light, and noise.

**Device.** App and firmware updates with Install, restart app and restart device with confirmation, a remote admin link, and collapsed diagnostics.

Notification, announce, intercom call, launch app, and open URL are not in the card.

## Install

Add `https://github.com/Helpmeeters/kiosk-satellite-card` in HACS as a Lovelace plugin (category `plugin`) and install **Helpmeet: Kiosk Satellite Card**. HACS registers the `kiosk-satellite-card.js` resource. This card does not ship Bubble or Mushroom.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and what to include in a bug report, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities privately.

## Written with AI assistance

Much of this card's code, tests, and documentation was written with the help of AI coding assistants, then reviewed, tested, and directed by a human maintainer. If something looks wrong, please [open an issue](https://github.com/Helpmeeters/kiosk-satellite-card/issues).

## License

[MIT](LICENSE). Kiosk Satellite Card is part of Helpmeet, a family of Home Assistant integrations.
