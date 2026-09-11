# Handoff: chop.ai credits (balance + top up overlay)

## Overview
Adds a credit economy to chop.ai. Every chop or retry costs **5 credits**. Every user gets **20 free credits per day** (4 chops). The app header shows the live balance with a yellow "+" that opens a **top up overlay** where the user picks one of three credit packs and buys it.

This handoff covers:
- the credit balance in the app header (all screens),
- the top up overlay (centered modal over the current screen),
- desktop (1280×800) and mobile (390×844) versions of both.

## About the Design Files
`Chop Screens.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code to copy. The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, whatever the app uses) with its established components, routing, and state patterns. If no environment exists yet, pick the most appropriate framework and implement there.

The file needs `support.js` and `assets/` beside it, plus the chop.ai design-system bundle (see Assets). Open it directly in a browser.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interaction states. Recreate pixel-accurately using the codebase's existing component library where equivalents exist (buttons, icons).

---

## Screens / Views

The file contains 6 desktop artboards and the same 6 as mobile. Screens 01–05 are the pre-existing flow (link drop, audio upload, loader, recommended samples, samples); the credit work touches their headers. Screen 06 is new.

### A. Credit balance (app header — screens 01, 02, 04, 05, 06)

**Purpose:** show remaining credits at a glance and open top up.

**Placement:** right side of the existing app header. Header is `display:flex; align-items:center; justify-content:space-between; gap:24px; padding:20px 85px` (desktop) / `gap:16px; padding:20px 24px` (mobile). Left side is the chop.ai wordmark (22px tall desktop, 18px mobile, `filter:invert(1)` on the dark ground). The balance **replaces** the former `samples / credits` text nav.

**Desktop composition** — one flex row, `gap:10px`, no container, no pill, no card:
1. Eighth-note glyph, 16×16, color `#FCE119`. Inline SVG, `viewBox="0 0 16 16"`:
   `<path d="M6.2 12V3.2l6.3-1.7v2.2L6.2 5.4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="3.8" cy="12.2" rx="2.5" ry="2.1" fill="currentColor"/>`
2. Balance label: `Inter 600 16px/24px`, `#FEFCEC`, text `"15 credits"` (number is live).
3. Top up button: 24×24 circle, `background:#FCE119`, glyph `+` in `Inter 600 17px`, `color:#181601`, `border-radius:100px`, no border. `aria-label="buy credits"`.

**Mobile composition:** same row, `gap:8px`; note glyph 14×14; label is the **number only** (`Inter 600 14px/20px`); on screens that have a hamburger (m01, m02) the balance sits to the left of it with `gap:16px` from the header. The mobile balance in the shipped mocks has no "+" — top up is reachable from the menu; if you want parity with desktop, add the same 24px yellow "+".

**Balance values in the mocks:** 20 on screens 01/02 (fresh daily grant), 15 on 04/05/06 (one chop spent). Screen 03 (loader) has no header nav and no balance — leave it out there.

**States to implement:**
- 0–4 credits (cannot chop): number in `#FCE119` instead of `#FEFCEC`, chop actions disabled, tapping chop opens the top up overlay.
- Post-purchase: number animates/updates in place; no toast needed.

### B. Top up overlay (screen 06)

**Purpose:** buy a credit pack. Opens over whatever screen the user is on (mocked over the samples screen).

**Scrim:** `position:absolute; inset:0; background:rgba(9,3,23,.72)`, covers the app frame. Click dismisses.

**Dialog:** centered, `left:50%; top:50%; transform:translate(-50%,-50%)`.
- Desktop: `width:460px; padding:24px`.
- Mobile: `width:calc(100% - 32px); padding:20px`.
- Both: `background:#120827`, `border-radius:16px`, `box-shadow: inset 0 0 0 1px rgba(254,252,236,.16), 0 24px 60px rgba(0,0,0,.6)`, `box-sizing:border-box`.
- `role="dialog"`, `aria-label="top up credits"`.

**Header row:** `display:flex; align-items:flex-start; justify-content:space-between; gap:12px`.
- Title `"top up"` — Albert Sans 700, 30px/38px, `letter-spacing:-0.02em`, `#FEFCEC` (mobile 26px/32px).
- Close: 32×32 transparent button, `border-radius:6px`, `IconsMediumClose` at 18px, `color:#FEFCEC`, `opacity:.56`. `aria-label="close"`.

**Options list:** `display:flex; flex-direction:column; gap:10px; margin-top:22px` (mobile 18px). Each option is a full-width button, `display:flex; align-items:center; gap:14px`, `padding:16px 18px` (mobile `14px 16px`), `border-radius:12px`, `box-sizing:border-box`, `text-align:left`, `cursor:pointer`, `aria-pressed` reflecting selection.

| | credits | secondary line | price |
|---|---|---|---|
| 1 | 100 credits | 20 chops, one beat worth | $4 |
| 2 | 300 credits (selected by default) | 60 chops, what most people buy | $9 |
| 3 | 1000 credits | 200 chops, cheapest per chop | $25 |

- Unselected: `background:#0B0420`, `box-shadow: inset 0 0 0 1px rgba(254,252,236,.14)`.
- Selected: `background:rgba(252,225,25,.14)`, `box-shadow: inset 0 0 0 2px #FCE119`.
- Radio: 22×22 circle, `border-radius:100px`. Unselected: transparent with `inset 0 0 0 1.5px rgba(254,252,236,.32)`. Selected: `background:#FCE119`, `IconsMediumCheck` 14px in `#181601`.
- Credits label and price: Albert Sans 600, 18px/26px desktop, 17px/26px mobile, `#FEFCEC`.
- Secondary line: `Inter 400 13px/18px`, `#FEFCEC` at `opacity:.56`.

**CTA:** full width, `height:52px`, `margin-top:22px` (mobile 18px), `border-radius:6px`, `background:#FCE119`, `color:#181601`, `Inter 600 16px/1.2`. Label reflects the selection: `"buy 300 credits for $9"`.

**Fine print:** centered under the CTA, `margin-top:12px`, `Inter 400 13px/18px`, `#FEFCEC` at `opacity:.4`: `"5 credits a chop. credits do not expire."`

**Copy rules:** all lowercase, plain, no em dashes, no marketing adjectives. No "best value" badge, no subscription tier — packs are one-time purchases only.

---

## Interactions & Behavior
- **Open:** clicking the yellow "+" in the header, or attempting a chop with fewer than 5 credits.
- **Select pack:** clicking an option selects it (single select). Selection restyles the row and rewrites the CTA label. Default selection is the 300 pack.
- **Buy:** CTA hands off to the payment sheet; on success close the overlay and increment the header balance.
- **Dismiss:** close button, scrim click, `Esc`.
- **Focus:** trap focus in the dialog while open; return focus to the "+" on close.
- **Hover:** options lift their border to `rgba(254,252,236,.28)` when unselected; CTA to `#FFEB4D`. Keep transitions short (120–160ms ease-out) to match the rest of the app.
- **Responsive:** below ~480px the dialog is full width minus 32px, anchored centered; option rows keep the same three-part layout.

## State Management
- `credits: number` — server-owned balance, read on app load and after any chop/retry/purchase.
- `dailyGrant` — 20 credits added at local midnight; server-side, client just re-reads the balance.
- `costPerChop = 5` — applies to first chop and every retry.
- `topUpOpen: boolean`.
- `selectedPack: '100' | '300' | '1000'`, default `'300'`.
- `purchaseState: idle | pending | error` — CTA shows a pending state; on error keep the overlay open and surface the error inline under the CTA.

Guard chop and retry actions on `credits >= 5` and debit optimistically with rollback on failure.

## Design Tokens
Colors:
- `#090317` app ground
- `#0B0420` option row (unselected)
- `#120827` raised surface / dialog
- `#FEFCEC` primary text
- `#FCE119` acid yellow accent
- `#181601` ink on yellow
- `rgba(254,252,236,.14 / .16 / .32)` hairlines and strokes
- `rgba(254,252,236,.4 / .56 / .64)` muted text
- `rgba(9,3,23,.72)` scrim

Type: Albert Sans (600/700) for titles, numbers, and pack labels; Inter (400/500/600) for body and UI.
Radius: 6px buttons, 12px option rows, 16px dialog, 100px circles, 24px artboard.
Spacing: 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 px.
Shadow: `inset 0 0 0 1px rgba(254,252,236,.16)` for surfaces, `0 24px 60px rgba(0,0,0,.6)` for the dialog.

## Assets
- `assets/logo/chop-ai-wordmark.png` — header wordmark, rendered with `filter:invert(1)` on dark.
- `assets/illustrations/*.svg` — hand-drawn underlines used by screens 01–05 (`underline-4`, `underline-10`), also inverted.
- Icons come from the chop.ai design system bundle (`IconsMediumClose`, `IconsMediumCheck`, `IconsMediumDownload`, `IconsMediumEdit`, `IconsMediumMenu`, …). Use the equivalents already in the codebase.
- The eighth-note glyph is inline SVG defined above — the design system has no music-note icon; add one if the codebase keeps a central icon set.
- The design-system CSS/JS bundle is referenced from `_ds/chop-ai-design-system-.../` in the source project and is not bundled here; use the real design system in the codebase.

## Files
- `Chop Screens.dc.html` — all 12 artboards (6 desktop, 6 mobile). Screen 06 holds the top up overlay; the balance appears in the header of 01, 02, 04, 05, 06 and mobile equivalents.
- `support.js` — runtime needed to render the HTML prototype.
- `assets/` — logo and illustrations used by the prototype.
