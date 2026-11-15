# Releasing this plugin

Helpmeet: Kiosk Satellite Card is a HACS Lovelace plugin. One bundle, `kiosk-satellite-card.js`, registers that card. `kiosk-redisplay` is an alias of the same element so an older config still renders it, and it is not a second picker card. HACS installs that file from the GitHub release asset named in `hacs.json` (`filename`: `kiosk-satellite-card.js`). `dist/` is gitignored. The built file is a release asset, not a committed file.

There is no changelog. Release notes live on the GitHub release. `hacs.json` has no version field; do not add one.

## Version markers

These three must be the same version before the release commit:

- `package.json` — `"version"`
- `package-lock.json` — the top-level `"version"` and `packages[""].version` (those two lines only)
- `src/kiosk-satellite-card.ts` — `RELEASE_MARKER = "kiosk-satellite-card@X.Y.Z"`

## Steps

1. Fetch tags from `origin` (`https://github.com/Helpmeeters/kiosk-satellite-card.git`). Local tags can lag. The current release is the highest `v*` tag on origin. Confirm with `git ls-remote --tags origin` and `gh release list`.
2. Choose the next version. This repo ships patch releases (`v0.1.0`, `v0.1.1`, …). Bump the patch unless the maintainer asked for a minor or major bump. The new version must be greater than every existing origin tag. Never reuse, move, or delete a tag. Never edit a published release.
3. Set all three version markers to that version. Put the version bump in the same commit as the change being released.
4. Run `npm test` and `npm run build`. Both must pass before the tag. Tests are `tsx --test test/*.test.ts`. The build writes `dist/kiosk-satellite-card.js`.
5. Commit on `main`. Match existing history: an imperative sentence that says why, then a short body if the why needs it, then `Co-authored-by: Cursor <cursoragent@cursor.com>` when Cursor wrote the commit. Pass the message with a HEREDOC. Before committing, run `git status`, `git diff`, and `git log` and read them.
6. Tag that commit with a lightweight tag, `vX.Y.Z` (not an annotated tag). The tag name matches the version markers, with a `v` prefix. Tags in this repo point at the release commit, and `git cat-file -t vX.Y.Z` is `commit`.
7. Push only `origin`: `git push origin HEAD`, then `git push origin vX.Y.Z`.
8. Publish the GitHub release with `gh`, attaching the built file so the asset name is `kiosk-satellite-card.js`:

```bash
gh release create vX.Y.Z dist/kiosk-satellite-card.js \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
## Summary
- What changed, and why a HACS user cares.

EOF
)"
```

`gh` uses the file's basename as the asset name. Title and tag are `vX.Y.Z`. Notes are a `## Summary` with bullets, in the style of `v0.1.4` and `v0.1.5`. The release targets `main` because the tag is on `main`.

9. Check `gh release view vX.Y.Z` and confirm the asset `kiosk-satellite-card.js` is uploaded.
10. Update this Home Assistant so Wonderwood is serving that release. Leave Wonderwood Local alone. Commands are in "Update this Home Assistant" below.

## Update this Home Assistant

Do this after step 9, for the release that was just published. Install the new resource, then place or refresh the card on Wonderwood. Leave Wonderwood Local as it is.

`HASS_URL` and `HASS_TOKEN` are in `/Users/andrewreutter/.hermes/.env`. Read them in the process. Never print the token, log it, or write it into the repo. SSH to treetop does not work. Talk to Home Assistant over the websocket (`HASS_URL` with `http` swapped to `ws`, path `/api/websocket`). Node on this machine has a global `WebSocket`. The first message is `auth_required`. Send `{ "type": "auth", "access_token": "<token>" }` and wait for `auth_ok`. Every command needs a numeric `id`. A reply is `{ "id", "type": "result", "success", "result" }`. Write large results to `/tmp` and print a summary.

The HACS repository id on treetop is `1457382380` (`Helpmeeters/kiosk-satellite-card`, category `plugin`, file `kiosk-satellite-card.js`, local path `/config/www/community/kiosk-satellite-card`). If a command rejects it, `hacs/repositories/list` and take the repo whose `full_name` is `Helpmeeters/kiosk-satellite-card`.

1. `hacs/repository/refresh` with `{ "repository": "1457382380" }`. A release published moments ago stays on the previous `installed_version` until this runs. `available_version` should then be the new tag.
2. `hacs/repository/download` with `{ "repository": "1457382380", "version": "vX.Y.Z" }`. Allow 90 seconds. `hacs/repositories/list` must show `installed_version` `vX.Y.Z` and `pending_upgrade` false.
3. The HACS resource for this plugin is `19219e0c6e3449048683ed5c9d23e1d1`. HACS rewrites its URL during the download to `/hacsfiles/kiosk-satellite-card/kiosk-satellite-card.js?hacstag=1457382380<version with the dots removed>` (`0.1.6` → `1457382380016`). Read it with `lovelace/resources`. If the query is still the previous version, `lovelace/resources/update` that resource id only, with `res_type` `module` and that url. Do not add a second HACS resource, and do not change the Wonderwood Local dev resource. The HACS resource is global, so this is the install. It is separate from either dashboard's card config.
4. Confirm the file Home Assistant serves. GET `$HASS_URL/hacsfiles/kiosk-satellite-card/kiosk-satellite-card.js` with `Authorization: Bearer <token>`. Status must be 200. The body must contain `kiosk-satellite-card@X.Y.Z`, the `RELEASE_MARKER` from `src/kiosk-satellite-card.ts`. The same bundle registers `custom:kiosk-satellite-card` and the alias `custom:kiosk-redisplay`, so the body must also contain `kiosk-redisplay`. The picker name is `Kiosk Satellite Card`, once.
5. Wonderwood is the dashboard `lovelace/dashboards/list` titles Wonderwood: `url_path` `dynamic-home`, page `http://treetop:8123/dynamic-home/home`. `lovelace/config` for that path can still say title "Home (Dynamic)". Match the dashboard list title, then use `url_path`.
6. Wonderwood Local is `url_path` `dynamic-home-local`, title Wonderwood Local, page `http://treetop:8123/dynamic-home-local/home`. Read it before and after. The body must be unchanged. Do not `lovelace/config/save` it, change its cards, or reload it.
7. Place or refresh the card on Wonderwood only. Re-read `lovelace/config` with `{ "url_path": "dynamic-home" }` immediately before saving, and snapshot that result to `/tmp`. This instance has no config hash, so a second writer clobbers the first. Save with `lovelace/config/save`, `url_path` `dynamic-home`, and `config` set to that object. Re-read Wonderwood and check the cards you changed. Re-read Wonderwood Local and confirm it still matches the pre-save snapshot.

Kiosk Satellite Card is the card on Wonderwood. Config is `type: custom:kiosk-satellite-card` and `device` set to a device whose manufacturer is `kiosk_satellite`. `custom:kiosk-redisplay` is an alias of that card, not a second picker entry. A Music Assistant speaker manufactured "Kiosk Satellite" is a different device. Do not copy a device id from Wonderwood Local. Audio-only satellites are the `kiosk_satellite` devices whose device sensor state is `amazon Echo Dot`. Check those sensors again before adding a card. At the 0.1.6 install they were Updoot1 `a78b06196d065fff7a9bf5c7331e0e5e` (`sensor.updoot_device`) and Updoot2 `1178ff3b00d6d8ef718e88e5f14ccd49` (`sensor.updoot2_device`). Both cards are on Wonderwood view `home`, third section, directly above the `media-control` card, with `grid_options` `{ "columns": 12, "rows": "auto" }`. A later release that does not change card config leaves those cards in place and only refreshes the resource.

## Wonderwood Local

Wonderwood Local (`dynamic-home-local`) loads this working tree, not the HACS release. Serving it is not a release. Do not commit, push, tag, or download through HACS for a local look.

The dev server is `node /tmp/kiosk-satellite-card-dev-server.mjs`. It listens on `0.0.0.0:8788` and serves `dist/kiosk-satellite-card.js` at `http://100.84.152.125:8788/kiosk-satellite-card-local.js`, rewriting the element names to `kiosk-satellite-card-local` and `kiosk-redisplay-local` and the picker names with ` (local)`. Responses send `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Private-Network: true`, and `Cache-Control: no-store`. Port 8787 is Area Card. Do not use it. If nothing answers on 8788, start that one process. If it is already listening, leave it. A rebuild does not need a restart.

The Lovelace resource id is `7446c63386bd4911ab2fd7d0f357bf50`, `res_type` `module`, URL `http://100.84.152.125:8788/kiosk-satellite-card-local.js`. If this Mac's Tailscale address changes, `lovelace/resources/update` that resource id only. Do not point it at the HACS file, and do not point the HACS resource at this server.

Local cards are `type: custom:kiosk-satellite-card-local` with `grid_options` `{ "columns": 12, "rows": "auto" }`. That local element is this card. The dev server also defines `kiosk-redisplay-local` as the alias. Updoot1 is `a78b06196d065fff7a9bf5c7331e0e5e` and Updoot2 is `1178ff3b00d6d8ef718e88e5f14ccd49`, both on view `home`, in the second section, after the todo lists. Check `sensor.updoot_device` and `sensor.updoot2_device` still read `amazon Echo Dot` before adding another card.

## Do not

- Do not change git config.
- Do not force-push, hard-reset, or otherwise rewrite published history.
- Do not skip hooks (`--no-verify`, `--no-gpg-sign`).
- Do not amend a commit unless a hook auto-modified files after a commit you just created, that commit is still unpushed, and the user asked for the amend. If a hook rejects the commit, fix the problem and make a new commit.
- Do not commit `dist/`, `node_modules/`, `.gstack/`, or secrets. Attach `dist/kiosk-satellite-card.js` to the GitHub release instead of committing it.
- Do not push any remote other than `origin`.
- Do not edit, save, or reload Wonderwood Local (`dynamic-home-local`) when installing a release. Do not copy its cards onto Wonderwood.
