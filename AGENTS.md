# Releasing this plugin

Helpmeet: Kiosk Satellite Card is a HACS Lovelace plugin. One bundle, `kiosk-satellite-card.js`, registers every card. HACS installs that file from the GitHub release asset named in `hacs.json` (`filename`: `kiosk-satellite-card.js`). `dist/` is gitignored. The built file is a release asset, not a committed file.

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

## Do not

- Do not change git config.
- Do not force-push, hard-reset, or otherwise rewrite published history.
- Do not skip hooks (`--no-verify`, `--no-gpg-sign`).
- Do not amend a commit unless a hook auto-modified files after a commit you just created, that commit is still unpushed, and the user asked for the amend. If a hook rejects the commit, fix the problem and make a new commit.
- Do not commit `dist/`, `node_modules/`, `.gstack/`, or secrets. Attach `dist/kiosk-satellite-card.js` to the GitHub release instead of committing it.
- Do not push any remote other than `origin`.
