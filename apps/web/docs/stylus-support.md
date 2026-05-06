# Stylus + barrel-button support

**Status:** Implemented in code, verified via code review against the pointer-events spec and Excalidraw v0.18 API. **Not yet tested on real devices** — see the "Device matrix" table below and fill in results as you acquire hardware.

**Source:** `src/components/notebook/InfiniteCanvas.tsx` lines 245–272.
**Shipped in:** commit `77bad8f feat(canvas): reorder toolbar and map stylus barrel button to eraser`.
**Excalidraw version:** `@excalidraw/excalidraw@^0.18.0`.

---

## What's implemented

On `pointerdown`, if the pointer is a stylus (`pointerType === 'pen'`) AND either the barrel (side) button is held OR the eraser tip is in contact, the active tool is switched to the eraser via Excalidraw's imperative `api.setActiveTool({ type: 'eraser' })`.

Detection rules (from the PointerEvent spec):

| Bit | `buttons` value | Meaning                              | Triggers eraser?                  |
| --- | --------------- | ------------------------------------ | --------------------------------- |
| 0   | `1`             | Pen tip contacting surface (primary) | No — normal drawing               |
| 1   | `2`             | Barrel / side button                 | **Yes** — `e.buttons & 2 === 2`   |
| 5   | `32`            | Flipped-over eraser tip              | **Yes** — `e.buttons & 32 === 32` |

The listener is attached to `document` in the capture phase so it runs before Excalidraw's own pointer handlers. The tool stays on eraser until the user switches back via the toolbar or the `T / P / E / V` keyboard shortcuts — this is intentional and documented in the code comment.

Number-key shortcuts `1 / 2 / 3` are also remapped in the same file (lines 274–318) to `Text / Pen / Eraser`, matching the visual toolbar order.

---

## Code review (static verification, no physical device)

Line-by-line against the pointer-events spec:

1. **`e.pointerType !== 'pen'` guard** — correct. The three valid values are `'mouse' | 'pen' | 'touch'`. Only `'pen'` should trigger stylus logic. iPadOS reports Apple Pencil as `'pen'`; Chrome reports Wacom and Surface Pen as `'pen'`; touch screens and mice are correctly excluded.

2. **`(e.buttons & 2) === 2`** — correct. Bit 1 of the `buttons` bitmask is the secondary (barrel) button per the W3C Pointer Events spec. The bitwise AND + equality check correctly returns true whenever the barrel is held, regardless of whether the tip is also down (`buttons === 3` = tip + barrel still passes).

3. **`(e.buttons & 32) === 32`** — correct. Bit 5 is the "eraser" button per the spec. Surface Pen reports `buttons === 32` when flipped.

4. **`setActiveTool({ type: 'eraser' })`** — correct per Excalidraw v0.18 types. The signature matches `@excalidraw/excalidraw/types/element/types.ts`.

5. **Capture-phase `document` listener** — runs before Excalidraw's own listener, so the tool switch happens before any drawing would start. Correct.

**No bugs found during code review.** If reports come in of devices where this doesn't work, the likely causes are in the "Known limitations" section below, not the handler code.

---

## Device matrix

Fill in each row as real hardware becomes available. The expected-behavior column is what the code should do based on the spec.

| Device                      | Browser / OS               | Expected                            | Tested? | Result |
| --------------------------- | -------------------------- | ----------------------------------- | ------- | ------ |
| Apple Pencil (any gen)      | Safari / iPadOS            | **Does not work** — see limitations | ☐       | —      |
| Apple Pencil Pro (squeeze)  | Safari / iPadOS            | **Does not work** — see limitations | ☐       | —      |
| Surface Pen (side button)   | Edge / Windows             | Switches to eraser on button hold   | ☐       | —      |
| Surface Pen (flip to erase) | Edge / Windows             | Switches to eraser on flip          | ☐       | —      |
| Wacom Intuos + Pro pen      | Chrome / macOS             | Switches to eraser on barrel press  | ☐       | —      |
| Wacom Intuos + Pro pen      | Chrome / Windows           | Switches to eraser on barrel press  | ☐       | —      |
| S Pen                       | Samsung Internet / Android | Switches to eraser on side button   | ☐       | —      |
| Ordinary mouse              | any                        | **Ignored** (pointerType guard)     | ☐       | —      |
| Finger touch                | any touchscreen            | **Ignored** (pointerType guard)     | ☐       | —      |

To test, temporarily add this log at the top of the handler in `InfiniteCanvas.tsx` line 260:

```ts
console.log('[stylus]', e.pointerType, e.buttons.toString(2), e.buttons);
```

Open the canvas, interact with the stylus, check DevTools console. Remove the log before committing.

---

## Known limitations

### Apple Pencil — hardware has no barrel button

Apple Pencil (all generations through Pro) does not have a barrel button. The squeeze gesture on Apple Pencil Pro and the double-tap gesture on Apple Pencil 2 are **not exposed to web pages by Safari**. There is no JavaScript API to detect them, and no workaround exists short of a native-app wrapper. This is tracked in `project_apple_pencil_deferred.md`.

On iPad, the keyboard shortcut `3` (remapped to Eraser) works as a fallback if the user connects a Bluetooth keyboard.

### Wacom + macOS — driver-dependent

Some Wacom driver versions on macOS report the barrel button as a right-click (`contextmenu` event) instead of setting `buttons` bit 1. This depends on the user's preferences in the Wacom desktop utility. If the barrel button doesn't switch to eraser on a Mac + Wacom setup, the user should check their Wacom preferences → pen button assignment → set it to "Button 2" or "Right-click", NOT "Keystroke".

Chromium has an open issue tracking similar inconsistencies: https://bugs.chromium.org/p/chromium/issues/detail?id=769495

### The eraser never auto-switches back to pen

Intentional. Once the barrel-button-triggered eraser activates, it stays active until the user explicitly switches tools. Rationale: auto-switching on `pointerup` would make batch-erase (hold barrel, wipe several elements) impossible — every release would reset to pen and the next press would be a stroke again.

If user feedback asks for "press-and-hold to erase, release to resume pen", that's a reasonable future enhancement — it would require a separate `pointerup` handler that checks whether the current tool was set by the barrel-button listener (not by the user clicking the toolbar).

---

## Don't re-flag this as "missing"

This feature has been implemented since commit `77bad8f`. Before reporting it as missing again:

1. Check `src/components/notebook/InfiniteCanvas.tsx` lines 245–272
2. Verify `pointerType === 'pen'` is reaching that handler (add the debug log above)
3. Verify the `buttons` bitmask includes bit 1 or bit 5 for your device
4. Check this doc's "Known limitations" section for driver quirks

If all four check out and it still doesn't work, open a bug with the device, OS, browser version, and the console output from the debug log.
