# NoteMage — App Store screenshots

App Store Connect submission screenshots, built in the established `brand_video/` house
style (brand tokens, Material Symbols, colored logo, mascots beside the UI, **no gradients**).
Each shot is a pixel-faithful mock of the real app surface — researched from the live
components — composed as a device-screen + a bottom caption band, rendered to PNG at the
exact required pixel size.

## Deliverables — `out/`

20 PNGs, one set per device. The 3 **heroes** per device carry a mascot + an explaining
headline; the rest are titled UI shots.

**iPhone 6.5" — `phone-01…10.png` — 1242 × 2688 (portrait)**
| # | Surface | ★ hero |
|---|---------|--------|
| 01 | Learning Paths — the trail (SlotNode checkpoints) | ★ graduation |
| 02 | Flashcards — study player | ★ holding_flashcards |
| 03 | Quiz — MCQ + verdict | ★ quizzing |
| 04 | AI Mage chat — grounded answer | |
| 05 | Theory lesson + Steps diagram | |
| 06 | Learn Hub — your library | |
| 07 | Import PDF → study set | |
| 08 | Achievements — trophy shelf | |
| 09 | Community — clone a path | |
| 10 | Path detail — hero card + structure | |

**iPad Pro 13" — `ipad-01…10.png` — 2064 × 2752 (portrait)**
| # | Surface | ★ hero |
|---|---------|--------|
| 01 | Learning Path — the trail | ★ graduation |
| 02 | File editor — notebook + Generate menu | ★ writing |
| 03 | Flashcards — study player | ★ holding_flashcards |
| 04 | Inline AI edits (Pro) | |
| 05 | AI Mage chat — grounded answer | |
| 06 | Quiz — MCQ + verdict | |
| 07 | Canvas — handwritten diagram | |
| 08 | Path generator (Pro) | |
| 09 | Theory — lessons with visuals | |
| 10 | Community — clone a path | |

## Sources

- `phone.html` — all 10 iPhone shots. Stage = 1242 × 2688.
- `ipad.html` — all 10 iPad shots. Stage = 2064 × 2752.

Each file exposes `window.__shot(n)` + `window.__shotCount` (one `<section>` per shot,
only the active one displayed). Brand tokens live in the `:root` block; checkpoint icons
are inlined 1:1 from the app's `CheckpointIcons.tsx`.

## Render

Run from `brand_video/` (where Playwright + Chromium resolve). The renderer is
`brand_video/shoot.mjs` — it loads the HTML, calls `__shot(n)` for each shot, and
screenshots the viewport at `deviceScaleFactor:1` so output px == required px.

```
node shoot.mjs --html ../appstore/phone.html --width 1242 --height 2688 --out ../appstore/out --prefix phone
node shoot.mjs --html ../appstore/ipad.html  --width 2064 --height 2752 --out ../appstore/out --prefix ipad
```

Fast single-shot QA: add `--only N` (0-based) → writes one PNG.

## Iterate

Edit `phone.html` / `ipad.html`, re-run the command. To preview large iPad PNGs inside an
image viewer with a size cap, downscale: `sips -Z 1300 out/ipad-08.png --out /tmp/p.png`.

## Other store sizes

The layouts are aspect-ratio driven, so the same HTML re-renders at the other accepted
sizes by changing `--width/--height` only — e.g. iPhone 6.9" `1290 × 2796`
(near-identical aspect) or iPad 12.9" `2048 × 2732`.

## App preview videos — `previews/`

App-preview VIDEOS use a different (smaller) resolution set than screenshots — do **not**
reuse the screenshot dimensions or App Store Connect rejects the upload.

| Slot | Size | Source | Output |
|------|------|--------|--------|
| iPad 13"/11" preview | **1600 × 1200** (landscape) | `brand_assets/videos/*.mp4` (16:9) | `previews/ipad/` (4 files) |
| iPhone 6.5"/6.9" preview | **886 × 1920** (portrait) | `~/marketing/*.mp4` (9:16) | `previews/phone/` (5 files) |

Source aspects (16:9, 9:16) don't match the targets (4:3, ~0.46), so each clip is
**letterboxed** in the brand backdrop `#0c0a1a` — lossless, never crops UI, and the dark
bars blend into the dark app UI. Encoded H.264 **High@4.0**, **30 fps**, silent **stereo AAC**
(Apple lists stereo as required), `+faststart`, durations 24–30 s (Apple limit: 15–30 s).
Originals are untouched. Re-encode with the `enc()` ffmpeg loop:
`scale=W:H:force_original_aspect_ratio=decrease:flags=lanczos,pad=W:H:(ow-iw)/2:(oh-ih)/2:color=0x0c0a1a`.
App Store allows **max 3 previews per device per localization** — more are provided so you can choose.
