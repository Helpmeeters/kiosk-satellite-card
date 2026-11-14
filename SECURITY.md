# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub's [private vulnerability reporting](https://github.com/Helpmeeters/kiosk-satellite-card/security/advisories/new) instead.

Include what you found, how to reproduce it, and what an attacker could do with it. You should get a reply within a week.

## What's in scope

Kiosk Satellite Card runs in the browser as part of a Home Assistant dashboard, with the signed-in user's permissions. Issues that are especially relevant:

- Device names, entity names, or states rendered so that markup in them runs as script.
- The card loading a script other than `kiosk-satellite-card.js` from its own directory.
- A control changing an entity the card should not be showing for that kiosk, or calling `script.kiosk_satellite_alarms` for a kiosk other than the selected device.
