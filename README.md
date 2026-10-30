# VJif

Browser GIF VJ tool: 18 keyboard pads, 9 scenes with transitions, 4 blended layers, screen effects, BPM / tap / MIDI-clock sync, live colour key and HSV, automation, mouse transform handles, sets saved in the browser and exported as `.vjif` files. *Actually, it's pronounced vjif.*

VibeCoded: while AI wrote the totality of the code, hundreds of hours of human time went into designing, refining and testing the UX and UI.

**Use it online:** https://xc3n.github.io/VJif/
**Use it offline:** download `vjif.html` from the site (or build it, below) and open it in Chrome.

[Changelog](CHANGELOG.md) · [Tests](TESTS.md)

## Layout

```
vjif.html          the page: markup, and the list of source parts it includes
src/               VJif's code in parts (core, pool, scenes, effects, record…)
common/            shared code: a pinned copy from XC3N/webtools (see common/PINNED.json)
tests/             browser tests (Playwright, headless Chromium), see tests/README.md
build.js           inlines includes → dist/vjif.html (+ dist/index.html)
sync-common.js     refreshes common/ from a local clone of XC3N/webtools
.github/workflows  builds and publishes dist/ to GitHub Pages on every push to main
```

History before this repository (October 2026 and earlier) is in [XC3N/webtools](https://github.com/XC3N/webtools); the commits for VJif were carried over here.

## Building

```
node build.js
```

Node 18+, no dependencies. Output goes to `dist/` (not committed — GitHub Actions builds it).
Source files include other files with `<!-- @include common/file.css -->` or `/* @include src/file.js */`,
and a Markdown file as HTML with `<!-- @markdown CHANGELOG.md -->` (the About panel shows the changelog and credits this way).

## Shared code

`common/` is copied from [XC3N/webtools](https://github.com/XC3N/webtools), pinned to the commit in `common/PINNED.json`, so a change there never changes VJif by itself. To take a newer version:

```
node sync-common.js ../webtools --check   # what would change
node sync-common.js ../webtools           # copy it and update the pin
```

Then review `git diff common/`, build, run the tests and commit. Changes to the shared code itself are made in webtools first, then synced here.

## Conventions

- Output is always a single self-contained HTML file. External requests are limited to web fonts, which fall back to system fonts offline.
- UI follows the shared design language and its layout-stability rules: readouts have fixed widths, context-dependent text lives in fixed boxes, swapped controls share one slot sized to the largest, unavailable controls are dimmed in place. See the comment at the top of `src/style.css`.
- Desktop Chrome is the target browser (WebCodecs, Web MIDI, OffscreenCanvas).

## Credits

UX & features design by XC3N · implementation & coding by Claude. Third-party code (mp4-muxer, MIT), typefaces, palette data and borrowed ideas are listed in [CREDITS.md](CREDITS.md); VJif shows the same list under About › Credits.

If VJif is useful to you, consider supporting the music at [xc3n.bandcamp.com](https://xc3n.bandcamp.com).

## Licence

[PolyForm Shield 1.0.0](LICENSE.md): the source is here to read; anyone can use VJif free (gigs and paid work included), change it and share it, keeping the licence and its `Required Notice` lines with every copy. What's not allowed: selling it, or using the code for a product that competes with it. Copies published before October 12, 2026 were under the MIT License.

Exception: the shared code in `common/` is under the [MIT License](common/LICENSE.md).

The name "VJif" and its logo aren't covered — forks need their own name. See [TRADEMARKS.md](TRADEMARKS.md).
