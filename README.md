# Coinstark (COINSTARK)

Coinstark is a fixed-supply ERC-20 token. Its constructor mints **1,000,000,000 tokens with 18 decimals**, all to the immediate deployer, exactly once. This is **1,000,000,000,000,000,000,000,000,000 base units** (`1000000000000000000000000000`).

The production contract is [`src/Coinstark.sol`](src/Coinstark.sol), built on the vendored OpenZeppelin Contracts v5.4.0 ERC-20 implementation. The only added behavior is the constructor issuance and the `INITIAL_SUPPLY` constant getter.

## Build and check

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

For the launch described in the brief, distribution is the factory's responsibility: 10% to its distributor, 88% to liquidity, and 2% to the specified remainder recipient. These allocations are **not** hardcoded in the token or performed in its constructor. Pairing, pool parameters, initial market capitalization, distribution, and `launch.json` belong to the separate launch process. This repository supplies only the token, its build inputs, and tests; no broadcast or funded-wallet operation is part of this work.

## After launch

There are no owner-settable settings or initialization calls. The launch operator must verify the deployed artifact, name, symbol, decimals, mint event, initial supply, factory distribution, and source publication on Ethereum. The separate launch review must validate actual pool seeding, swaps in each direction, and distributor claims.

Holders control transfers and allowances, and are responsible for choosing correct recipients and trusted spenders. Prefer bounded approvals. When replacing a nonzero allowance, consider revoking it to zero and waiting for confirmation before setting the new amount; a spender may otherwise use the old allowance before replacement. Revocation cannot reverse an already executed spend. No administrator can restore lost assets, cancel transfers, or repair the deployed token through an upgrade.

## Dependencies and review scope

[`DEPENDENCIES.json`](DEPENDENCIES.json) records the pinned upstream versions, full commit identifiers, archive URLs, and SHA-256 hashes of each vendored file. OpenZeppelin includes only ERC-20 and its required imports plus its MIT license. Forge Standard Library v1.9.7 includes its `src/` tree and MIT/Apache licenses for local testing. Vendored code is unmodified and excluded from project formatting.

The supplied security reference was reviewed for token accounting, authorization, input validation, external calls, unsafe opcodes, and deployment assumptions. Local validation includes unit tests, fuzz tests, a stateful conservation/model invariant, and a runtime opcode check. These checks do not constitute an independent security audit. Slither and Mythril were not run. Independent adversarial review and launch integration validation remain responsibilities of the release process.
