# Coinstark website validation

Worker validation performed on 2026-10-12 against the production `dist/` export. This report is not independent certification.

| Area | Final result |
| --- | --- |
| Acceptance criteria | 7 met; 0 missing; 0 faked |
| Observed broken primary features | 0 remaining |
| Product and main action on first screen at 390px | Yes |
| Production build / TypeScript | Passed / passed |
| Contract ABI, creation code and runtime fingerprint | Passed |
| Browser interaction checks | 16/16 passed: 15 Chromium, 1 WebKit |
| taste@1 | 16/16 passed; initial run was 14/16 |
| Automated accessibility | 0 violations in 4 checked states |
| Metadata and share image | Title, description, favicon, og:title and og:image present; image resolves |

## Scope and assumptions

The existing repository contained the Coinstark ERC-20 contract and Foundry tests, with no frontend. A holder dashboard was inferred from the project record and token interface. Implemented flows are wallet discovery/connect/disconnect, mainnet switching, verified supply/metadata and balance reads, exact token transfers, allowance reads, exact approval, revocation, receipt tracking, token import, address copy, fragment navigation and help disclosures.

The token address, chain facts, RPC endpoints and source commit come from retained copies of the supplied deployment and network records under `web/src/contracts/`. The bare task identifier was not substituted for the deployed token. The original token source, supply, dependencies and build configuration were preserved. No deployment, remint, real signature, funded transfer or publication was performed. Swap/claim interfaces and price/activity feeds were not invented from unverified ABIs.

One visual idea carries the page: a light working form beside a dark token panel, with a static lime star and one primary lime action. Source, lockfile and export are included. All dependencies, downloaded browser binaries, caches and extra OS libraries were installed outside the repository under `/tmp`. No ignore file was changed.

## Acceptance coverage

| Requirement | Evidence |
| --- | --- |
| “a usable website exists with working primary interactions and responsive layouts” | Dashboard and real wallet adapter in `web/src/`; 16 browser tests; screenshots at 320/390/768/1440px |
| “dist/index.html and its assets … alongside the source and lockfile, with relative asset URLs” | Complete `dist/`; `web/package.json` and `web/package-lock.json`; Vite `base: './'`; local assets loaded at `/preview/` |
| “production build, typecheck and useful interaction validation … actual results and limitations” | Commands below; `interaction-results.json`; limits below |
| “applies the pinned Better Interface guide … six domains … fixes … records coverage” | Core principles read before implementation; all six domains reviewed below; applicable findings corrected |
| “first screen at 390 wide … product and main action … title, favicon, description, og:title and og:image” | `mobile-390.png`; taste share check; social PNG request returned 200; the primary action ends about 701px into the 844px screen |
| “DESIGN.md … implemented tokens, typography, components and responsive behavior” | Root `DESIGN.md`, extracted from final CSS/components and cross-checked with browser observations |
| “README … install, preview, rebuild and publish” | Root README includes isolated installation, typecheck/build, static/Vite previews and static-directory/IPFS delivery instructions |

No Git metadata was modified. The working-tree deliverables are prepared for the assignment's submission process; the task forbids writing `.git/`.

## Commands and results

The frontend was copied to `/tmp/coinstark-build` for dependency installation and execution, avoiding repository `node_modules`. `COINSTARK_REPO` below abbreviates the actual repository absolute path.

```sh
COINSTARK_REPO="$(pwd)"
cp -R web/. /tmp/coinstark-build/
npm --prefix /tmp/coinstark-build install --cache /tmp/coinstark-npm-cache --no-fund --no-audit
npm --prefix /tmp/coinstark-build run typecheck
npm --prefix /tmp/coinstark-build run build -- --outDir "$COINSTARK_REPO/dist"
forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache
npm --prefix /tmp/coinstark-build run verify:contract -- "$COINSTARK_REPO/test/scratch/forge-out/Coinstark.sol/Coinstark.json"
```

All exited 0. Build environment: Node 24.21.0, npm 11.19.0, Vite 7.1.12, TypeScript 5.9.3. Foundry compiled with Solidity 0.8.26 and the unchanged repository settings. The final Vite output has approximately 262.03kB JavaScript (81.64kB gzip) and 19.64kB CSS (4.48kB gzip), plus local font, favicon, share image and license assets. Source maps and dependency archives are absent.

A separate clean lockfile installation was then checked:

```sh
mkdir -p /tmp/coinstark-reproduce
cp -R web/. /tmp/coinstark-reproduce/
npm --prefix /tmp/coinstark-reproduce ci --cache /tmp/coinstark-npm-cache --no-fund --no-audit
npm --prefix /tmp/coinstark-reproduce run typecheck
npm --prefix /tmp/coinstark-reproduce run build -- --outDir /tmp/coinstark-reproduced-dist
diff -qr dist /tmp/coinstark-reproduced-dist
```

All exited 0, including the comparison: the clean installation reproduces the delivered export byte for byte.

Contract provenance verification produced:

| Item | Keccak-256 |
| --- | --- |
| Canonical ABI | `b48adcbf1a0e9b355d85120282552da2aa95ef6406529af056dbad779f13dccb` |
| Creation bytecode | `dbc8d3c46ab052d42c16896035f58096689c1ac4a3be8f81763003566b84cde1` |
| Runtime bytecode | `a2642e53b87cf0a0905a8674392225e6b50e0e8a1b49aecb270270e49f9608eb` |

The first two match the pinned deployment exactly; the runtime fingerprint is derived from the same artifact. The bundled ABI equals the compiler ABI. The source commit is `b57c0668b512b7aeb872992cfd18ec2e66599b75`.

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
LD_LIBRARY_PATH=/tmp/coinstark-sys/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/tmp/coinstark-browsers \
npm --prefix /tmp/coinstark-build run test:browser -- \
  --dist "$COINSTARK_REPO/dist" \
  --artifact "$COINSTARK_REPO/test/scratch/forge-out/Coinstark.sol/Coinstark.json" \
  --out "$COINSTARK_REPO/test/scratch/interactions"
```

Exit 0; 16/16. Playwright 1.64.0; Chromium build 1248; WebKit build 2370. The runner owns and closes its local server and browser contexts. Its RPC and provider fixtures are explicitly simulated: no private key or real transaction is involved. It tests the actual compiled export at a subpath rather than a development server.

WebKit initially could not launch because this image lacked OS libraries. Ubuntu packages were downloaded and extracted into `/tmp/coinstark-sys`, with links into the temporary Playwright runtime. The remaining preflight required the unused `gstreamer1.0-libav` media plugin; the documented `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` setting bypassed that environment preflight. WebKit itself then launched and executed the mobile connect/review/back flow successfully. This does not verify video playback or physical Safari devices. No system installation or browser binary was included in the submission.

The interaction suite verifies:

- Relative asset paths, working metadata image, no local resource or page-script failures, reflow at 320/390/768/1440px, and the main action above the mobile fold.
- No-wallet help, Tab/Shift+Tab loop, Escape, focus restoration and keyboard FAQ disclosure.
- Failed public RPC, pinned endpoint failover, retry recovery, and bytecode mismatch blocking writes.
- Rejected connection, wallet `accountsChanged` during connection, exact balance precision, wrong network and explicit mainnet switch.
- Invalid address/amount, zero transfer, exponent input, excess precision and insufficient balance; exact Max amount.
- Review before sending; signature rejection/retry; exact `transfer` calldata; one request while pending; successful receipt.
- Account change during both an open review and in-flight simulation invalidates the old action.
- Allowance lookup, blocking nonzero replacement, zero revocation, and exact finite approval calldata.
- Simulation reverts, wallet bytecode mismatch, failed receipt lookup, retained explorer hash, duplicate blocking and reverted receipt recovery.
- Correct token import, clipboard contents, full connected account, and local disconnect.
- Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA tags in disconnected, no-wallet dialog, connected form and review states: zero violations.
- 200% root text sizing, RTL geometry and no transitions under reduced motion.
- WebKit mobile wallet connection and transfer review, including returning to edit.

The initial allowance test read its simulated request log before the asynchronous action completed. It was repaired to wait for the visible pending state. This was a test timing issue, not an allowance being silently omitted.

```sh
IMD_PLAYWRIGHT=/tmp/coinstark-checks/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/coinstark-browsers \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

Final exit 0, all 16 checks passed: render, layout, targets, contrast, casing, tracking, eyebrows, type sizes, type faces, glyphs, slogans, repetition, copy budget, chrome, motion, share. The initial run found a 347px document at 320px and four short slogan-like lines; the final run found neither. At 390px it measured 33 words of first-screen prose (limit 60), five font sizes, two families, two weights and no controls under the comfortable 44px size. At 1440px there were six font sizes. The supplied probe and scratch output are assignment inputs/transients; the final checks are retained in `taste-results.json`.

## Actual browser inspection

The assigned browser tool opened the tool-managed `/preview/` URL and rendered the production export. Screenshots, keyboard interactions and actual resource/console observations were made at 320×844, 390×844, 768×1024 and 1440×1000. No horizontal overflow remained. The mobile form and complete connect action are on the first screen. The corrected 320px contract address wraps and both contract actions remain available.

The browser loaded the local Manrope font (`document.fonts.check` returned true), JavaScript, CSS and favicon successfully. The final browser console reported zero errors/warnings. `browser-network.txt` records successful local asset requests and successful requests to the supplied Ethereum RPC. The app verified chain ID, exact runtime hash, token metadata and supply; observed blocks included 26,178,781 and 26,178,789. Shell requests to both RPC endpoints had returned 403 earlier, so those shell failures are not claimed as successful live verification. The browser path succeeded.

The assigned browser exercised header connect, the no-wallet prompt and refresh discovery, native dialog keyboard cycling, Escape/focus return, mainnet token detail navigation, fresh fragment URLs, FAQ disclosure and responsive resizing. Actual wallet signing was unavailable. Simulated wallet behavior is reported separately in the interaction suite, never presented as a funded end-to-end test.

| Retained evidence | What it shows |
| --- | --- |
| `mobile-390.png` | Final 390×844 first screen, disconnected real-browser state |
| `desktop-1440.png` | Final full desktop page, including successful RPC verification status |
| `tablet-768.png` | Intermediate two-column layout |
| `details-320.png` | Corrected contract wrapping/actions at 320px |
| `wallet-prompt-390.png` | No-wallet modal with a visible keyboard focus ring |
| `simulated-transfer-review-390.png` | Full-precision amount and full addresses in a real rendered dialog, with a **simulated** wallet; dialog scrolls for tall content |
| `interaction-results.json` | Individual final browser check results |
| `accessibility-results.json` | Four axe scans and their empty violation arrays |
| `taste-results.json` | Final sixteen probe checks |
| `browser-console.txt`, `browser-network.txt` | Assigned-browser console and resource observations |

## Better Interface: six-domain coverage

The supplied consolidated workflow and all six domains' core principles were read before implementation. The applicable forms, keyboard, hit-area, wrapping and documentation rules informed the design; the pinned version took precedence over other local guide revisions.

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | **Checked** | Native landmarks, controls, labels, described errors, status/alert regions, keyboard form/disclosures, native modal with focus loop/return, 44px targets, reduced motion, axe scans. No screen-reader or physical-device session. |
| Layout | **Checked** | Form-first DOM/mobile order, shared edges, groups and wrap behavior, 320/390/768/1440 screenshots and overflow checks, 200% text enlargement, RTL geometry. Native browser zoom and translated pseudo-localization not performed. |
| Writing | **Checked** | Verb-led actions, exact transfer/allowance terms, fee and irreversibility context, recoverable errors, no fake balances or prices, clear no-wallet state. Repeated taglines removed; 33-word first-screen prose budget. |
| Typography | **Checked** | Local font loaded, two actual weights, five/six sizes, 16px inputs, hierarchy, exact numeric precision, tabular numbers and wrapped addresses. No ellipsis on critical values. Full-precision review content scrolls where necessary. |
| Colors | **Checked** | Source tokens and actual rendered text/background pairs measured; probe contrast passed; errors and states include text. One light theme plus a dark token surface. No dark-mode variant was requested. |
| UI | **Checked** | Form/dialog/notice hover, focus, active, loading, empty, review, pending, success, revert, unavailable and retry paths; flat panels; consistent SVG icons; reduced-motion styles. No autoplay or staged animation, so slow-motion animation replay is not applicable. |

Rendered contrast measurements used the computed foreground and nearest opaque background, with the WCAG sRGB luminance formula:

| Rendered pair | Ratio |
| --- | --- |
| Page ink / page | 14.37:1 |
| Intro secondary text / page | 5.33:1 |
| Field hint / white form | 5.84:1 |
| Balance / white form | 15.76:1 |
| Primary action text / lime fill | 13.09:1 |
| Token panel primary text / dark | 15.03:1 |
| Token panel secondary text / dark | 8.64:1 |
| Modal supporting text / white | 5.84:1 |

These were measured; a screenshot alone was not treated as a contrast calculation. Focus was visibly inspected on the dialog control. Native forced-colors styling is provided in source but was not manually inspected with an operating-system high-contrast mode.

## Findings, corrections and rechecks

Locations refer to the final source containing the correction.

| Severity / owner | Source and finding | Correction and final evidence |
| --- | --- | --- |
| High / Layout | `web/src/styles.css:710`, `.contract-actions`: at 320px the non-shrinking action group made the page 347px wide; the explorer link ran offscreen. | Set `flex-shrink: 1`, `min-width: 0`, `max-width: 100%` and retain wrapping. Final probe passes; `details-320.png` shows both actions fully available. |
| Medium / Writing | `web/src/App.tsx:773` and `:838`: section title/subtitle pairs contributed to four short slogan-like lines in the first probe. | Use “Token details / Simple rules, written into the contract.” and “Using Coinstark / Answers before your first transfer.” Final slogans check passes with one remaining intentional token line. |
| High / Accessibility and layout | `web/src/styles.css:187`, `:342`, `:600`, `:629`: at a 32px root the header fragmented words, action/fact rows overflowed (observed right edge about 499px in a 390px viewport), and the loading status could escape. | Allow header/action/status wrapping, keep the wordmark intact, and use intrinsic token-fact columns. 200% text and RTL geometry tests pass; normal-width probe remains clean. |
| Medium / Accessibility | `web/src/components.tsx:136`: native dialog Tab traversal could leave the last in-document control for browser chrome. | Explicitly cycle first/last enabled controls on Tab/Shift+Tab, preserving native dialog inertness and Escape/focus return. Keyboard tests pass and visible focus was inspected. |
| Medium / Navigation | `web/src/App.tsx:65`: a fresh fragment URL could be processed before React mounted its section. | Scroll to the decoded target after mount. A fresh `#guide` URL was opened in the assigned browser and the section became visible. In-document navigation also works. |
| Preventive / Wallet lifecycle | `web/src/useWallet.ts:100`, `:116`: source review identified a risk that subscribing during the first connection could invalidate the same request on its `accountsChanged` event. | Establish account/chain first, then attach the selected provider; retain epochs for later account/network changes. The simulated provider emits `accountsChanged` during connect; that test and in-flight invalidation tests pass. This was a source-review correction, not a claimed real-wallet failure. |

## Remaining limitations and completion

**Complete for the stated scope.** The production build, typecheck, useful interaction checks, assigned-browser inspection, design probe, final documentation and static export are present. The following limits are explicit:

- No real wallet was connected and no transaction was signed or sent. Wallet/network/receipt success and failure paths were tested with deterministic fixtures, not with funds. The assigned browser's public RPC reads were actual requests through the provided environment, not part of those fixtures.
- Injected browser wallets are supported; WalletConnect QR, hardware-wallet UI and ENS recipient resolution are outside this implementation. The no-wallet prompt explains the available path.
- Receipt tracking reports one block inclusion, not finality, and lasts for the current page session. Replacement transactions, long reorgs and persistence across reload are not implemented. The full hash/explorer link remains visible when confirmation is unavailable; the UI blocks resending while that state is unresolved.
- Screen readers, physical phones, native 200% browser zoom, OS-level forced-colors rendering, translation quality and hosted social previews were not tested. A DOM accessibility scan and text-size test are not substitutes for those sessions.
- Browser engines were emulated on Linux. WebKit used temporary extracted libraries and skipped its unused-media dependency preflight as described above.
- No social canonical origin was provided. The complete relative `share.png` works at the preview subpath; crawler behavior must be checked at the final published URL.
- The original Solidity suite was not rerun because contract behavior was unchanged. Compilation and exact ABI/bytecode matching were run to establish frontend provenance.

Submission sizing and path checks are recorded in `submission-audit.json`. Runtime assets remain in `dist/`; no dependency directories, caches, vendored npm archives, symlinks or submodules are introduced.

The workspace's existing `.git/info/exclude` excludes `artifacts/`; it was left unchanged. The requested evidence files remain there for artifact delivery. A durable report copy is included at `web/VALIDATION.md`, and the three machine-readable browser/design/accessibility results are also included under `web/validation/`. Screenshots and assigned-browser logs are artifact outputs rather than frontend runtime assets.
