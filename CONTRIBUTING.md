# Contributing to Helpmeet: Kiosk Satellite Card

Thanks for helping. Bug reports, wording fixes, and pull requests are all welcome.

## Reporting bugs

Open an [issue](https://github.com/Helpmeeters/kiosk-satellite-card/issues/new/choose) using the bug report form. The most useful things to include are:

- Your Home Assistant version, and whether it's a beta.
- The Kiosk Satellite Card version, from HACS.
- The browser you use.
- The card YAML.
- What the card showed, and what you expected.

## Development setup

You need Node.js.

```bash
npm install
npm test
npm run build
```

`npm test` runs the card's tests. `npm run build` writes `dist/kiosk-satellite-card.js`.

## Pull requests

- Keep changes focused. One fix or feature per pull request.
- Add or update tests for any behavior change, and make sure `npm test` passes.
- Which entities land in which section, the button row, and alarm script calls are specified in the [README](README.md). Read it before changing how the panel, the button, or entity resolution behaves.
- Update the README when user-facing behavior changes.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
