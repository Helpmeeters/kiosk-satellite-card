# Helpmeet: Kiosk Satellite Card

A [HACS](https://hacs.xyz/) Lovelace plugin for one Kiosk Satellite. The card is the display for an audio-only satellite: a header of icons, tabs under the title, now playing, alarms and timers, intercom, and the voice agent. It draws that face from the device's Home Assistant entities. The Kiosk Satellite display itself does not run on a device without a screen, and this card does not load it.

The visual editor has one required field, labeled Kiosk satellite. It lists only devices whose manufacturer is `kiosk_satellite` and that have an `assist_satellite` entity. A Music Assistant speaker manufactured "Kiosk Satellite" is not that device.

```yaml
type: custom:kiosk-satellite-card
device: a78b06196d065fff7a9bf5c7331e0e5e
```

A dashboard that still says `type: custom:kiosk-redisplay` renders this same card.

## What the card shows

Every entity on the selected ESPHome device, plus the Music Assistant player and favorite button paired from the assist satellite. `assist_satellite.updoot_assist_satellite` pairs with `media_player.updoot` and `button.updoot_favorite_current_song`.

Previous, play, pause, and next call the paired player. Favorite, snooze, and stop press that device's buttons. The Media volume slider writes the device's Media volume. When that entity is absent, the slider writes the player's volume. Progress advances from the player's reported position while it is playing.

Four icon tabs sit directly under the title row: Now playing, Alarms & Timers, Intercom, and Voice Agent. The selected tab stays put while Home Assistant updates, and Home Assistant remembers that tab for the device. A Timers or Alarms selection lands on Alarms & Timers. The title row is the satellite name, then the speaker and its percent, the voice mute mic when the mute switch exists, the battery icon, info, and power.

Now playing puts a speaker icon and the Media volume slider at the top, then the artwork to the left of the title, artist, and transport. The speaker in the title row is master Volume, and a click opens a vertical slider. Alarms & Timers puts alarms and timers in two columns. Alarms stay a list with the next one first. An alarm that is turned off stays in that list and shows Off, including when the next-alarm sensor is unknown. A next-alarm timestamp is included when the script list has no alarm at that time. Snooze and Stop show while one is ringing, and Add asks for time, label, and weekdays when `script.kiosk_satellite_alarms` answers. Add opens a small card in the column for those fields. Timers use that same column: the next timer, the count or "No timers", and Mute timers. Add on the timer column opens a small card for a label and hours, minutes, and seconds, and calls that device's `esphome` `vs_start_timer` service when Home Assistant has it. Intercom puts a speaker icon and the Intercom volume slider at the top when that entity exists, then four buttons: Off, Ring, Answer, and DND. Off turns Intercom enabled off. Ring, Answer, and DND turn it on and set Intercom answer mode to Ring, Answer automatically, or Do not disturb. A button stays disabled when the entity it writes is missing. Voice Agent puts a speaker icon and the Assistant volume slider at the top, then the wake word and assistant selects. Stop word shares a row with Finished speaking detection. Chimes shares a row with Noise gate. The panel says "No voice agent settings" when the device has none of those. The mic in the title row toggles Mute when that switch exists. The power button opens Restart app, Restart device, and Device admin. Restart asks before it runs, and Device admin opens the kiosk's remote admin page. Info opens updates with Install, other device buttons, and collapsed diagnostics, and the icon turns yellow when an update is available. A tab stays even when that device has nothing to show there. Light stays off this card.

Setting an alarm calls `script.kiosk_satellite_alarms` with `kiosk` set to the device name. If the kiosk does not answer, the card shows the script error. Next alarm, snooze, and stop work from the entities even when the script does not answer. The kiosk's Home Assistant token must be an administrator for the script to answer.

## Install

Add `https://github.com/Helpmeeters/kiosk-satellite-card` in HACS as a Lovelace plugin (category `plugin`) and install **Helpmeet: Kiosk Satellite Card**. HACS registers the `kiosk-satellite-card.js` resource. This card does not ship Bubble or Mushroom.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and what to include in a bug report, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities privately.

## Written with AI assistance

Much of this card's code, tests, and documentation was written with the help of AI coding assistants, then reviewed, tested, and directed by a human maintainer. If something looks wrong, please [open an issue](https://github.com/Helpmeeters/kiosk-satellite-card/issues).

## License

[MIT](LICENSE). Kiosk Satellite Card is part of Helpmeet, a family of Home Assistant integrations.
