# Coinstark (COINSTARK)

Coinstark is a fixed-supply ERC-20 token. Its constructor mints **1,000,000,000 tokens with 18 decimals**, all to the immediate deployer, exactly once. This is **1,000,000,000,000,000,000,000,000,000 base units** (`1000000000000000000000000000`).

The production contract is [`src/Coinstark.sol`](src/Coinstark.sol), built on the vendored OpenZeppelin Contracts v5.4.0 ERC-20 implementation. The only added behavior is the constructor issuance and the `INITIAL_SUPPLY` constant getter.

## Website

The finished static site is in [`dist/`](dist/); its React/TypeScript source, isolated package manifest and lockfile are in [`web/`](web/). The existing Solidity configuration and dependencies are unchanged.

The dashboard reads Ethereum chain ID 1 and the deployed Coinstark at **`0x1ca173188918409e15034c8696ce052b15cc7005`**. It supports injected Ethereum wallets (EIP-6963 discovery with an EIP-1193 fallback), exact-balance reads, token transfers, allowance lookup, exact-amount approval, zero-amount revocation, token import and contract-address copying. The token is not redeployed or minted by the website.

Before a transaction, the site checks the wallet account and chain, matches deployed runtime bytecode to the compiled pinned source, rereads relevant balance/allowance, simulates the call and presents a review. Signing repeats these checks. A nonzero allowance must be revoked before setting another nonzero amount. Gas is paid in ETH and reviewed in the wallet. RPC failures disable writes rather than displaying a made-up balance.

### Install and rebuild

Use Node 22.12+ (validated with Node 24.21.0 and npm 11.19.0). The following installation keeps all dependencies and caches outside the repository; no ignore-file changes are necessary. Run from the repository root and keep the variables in this shell:

```sh
COINSTARK_REPO="$(pwd)"
COINSTARK_WORK="$(mktemp -d /tmp/coinstark-web.XXXXXX)"
cp -R web/. "$COINSTARK_WORK/"
npm --prefix "$COINSTARK_WORK" ci --cache /tmp/coinstark-npm-cache
npm --prefix "$COINSTARK_WORK" run typecheck
npm --prefix "$COINSTARK_WORK" run build -- --outDir "$COINSTARK_REPO/dist"
```

After editing repository source, repeat `cp -R web/. "$COINSTARK_WORK/"` before rebuilding. The regular `web/package.json` scripts also work in a conventional local frontend checkout: `build` exports to `../dist`, `typecheck` runs `tsc --noEmit`, `dev` starts Vite, and `preview` serves the export. Do not include dependency directories or package-manager caches in a submission.

### Preview

Serve the completed export from the repository root:

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173/`. Use a wallet extension or a wallet's browser for account actions. Alternatively, after the installation above:

```sh
npm --prefix "$COINSTARK_WORK" run preview -- --outDir "$COINSTARK_REPO/dist" --port 4173
```

For frontend development, `npm --prefix "$COINSTARK_WORK" run dev` serves the copied source. Copy your source changes into that directory when using this isolated workflow.

### Publish the static export

The assignment publisher serves the supplied `dist/` directly; it does not rebuild. Include **all** files in that directory alongside `web/`, its manifest/lockfile, `DESIGN.md` and the validation artifacts. For IPFS, upload the entire `dist/` directory, preserving `assets/`, `fonts/`, `favicon.svg`, `share.png` and the license file. For another static host, set the document root to `dist/`.

Vite uses `base: './'`; scripts, CSS, fonts, favicon and the social image resolve relative to the current directory. Fragment navigation works without server rewrites. No backend, private credential, environment file or RPC API key is required. The browser still needs network access to the two supplied public RPC services for live reads and to a visitor's wallet for writes. The task did not publish the website or perform any on-chain action. A final public origin was not supplied, so no canonical domain is guessed; `og:image` points to the included relative `share.png`. Host-specific social crawler unfurling remains untested.

### Recheck contract provenance and interactions

Build the existing Solidity source into disposable scratch paths, then verify the generated ABI, creation bytecode and runtime fingerprint:

```sh
forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache
npm --prefix "$COINSTARK_WORK" run verify:contract -- "$COINSTARK_REPO/test/scratch/forge-out/Coinstark.sol/Coinstark.json"
```

The ABI hash is Keccak-256 of compact JSON with recursively sorted object keys; array order is preserved. It and the creation-code hash exactly match `web/src/contracts/deployment.json`, copied from the pinned record. `network.json` is the retained pinned network configuration. The runtime fingerprint in `integrity.json` is derived from the same compiler artifact. No unverified address from prose or the task identifier is used as a contract.

Browser checks serve `dist/` under `/preview/` in a bounded foreground process. They simulate wallet/RPC behavior and never sign or broadcast real transactions:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/coinstark-browsers npm --prefix "$COINSTARK_WORK" exec -- playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/coinstark-browsers npm --prefix "$COINSTARK_WORK" run test:browser -- --dist "$COINSTARK_REPO/dist" --artifact "$COINSTARK_REPO/test/scratch/forge-out/Coinstark.sol/Coinstark.json" --out "$COINSTARK_REPO/test/scratch/interactions"
```

Playwright browsers also require their documented OS libraries. This worker extracted missing WebKit libraries under `/tmp` without altering the host or repository; the exact environment limitation and workaround are recorded in the validation report. The runner reports a missing WebKit launch as an explicit limitation, not a pass.

The pinned design probe was run from the root while the assignment inputs were available:

```sh
IMD_PLAYWRIGHT=/tmp/coinstark-checks/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/coinstark-browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

Those pinned inputs and scratch output are removed by the assignment pipeline. The final probe results, interaction results and accessibility scan are retained in [`web/validation/`](web/validation/). The requested report, results and selected screenshots also remain in `artifacts/` for separate artifact delivery; this workspace excludes that directory from Git.

### Actual website validation

On 2026-10-12: production build and TypeScript check passed; the ABI/creation/runtime integrity checks passed; 16/16 interaction checks passed (15 Chromium checks plus the WebKit mobile connect/review flow); taste@1 passed 16/16; axe reported zero violations across disconnected, no-wallet dialog, connected form and review states. The actual browser export was inspected at 320, 390, 768 and 1440px; no horizontal overflow remained. The 390px first screen contains the form and primary action. Browser RPC reads matched the deployed runtime and metadata; no real wallet transaction was submitted.

See [`web/VALIDATION.md`](web/VALIDATION.md) for commands, six-domain Better Interface coverage, findings/fixes, measured contrast, screenshot descriptions and limitations. A clean `npm ci`, typecheck and build in a second temporary directory reproduced the delivered export byte for byte. [`DESIGN.md`](DESIGN.md) documents the implemented design system.

Scope limits: browser wallets only (no WalletConnect QR pairing or ENS resolution); no swap, claim, price feed or historical activity UI; transaction tracking is for the current page session and one inclusion, not finality. Reloading ends local tracking, so retain the explorer link for a pending transaction. Hardware-wallet signing, physical phones, screen readers and browser-native zoom were not exercised. The underlying token is unchanged; no new claim, router or distributor ABI was invented.

## Solidity build and check

Run from the repository root with Foundry and Solidity 0.8.26 installed:

```sh
forge build
forge test
forge fmt --check
```

The root `foundry.toml` pins `solc = "0.8.26"`, the Cancun EVM target, optimizer settings (enabled, 200 runs), and `bytecode_hash = "none"`. All imported dependencies are ordinary source files under `lib/`; no package installation, submodules, RPC, keys, or network access is needed to build or test once the compiler is installed. Tests do not read or write environment variables, use forks, or depend on execution order. FFI and filesystem permissions are not enabled.

Unit and fuzz tests cover metadata, constructor issuance and its event, CREATE2 factory deployment, transfers, self-transfers, zero amounts, approvals, allowance replacement/revocation, finite and unlimited allowances, unauthorized spending, zero recipients, insufficient balances, revert atomicity, and absence of minting or administrative entry points. The stateful invariant test compares balances and allowances against a separate ledger over sequences of transfers and approvals and checks total supply conservation. The default configuration runs each fuzz test 512 times and the invariant 128 times at depth 64.

`test_launchDistributionAndPoolTransfersDeliverExactAmounts` exercises the token movements corresponding to the stated factory distribution, claims, and transfers to/from a pool participant. It does **not** simulate Uniswap v4 pricing, liquidity, or swaps. The supplied protected launch suite performs those integration checks in the launch environment; it is not part of this standalone project's test run.

## Behavior and assumptions

- Name: `Coinstark`; symbol: `COINSTARK`; decimals: `18`. These values cannot be changed.
- Standard `transfer`, `approve`, `transferFrom`, `balanceOf`, `allowance`, and `totalSupply` are available. Successful mutations return `true`; invalid operations revert with OpenZeppelin's ERC-6093 custom errors.
- Transfers have no fee, tax, burn, rebase, limit, or address exemption. Recipients receive exactly the amount deducted from senders. Zero-value transfers are allowed; a zero recipient is rejected even for zero amount. Self-transfers require sufficient balance and preserve it.
- Approvals replace the current allowance. Finite allowances decrease on `transferFrom`; `type(uint256).max` is treated as unlimited and remains unchanged until the holder changes it. `transferFrom` requires allowance even when the caller is the token holder. Approving a zero spender reverts.
- Construction and transfers emit `Transfer`; explicit approvals emit `Approval`. As in the vendored OpenZeppelin version, allowance spending does not emit another `Approval` event. Integrations should query `allowance` for its current value.
- No owner, admin, external mint/burn, pause, blacklist, confiscation, proxy, initializer, or upgrade mechanism exists. The deployer has no privilege over tokens after distributing them. The internal library mint/burn helpers are not exposed as external functions.
- There are no constructor calls to outside contracts, or external calls during token transfers. No oracle, timer, randomness, keeper, or other service is needed.
- Ordinary ETH sends revert. There is no asset recovery function; tokens sent to this contract, or to another contract unable to spend them, may become inaccessible. Tokens sent to this contract remain included in total supply.

## Deployment parameters

| Field | Value |
| --- | --- |
| Solidity contract identifier | `Coinstark` |
| Fully qualified artifact | `src/Coinstark.sol:Coinstark` |
| Constructor arguments | None (`[]`) |
| Constructor transaction value | `0` |
| Decimals | `18` |
| Total supply in base units | `1000000000000000000000000000` |
| Initial recipient | Immediate deployer (`msg.sender`) |
| Intended launch chain | Ethereum, chain ID `1` |
| Application contracts | None |
| Linked libraries | None |

The build emits `out/Coinstark.sol/Coinstark.json`. The launch operator uses its creation bytecode with no appended arguments. With factory CREATE/CREATE2 deployment, the factory receives the full issuance, including when a different wallet initiates the launch transaction. Direct deployment would instead give the entire supply to that direct deployer. A wrapper that executes `new Coinstark()` is itself the deployer and initial holder.

For the launch described in the brief, distribution is the factory's responsibility: 10% to its distributor, 88% to liquidity, and 2% to the specified remainder recipient. These allocations are **not** hardcoded in the token or performed in its constructor. Pairing, pool parameters, initial market capitalization, distribution, and `launch.json` belong to the separate launch process. The original contract delivery supplies the token, its build inputs, and tests. The website now adds a holder interface; no broadcast or funded-wallet operation was performed in this work.

## After launch

There are no owner-settable settings or initialization calls. The launch operator must verify the deployed artifact, name, symbol, decimals, mint event, initial supply, factory distribution, and source publication on Ethereum. The separate launch review must validate actual pool seeding, swaps in each direction, and distributor claims.

Holders control transfers and allowances, and are responsible for choosing correct recipients and trusted spenders. Prefer bounded approvals. When replacing a nonzero allowance, consider revoking it to zero and waiting for confirmation before setting the new amount; a spender may otherwise use the old allowance before replacement. Revocation cannot reverse an already executed spend. No administrator can restore lost assets, cancel transfers, or repair the deployed token through an upgrade.

## Dependencies and review scope

[`DEPENDENCIES.json`](DEPENDENCIES.json) records the pinned upstream versions, full commit identifiers, archive URLs, and SHA-256 hashes of each vendored file. OpenZeppelin includes only ERC-20 and its required imports plus its MIT license. Forge Standard Library v1.9.7 includes its `src/` tree and MIT/Apache licenses for local testing. Vendored code is unmodified and excluded from project formatting.

The supplied security reference was reviewed for token accounting, authorization, input validation, external calls, unsafe opcodes, and deployment assumptions. Local validation includes unit tests, fuzz tests, a stateful conservation/model invariant, and a runtime opcode check. These checks do not constitute an independent security audit. Slither and Mythril were not run. Independent adversarial review and launch integration validation remain responsibilities of the release process.
