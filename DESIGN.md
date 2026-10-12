# Coinstark website design

## Overview

Coinstark is a token holder's dashboard: connect a wallet, inspect a balance, send tokens, and manage an exact allowance. The visual idea is a light working surface next to a dark token information panel, with a lime star and one lime primary action. This is an inferred identity for the existing token; no earlier website or supplied brand system existed.

The source is in `web/src/`. `App.tsx` owns the dashboard and its states, `components.tsx` supplies the shared primitives, and `styles.css` is the design source of truth. The interface is one document with fragment navigation, without client-side route rewrites. The form comes first in both the DOM and the mobile layout.

## Colors

The implementation uses one light theme and a dark token panel. These exact semantic CSS custom properties live in `web/src/styles.css:9`. There is no separate dark-mode toggle or unused palette ramp.

| Token | Value | Role |
| --- | --- | --- |
| `--page` | `#f4f5ef` | Page and neutral hover background |
| `--surface` | `#ffffff` | Form, dialog and secondary buttons |
| `--field` | `#fafbf7` | Input and wallet-option backgrounds |
| `--ink` | `#1c251e` | Primary text, selected action background |
| `--muted` | `#5c685e` | Supporting text and neutral icons |
| `--line` | `#d7ddd1` | Structural separators |
| `--control-border` | `#879281` | Input and outlined button boundaries |
| `--accent` | `#d2f87a` | Primary action and brand artwork |
| `--accent-hover` | `#c5ed67` | Primary action hover |
| `--dark` | `#161f19` | Token panel and notification background |
| `--on-dark` | `#f0f3e9` | Primary text on dark surfaces |
| `--muted-dark` | `#b1bdad` | Secondary text on the token panel |
| `--line-dark` | `#3b493d` | Token panel dividers and notification hover |
| `--success` | `#285d3d` | Verified dot, confirmed transaction text, link hover |
| `--warning` / `--warning-surface` | `#79501c` / `#fcf2df` | Wrong-network notice |
| `--error` | `#a62932` | Inline errors and reverted transaction heading |
| `--focus` | `#397025` | Three-pixel focus outline with four-pixel offset |

The notification uses the accent as its focus outline against the dark background. Forced-colors mode uses system `Highlight`, `ButtonText`, and `CanvasText` instead of forcing brand colors.

Measured from rendered foregrounds and their solid backgrounds: ink/page 14.37:1, muted/page 5.33:1, muted/surface 5.84:1, ink/accent 13.09:1, on-dark/dark 15.03:1, and muted-dark/dark 8.64:1. The design probe also passed its text-contrast checks. These are specific observed pairs, not a claim about every possible third-party wallet interface.

## Typography

Manrope is bundled locally as `web/public/fonts/manrope-latin-variable.woff2`, a Latin variable face covering weights 200–800. The interface uses only 400 and 600. `Arial, sans-serif` are the fallbacks. Addresses and transaction hashes use `ui-monospace, SFMono-Regular, Consolas, monospace`; prose does not use monospace. The font license is `web/public/fonts/OFL.txt`. Font loading was confirmed in the browser.

| Token | Size at the default root | Typical use |
| --- | --- | --- |
| `--text-sm` | 14px / .875rem | Labels, hints, nav, addresses, metadata |
| `--text-base` | 16px / 1rem | Body copy, inputs, primary buttons |
| `--text-lg` | 20px / 1.25rem | Feature headings, mobile balance, compact wordmark |
| `--text-xl` | 24px / 1.5rem | Dialog and token headings, desktop balance |
| `--text-2xl` | 32px / 2rem | Mobile page title, section titles, review amount |
| `--text-display` | 44px / 2.75rem | Desktop page title and supply |

Default line-height is 1.6; the page title is 1.15, section headings 1.2, feature headings and balances 1.4, inputs/buttons 1.5. Display tracking is −.05em; the mobile title uses −.04em; section headings −.035em; smaller headings −.025em. Body and labels have natural spacing. There are no uppercase kickers. The uppercase token symbol and ERC-20 standard are identifiers.

Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`. Long addresses and exact amounts wrap; none are ellipsized. Changing numbers use tabular numerals. Inputs remain 16px at the default mobile root. The 390px page uses five sizes and the desktop six, as measured by taste@1.

## Layout

The spacing tokens are `--space-1` through `--space-8`: 4, 8, 12, 16, 24, 32, 48 and 64px at a 16px root. The shared `.page-shell` and `.header-inner` max out at 1200px. Desktop side margins are 40px; intermediate margins 24px; mobile margins 16px. Use these shared edges for additional sections.

The main `.dashboard-grid` has 1.2fr / 1fr columns and a 24px gap. The form and token panel have 32px padding, dropping to 24px at the intermediate breakpoint. The mobile form has 20px padding, or 16px at the narrowest breakpoint. The token facts use `repeat(auto-fit, minmax(min(100%, 7.5rem), 1fr))`, so facts can stack under text enlargement.

| Breakpoint | Implemented adaptation |
| --- | --- |
| `70rem` / 1120px | Hide the duplicate header network label; wrap contract details; reduce the supply to 32px |
| `56rem` / 896px | 24px side margins; compact header; hide desktop nav and intro link; equal dashboard columns; 32px page title |
| `44rem` / 704px | 16px side margins; single-column dashboard with the form first; 20px wordmark; 24px section headings; stacked token principles and guide; wrapping footer |
| `23rem` / 368px | Smaller brand icon, 16px form padding, hide the duplicate in-form network label |

Content remains in normal page flow. The header is not sticky. On mobile, details and the guide remain available by scrolling. Rows that contain actions, headings or facts can wrap. The contract action group is shrinkable and has `max-width: 100%`, preserving both actions at 320px. The live-status row also wraps, including during text enlargement and loading.

Observed widths: 320, 390, 768 and 1440px. At 390 × 844 the product description, recipient/amount inputs and complete primary button are on the first screen. At 200% root text size the layout reflows; this check is distinct from browser-native zoom. RTL geometry was checked, but a translated RTL experience is not provided.

## Elevation & Depth

The normal page is flat. The form uses a 1px structural border; the dark token panel uses a tonal change without a border or shadow. Separators divide balance, facts and contract details.

Only overlays have shadows: `.modal` uses `0 24px 80px #00000038`; `.notice.visible` uses `0 6px 30px #161f1929`. The native dialog's backdrop is `#101810b3`. Dialogs use the browser's top layer. Notifications use z-index 5, and the keyboard skip link uses 100. No border-plus-shadow surface or nested card stack is used.

## Shapes

`--radius-control` is .625rem (10px), used for buttons, inputs and notifications. `--radius-panel` is 1.25rem (20px), used for the form, token panel and dialogs. Action-selection buttons have .5rem corners. The brand is an original rounded-square SVG; its star and the orbital illustration are decorative and hidden from assistive technology.

## Components

| Component or pattern | Source | Behavior |
| --- | --- | --- |
| `BrandMark` | `web/src/components.tsx` | Shared inline SVG; brand-colored wrapper; decorative accessible treatment |
| `Icon` | `web/src/components.tsx` | One 1.7px stroke set using `currentColor`; default 20px, compact 16/18px variants |
| `ExternalLink` | `web/src/components.tsx` | Real anchor, external-arrow icon, new-tab announcement, `rel="noreferrer"` |
| `Modal` | `web/src/components.tsx` | Native `dialog.showModal()`, browser-inert background, initial focus, Tab/Shift+Tab loop, Escape close, focus return; close/edit disabled while signing |
| Buttons | `web/src/styles.css` | `.button`, `.primary-button`, `.secondary-button`, `.text-button`, `.icon-button`; explicit disabled, hover, focus and press states |
| Action selector | `web/src/App.tsx` | Two ordinary buttons with `aria-pressed`, using native Tab/Enter/Space behavior; switching resets fields and invalidates old async work |
| Form fields | `web/src/App.tsx` | Persistent labels, address hint, decimal keyboard, full-precision amounts; inline described errors and focus on the first invalid field |
| Token panel | `web/src/App.tsx` | Published supply and token properties; decorative illustration, never a fabricated price chart |
| Connection status | `web/src/App.tsx` | Loading, verified block number, unavailable and retry states in a stable status region |
| Transfer/allowance review | `web/src/App.tsx` | Full account, recipient/spender, amount, token contract, network and fee explanation; exact amount approval or zero revocation |
| Transaction result | `web/src/App.tsx` | Pending, confirmed, reverted and confirmation-unavailable states; full hash and explorer link; retry confirmation without resending |
| Guide | `web/src/App.tsx` | Native `details`/`summary`; pointer and keyboard disclosure |
| Notification | `web/src/App.tsx` | Persistent, dismissible status for copy/import/submission feedback; no timed disappearance |

Use `.primary-button` once for the main action in the active view. Primary buttons have a 56px minimum height, ordinary buttons 48px, and compact controls 44px. Hover changes are gated by `(hover: hover)`. Motion is opt-in under `(prefers-reduced-motion: no-preference)`: 150ms background/border/transform transitions with a .96 press scale and `cubic-bezier(.2, 0, 0, 1)`. Reduced motion has no transitions or continuous animations. The artwork is static.

## Do's and Don'ts

- Start a new section inside `.page-shell`, reuse the type/spacing tokens, and keep its controls in normal flow.
- Use semantic native controls, visible focus, a persistent label and an actionable error. Preserve full addresses and exact amounts in reviews.
- Reserve the accent fill for the main action; keep secondary navigation neutral and underlined where appropriate.
- Preserve the difference between published token facts and a verified network read. No balance, price, success or activity should be invented.
- Keep fonts and artwork local, maintain `base: './'`, and test a gateway-style subpath after adding assets.
- Do not add another font scale, slogan stack, nested card system or perpetual animation.

For another dashboard section, use a semantic `section` with an h2, apply `.section-heading`, lay out content with wrapping grid/flex, and reuse `ExternalLink`/`Icon`/button classes. Test the empty, loading, error and normal states at 320 and 390px before exporting.

Review evidence and limits are in [web/VALIDATION.md](web/VALIDATION.md), with the requested artifact copy and screenshots under `artifacts/`. Guidance attribution is in [web/THIRD_PARTY_NOTICES.md](web/THIRD_PARTY_NOTICES.md).
