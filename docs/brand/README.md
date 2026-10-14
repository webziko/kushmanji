# Kushmanji brand options

Open `choices.png` (phone) or `choices.html` (offline, one file) to compare. Each direction has `x-icon.svg` (512 x 512, 3 colours, no text, reads at 16 px) and `x-wordmark.svg` (text drawn as outlines, so no font needed).

- **A, Friendly:** a soft play button that smiles back, coral on cream with cocoa-brown text, Fredoka lettering. White on accent 4.62, text on background 13.33, text on surface 13.92, ink on background 6.64.
- **B, Calm and clear:** today's green and warm greys unchanged, with a rounded K whose lower blade is cut free in mint, Inter lettering. White on accent 4.83, text 15.74 / 17.22, ink 6.25.
- **C, Bold and creative:** an orange spark sliced on the diagonal over deep indigo, Outfit lettering. White on accent 8.90, text 16.12 / 17.64, ink 9.87.

All pairs are WCAG AA (4.5 : 1) or better, including muted text (7.22, 8.02, 8.29), white on hover (5.84, 6.04, 10.81), ink on the tag wash (5.84, 5.73, 8.62) and text on the second colour (4.66, 13.13, 7.48). Ratios use the WCAG formula on the hex values.

In the app, set these in `:root` of `app/src/renderer/styles.css` (`--on-accent` stays white; `--border`, `--hover`, `--accent-wash` follow from `--text` and `--accent`):

| | `--bg` | `--surface` | `--text` | `--text-2` | `--accent` | `--accent-hover` | `--accent-ink` | `--radius` |
|---|---|---|---|---|---|---|---|---|
| A | #FFF4E9 | #FFFAF4 | #3A2420 | #6B4A42 | #CE4630 | #B53A26 | #A02F1B | 16px |
| B (as today) | #F2F0ED = oklch(0.955 0.005 70) | #FDFAF7 | #181716 | #494847 | #01825B = oklch(0.536 0.114 164) | #02714F | #006547 | 10px |
| C | #F6F3FF | #FFFFFF | #1B1238 | #4A4272 | #4527C6 | #391FA9 | #391FA9 | 8px |

Also: swap the CSS triangle `.brand-mark` for the chosen icon, and make the Windows icon from it. The brief gave today's green as about #0b7a55; Chromium shows the oklch value as #01825B, which is what B uses. Mint #A6EBCE (B), coral #F4644A (A) and orange #FF8A1F (C) are logo and highlight colours, not for white text.
