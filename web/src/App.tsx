import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Hex } from "viem";
import {
  amountText,
  displayAmount,
  explorer,
  loadSnapshot,
  network,
  parseAmount,
  prepareReview,
  sendReviewed,
  sourceUrl,
  token,
  tokenInfo,
  transactionReceipt,
  validTarget,
  verifyWallet,
  walletChain,
  walletError,
  walletRead,
} from "./chain";
import type { Operation, Review, Snapshot } from "./chain";
import { BrandMark, ExternalLink, Icon, Modal } from "./components";
import { useWallet } from "./useWallet";

type Tx = {
  hash: Hex;
  operation: Operation;
  state: "pending" | "success" | "reverted" | "unknown";
};

export default function App() {
  const wallet = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [operation, setOperation] = useState<Operation>("transfer");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{
    target?: string;
    amount?: string;
    general?: string;
  }>({});
  const [working, setWorking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [signing, setSigning] = useState(false);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [tx, setTx] = useState<Tx | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const targetField = useRef<HTMLInputElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  const formEpoch = useRef(0);
  const signingRef = useRef(false);
  const connected = Boolean(wallet.account);
  const wrongNetwork = connected && wallet.chainId !== walletChain.chainId;
  const verified = Boolean(snapshot) && !loading && !networkError;
  const transactionUnsettled =
    tx?.state === "pending" || tx?.state === "unknown";

  useEffect(() => {
    // Initial fragment navigation happens after React has mounted the target sections.
    if (!window.location.hash) return;
    const frame = requestAnimationFrame(() => {
      try {
        document
          .getElementById(decodeURIComponent(window.location.hash.slice(1)))
          ?.scrollIntoView();
      } catch {
        /* An invalid fragment does not affect the dashboard. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSnapshot(null);
    setNetworkError("");
    loadSnapshot(wallet.account, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSnapshot(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setNetworkError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [wallet.account, refreshKey]);

  useEffect(() => {
    formEpoch.current++;
    setReview(null);
    setAllowance(null);
    setErrors({});
    setWorking(false);
  }, [wallet.account, wallet.chainId]);

  const refresh = () => setRefreshKey((key) => key + 1);
  const openWallet = () => {
    wallet.discover();
    setWalletOpen(true);
  };
  const closeWallet = () => {
    if (wallet.busy) wallet.disconnect();
    setWalletOpen(false);
  };

  const checkReceipt = useCallback(async (hash: Hex) => {
    setReceiptBusy(true);
    try {
      const state = await transactionReceipt(hash);
      setTx((current) =>
        current?.hash === hash ? { ...current, state } : current,
      );
      if (state === "success") {
        setRefreshKey((key) => key + 1);
        setAllowance(null);
      }
    } catch {
      setTx((current) =>
        current?.hash === hash ? { ...current, state: "unknown" } : current,
      );
    } finally {
      setReceiptBusy(false);
    }
  }, []);

  useEffect(() => {
    if (tx?.state !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      await checkReceipt(tx.hash);
      if (!cancelled && ++attempts < 30) timer = setTimeout(poll, 6000);
      else if (!cancelled)
        setTx((current) =>
          current?.hash === tx.hash && current.state === "pending"
            ? { ...current, state: "unknown" }
            : current,
        );
    };
    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tx?.hash, tx?.state, checkReceipt]);

  function editMode(next: Operation) {
    formEpoch.current++;
    setOperation(next);
    setRecipient("");
    setAmount("");
    setErrors({});
    setReview(null);
    setAllowance(null);
    setWorking(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working || signingRef.current || transactionUnsettled) return;
    if (!wallet.account || !wallet.provider) {
      openWallet();
      return;
    }
    if (wrongNetwork) {
      await wallet.switchNetwork();
      return;
    }
    if (!verified) {
      refresh();
      return;
    }
    const target = validTarget(recipient);
    let parsed: bigint | undefined;
    const nextErrors: typeof errors = {};
    if (!target)
      nextErrors.target = `Enter a valid Ethereum ${operation === "transfer" ? "recipient" : "spender"} address. It cannot be the zero address or Coinstark contract.`;
    try {
      parsed = parseAmount(amount, operation === "approve");
    } catch (cause) {
      nextErrors.amount = (cause as Error).message;
    }
    if (
      operation === "transfer" &&
      parsed !== undefined &&
      snapshot?.balance !== null &&
      snapshot?.balance !== undefined &&
      parsed > snapshot.balance
    )
      nextErrors.amount =
        "This amount exceeds your balance. Enter a smaller amount.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      (nextErrors.target ? targetField : amountField).current?.focus();
      return;
    }
    const epoch = ++formEpoch.current;
    const walletEpoch = wallet.epoch.current;
    setWorking(true);
    try {
      const nextReview = await prepareReview(
        wallet.provider,
        wallet.account,
        operation,
        target!,
        parsed!,
      );
      if (epoch === formEpoch.current && walletEpoch === wallet.epoch.current)
        setReview(nextReview);
    } catch (cause) {
      if (epoch === formEpoch.current)
        setErrors({ general: walletError(cause) });
    } finally {
      if (epoch === formEpoch.current) setWorking(false);
    }
  }

  async function confirm() {
    if (!review || !wallet.provider || signingRef.current) return;
    const currentReview = review;
    const walletEpoch = wallet.epoch.current;
    signingRef.current = true;
    setSigning(true);
    setErrors({});
    try {
      const hash = await sendReviewed(
        wallet.provider,
        currentReview,
        () => walletEpoch === wallet.epoch.current,
      );
      setTx({ hash, operation: currentReview.operation, state: "pending" });
      setReview(null);
      setAmount("");
      setNotice("Transaction submitted. Waiting for Ethereum confirmation.");
    } catch (cause) {
      setErrors({ general: walletError(cause) });
    } finally {
      signingRef.current = false;
      setSigning(false);
    }
  }

  async function checkAllowance() {
    const target = validTarget(recipient);
    if (!target) {
      setErrors({
        target: "Enter a valid spender address to check its allowance.",
      });
      targetField.current?.focus();
      return;
    }
    if (!wallet.account || !wallet.provider) {
      openWallet();
      return;
    }
    if (wrongNetwork) {
      await wallet.switchNetwork();
      return;
    }
    const epoch = ++formEpoch.current;
    const walletEpoch = wallet.epoch.current;
    setWorking(true);
    setErrors({});
    setAllowance(null);
    try {
      await verifyWallet(wallet.provider, wallet.account);
      const value = await walletRead(wallet.provider, "allowance", [
        wallet.account,
        target,
      ]);
      if (epoch === formEpoch.current && walletEpoch === wallet.epoch.current)
        setAllowance(value);
    } catch (cause) {
      if (epoch === formEpoch.current)
        setErrors({ general: walletError(cause) });
    } finally {
      if (epoch === formEpoch.current) setWorking(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(token);
      setNotice("Contract address copied.");
    } catch {
      setNotice(
        "Copy is unavailable. Select and copy the full contract address below.",
      );
    }
  }

  async function addToken() {
    if (!wallet.provider || !wallet.account) {
      openWallet();
      return;
    }
    if (wrongNetwork) {
      await wallet.switchNetwork();
      return;
    }
    try {
      const added = await wallet.provider.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: token,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals,
          },
        },
      });
      setNotice(
        added
          ? "Coinstark was added to your wallet."
          : "The token was not added. You can import it using the contract address.",
      );
    } catch {
      setNotice(
        "Your wallet could not add the token. Import it manually using the contract address.",
      );
    }
  }

  const mainLabel = !connected
    ? "Connect to send"
    : wrongNetwork
      ? "Switch to Ethereum"
      : loading
        ? "Checking live data…"
        : !verified
          ? "Retry live data"
          : working
            ? "Checking transaction…"
            : signing
              ? "Confirm in wallet…"
              : transactionUnsettled
                ? "Awaiting confirmation"
                : operation === "transfer"
                  ? "Review transfer"
                  : "Review allowance";

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to dashboard
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="#main" aria-label="Coinstark home">
            <BrandMark />
            Coinstark<span className="wordmark-period">.</span>
          </a>
          <nav aria-label="Main navigation">
            <a className="nav-link active" href="#main">
              Dashboard
            </a>
            <a className="nav-link" href="#token-details">
              Token details
            </a>
            <a className="nav-link" href="#guide">
              Guide
            </a>
          </nav>
          <div className="header-actions">
            <span className="network-label">
              <svg
                width="14"
                height="22"
                viewBox="0 0 14 22"
                aria-hidden="true"
              >
                <path
                  d="m7 0 7 11-7 4-7-4zm0 17 7-4-7 9-7-9z"
                  fill="currentColor"
                />
              </svg>
              Ethereum
            </span>
            <button className="button header-wallet" onClick={openWallet}>
              <Icon name="wallet" size={18} />
              {connected ? "Wallet connected" : "Connect wallet"}
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="page-shell">
        <div className="page-intro">
          <div>
            <h1>Your token, in clear view.</h1>
            <p>Check your balance and send Coinstark on Ethereum.</p>
          </div>
          <a className="intro-link" href="#token-details">
            Meet Coinstark
            <Icon name="arrow" size={18} />
          </a>
        </div>

        <div className="dashboard-grid">
          <section className="workspace" aria-label="Manage Coinstark">
            <div className="workspace-top">
              <div className="segmented" aria-label="Token action">
                <button
                  aria-pressed={operation === "transfer"}
                  onClick={() => editMode("transfer")}
                  disabled={signing}
                >
                  Send
                </button>
                <button
                  aria-pressed={operation === "approve"}
                  onClick={() => editMode("approve")}
                  disabled={signing}
                >
                  Allowances
                </button>
              </div>
              <span className="network-small">Ethereum</span>
            </div>
            <div className="balance-row">
              <div>
                <span className="subtle-label">Your balance</span>
                <div
                  className={`balance ${snapshot?.balance !== null && snapshot?.balance !== undefined ? "has-value" : ""}`}
                >
                  {!connected
                    ? "Connect to view"
                    : loading
                      ? "Loading balance…"
                      : snapshot?.balance !== null &&
                          snapshot?.balance !== undefined
                        ? displayAmount(snapshot.balance)
                        : "Balance unavailable"}
                </div>
              </div>
              <button
                className="icon-button refresh-button"
                onClick={refresh}
                disabled={loading}
                aria-label="Refresh live data"
              >
                <Icon name="refresh" />
              </button>
            </div>
            {connected && (
              <p className="account-line">
                Connected account{" "}
                <span className="address">{wallet.account}</span>
              </p>
            )}
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="target">
                  {operation === "transfer"
                    ? "Recipient address"
                    : "Spender address"}
                </label>
                <input
                  id="target"
                  name="target"
                  ref={targetField}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="0x…"
                  value={recipient}
                  disabled={working || signing}
                  onChange={(event) => {
                    setRecipient(event.target.value);
                    setErrors({});
                    setAllowance(null);
                  }}
                  aria-invalid={Boolean(errors.target)}
                  aria-describedby={
                    errors.target ? "target-error" : "target-hint"
                  }
                />
                {errors.target ? (
                  <p className="field-error" id="target-error">
                    {errors.target}
                  </p>
                ) : (
                  <p className="field-hint" id="target-hint">
                    {operation === "transfer"
                      ? "Use an Ethereum address, not an ENS name."
                      : "Only approve a spender you trust with your tokens."}
                  </p>
                )}
              </div>
              {operation === "approve" && (
                <div className="allowance-read">
                  <button
                    className="text-button"
                    type="button"
                    onClick={checkAllowance}
                    disabled={working || signing}
                  >
                    Check allowance
                    <Icon name="arrow" size={16} />
                  </button>
                  <p role="status">
                    {allowance !== null
                      ? `${displayAmount(allowance)} COINSTARK allowed`
                      : "Enter a spender to view its allowance."}
                  </p>
                </div>
              )}
              <div className="field">
                <label htmlFor="amount">
                  Amount <span className="token-unit">COINSTARK</span>
                </label>
                <div className="amount-input">
                  <input
                    id="amount"
                    name="amount"
                    ref={amountField}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={amount}
                    disabled={working || signing}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setErrors({});
                    }}
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={
                      errors.amount ? "amount-error" : "amount-hint"
                    }
                  />
                  {operation === "transfer" &&
                    snapshot?.balance !== null &&
                    snapshot?.balance !== undefined && (
                      <button
                        type="button"
                        className="max-button"
                        disabled={working || signing}
                        onClick={() => {
                          setAmount(amountText(snapshot.balance!));
                          setErrors({});
                        }}
                      >
                        Max
                      </button>
                    )}
                </div>
                {errors.amount ? (
                  <p className="field-error" id="amount-error">
                    {errors.amount}
                  </p>
                ) : (
                  <p className="field-hint" id="amount-hint">
                    {operation === "transfer"
                      ? "The recipient receives the full amount."
                      : "Set 0 to revoke. Revoke before changing an existing allowance."}
                  </p>
                )}
              </div>
              {wrongNetwork && (
                <div className="inline-message warning">
                  <Icon name="info" />
                  <p>
                    Your wallet is on another network. Switch to Ethereum to
                    continue.
                  </p>
                </div>
              )}
              {connected && networkError && (
                <p className="field-error" role="alert">
                  {networkError}
                </p>
              )}
              {wallet.error && !walletOpen && (
                <p className="field-error" role="alert">
                  {wallet.error}
                </p>
              )}
              {errors.general && !review && (
                <p className="field-error" role="alert">
                  {errors.general}
                </p>
              )}
              <button
                className="button primary-button"
                type="submit"
                disabled={
                  working ||
                  signing ||
                  wallet.busy ||
                  (connected && loading) ||
                  transactionUnsettled
                }
              >
                <span>
                  {operation === "approve" && !connected
                    ? "Connect to manage"
                    : mainLabel}
                </span>
                <Icon name={!connected ? "wallet" : "arrow"} />
              </button>
              <p className="form-note">
                {operation === "transfer"
                  ? "You review every transfer before signing. ETH pays the network fee."
                  : "An allowance lets a spender move tokens from your wallet. ETH pays the fee."}
              </p>
            </form>
            {tx && (
              <div className={`transaction-result ${tx.state}`} role="status">
                <strong>
                  {tx.state === "success"
                    ? tx.operation === "transfer"
                      ? "Transfer confirmed"
                      : "Allowance confirmed"
                    : tx.state === "reverted"
                      ? "Transaction reverted"
                      : tx.state === "unknown"
                        ? "Confirmation unavailable"
                        : "Transaction submitted"}
                </strong>
                <p>
                  {tx.state === "success"
                    ? "Included in an Ethereum block."
                    : tx.state === "reverted"
                      ? "The action did not complete. The network fee may still apply."
                      : tx.state === "unknown"
                        ? "Check Etherscan before sending again. You can retry the confirmation check."
                        : "Waiting for Ethereum. You can track the transaction below."}
                </p>
                <ExternalLink href={`${network.explorer}/tx/${tx.hash}`}>
                  View transaction
                </ExternalLink>
                <code className="transaction-hash">{tx.hash}</code>
                {(tx.state === "unknown" || tx.state === "pending") && (
                  <button
                    className="text-button"
                    onClick={() => checkReceipt(tx.hash)}
                    disabled={receiptBusy}
                  >
                    {receiptBusy
                      ? "Checking confirmation…"
                      : "Check confirmation"}
                  </button>
                )}
              </div>
            )}
          </section>

          <aside className="token-passport" aria-label="Coinstark at a glance">
            <div className="passport-top">
              <div className="passport-token">
                <BrandMark />
                <div>
                  <h2>Coinstark</h2>
                  <p>COINSTARK</p>
                </div>
              </div>
              <span className="standard-label">ERC-20</span>
            </div>
            <div className="token-art" aria-hidden="true">
              <svg viewBox="0 0 360 220" fill="none">
                <ellipse
                  cx="180"
                  cy="110"
                  rx="140"
                  ry="70"
                  stroke="currentColor"
                  strokeOpacity=".2"
                  transform="rotate(-25 180 110)"
                />
                <ellipse
                  cx="180"
                  cy="110"
                  rx="140"
                  ry="70"
                  stroke="currentColor"
                  strokeOpacity=".2"
                  transform="rotate(25 180 110)"
                />
                <circle
                  cx="180"
                  cy="110"
                  r="86"
                  stroke="currentColor"
                  strokeOpacity=".35"
                />
                <circle
                  cx="180"
                  cy="110"
                  r="64"
                  stroke="currentColor"
                  strokeOpacity=".18"
                />
                <path
                  d="m180 46 15 46 49 18-49 16-15 48-17-48-47-16 47-18z"
                  fill="currentColor"
                />
                <circle cx="291" cy="55" r="6" fill="currentColor" />
                <path
                  d="M39 153v14m-7-7h14M295 163v10m-5-5h10"
                  stroke="currentColor"
                  strokeOpacity=".65"
                />
              </svg>
            </div>
            <div className="supply">
              <span>Total fixed supply</span>
              <strong>1,000,000,000</strong>
              <p>One billion. Minted once.</p>
            </div>
            <div className="passport-facts">
              <div>
                <span>Network</span>
                <strong>Ethereum</strong>
              </div>
              <div>
                <span>Decimals</span>
                <strong>18</strong>
              </div>
              <div>
                <span>Token transfer fee</span>
                <strong>0%</strong>
              </div>
            </div>
            <p className="passport-note">
              <Icon name="shield" size={18} />
              No owner or additional minting.
            </p>
          </aside>
        </div>

        <div
          className={`connection-strip ${networkError ? "unavailable" : ""}`}
          role="status"
        >
          <div>
            <span className={`status-dot ${verified ? "verified" : ""}`} />
            <span>
              {loading
                ? "Connecting to Ethereum…"
                : networkError
                  ? networkError
                  : `Live contract verified · Block ${snapshot!.block.toLocaleString()}`}
            </span>
          </div>
          <button className="text-button" disabled={loading} onClick={refresh}>
            {loading ? "Checking…" : "Refresh"}
            <Icon name="refresh" size={16} />
          </button>
        </div>

        <section
          className="details-section"
          id="token-details"
          aria-labelledby="details-heading"
        >
          <div className="section-heading">
            <h2 id="details-heading">Token details</h2>
            <p>Simple rules, written into the contract.</p>
          </div>
          <div className="token-principles">
            <div>
              <span className="principle-number" aria-hidden="true">
                01
              </span>
              <h3>Fixed from the start</h3>
              <p>
                All one billion tokens were minted at deployment. The contract
                cannot create more.
              </p>
            </div>
            <div>
              <span className="principle-number" aria-hidden="true">
                02
              </span>
              <h3>What you send arrives</h3>
              <p>
                No token tax or transfer burn. Ethereum network fees are paid
                separately in ETH.
              </p>
            </div>
            <div>
              <span className="principle-number" aria-hidden="true">
                03
              </span>
              <h3>No admin controls</h3>
              <p>
                No owner, pause switch or upgrade mechanism. Token holders
                control their balances.
              </p>
            </div>
          </div>
          <div className="contract-row">
            <div className="contract-value">
              <span>Ethereum contract</span>
              <code>{token}</code>
            </div>
            <div className="contract-actions">
              <button className="button secondary-button" onClick={copyAddress}>
                <Icon name="copy" size={18} />
                Copy address
              </button>
              <ExternalLink href={explorer}>View on Etherscan</ExternalLink>
            </div>
          </div>
          <div className="source-row">
            <ExternalLink href={sourceUrl}>
              Read the contract source
            </ExternalLink>
            <button className="text-button" onClick={addToken}>
              Add token to wallet
              <Icon name="wallet" size={18} />
            </button>
          </div>
        </section>

        <section
          className="guide-section"
          id="guide"
          aria-labelledby="guide-heading"
        >
          <div className="section-heading">
            <h2 id="guide-heading">Using Coinstark</h2>
            <p>Answers before your first transfer.</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                What do I need to get started?
                <Icon name="chevron" />
              </summary>
              <p>
                Use an Ethereum wallet extension or open this site in your
                wallet’s browser. Connect your account to see your Coinstark
                balance. To send tokens, you need COINSTARK and enough ETH for
                the network fee.
              </p>
              <p>
                WalletConnect QR pairing is not supported. Connecting does not
                send a transaction or grant a token allowance.
              </p>
            </details>
            <details>
              <summary>
                Can I undo a transfer?
                <Icon name="chevron" />
              </summary>
              <p>
                Confirmed transfers cannot be reversed by this site. Check the
                full recipient address and amount in the review, then in your
                wallet. Send only to an Ethereum address that can receive and
                manage ERC-20 tokens.
              </p>
            </details>
            <details>
              <summary>
                What is a token allowance?
                <Icon name="chevron" />
              </summary>
              <p>
                An allowance authorizes a specific spender to move up to an
                amount of your Coinstark. Use the Allowances action to check,
                set or revoke it. Setting the amount to 0 revokes it. Wait for
                that revocation to confirm before setting another amount.
              </p>
              <p>
                A revocation cannot undo tokens already spent. This dashboard
                uses exact amounts and never requests an unlimited approval.
              </p>
            </details>
            <details>
              <summary>
                Why might live data be unavailable?
                <Icon name="chevron" />
              </summary>
              <p>
                This site reads Ethereum through public RPC services. If they
                cannot be reached, published token details stay visible and
                transactions stay unavailable. Use Refresh to try again, or
                check the contract on Etherscan.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="site-footer page-shell">
        <a href="#main" className="footer-brand">
          Coinstark<span>.</span>
        </a>
        <p>Fixed supply. On Ethereum.</p>
        <ExternalLink href={explorer}>Explore the contract</ExternalLink>
      </footer>
      <div className={`notice ${notice ? "visible" : ""}`} role="status">
        <span>{notice}</span>
        {notice && (
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {walletOpen && (
        <Modal
          title={connected ? "Your wallet" : "Connect your wallet"}
          onClose={closeWallet}
        >
          {connected ? (
            <>
              <p className="modal-copy">
                {wrongNetwork
                  ? "Switch to Ethereum to use Coinstark."
                  : "Connected to your Ethereum account."}
              </p>
              <div className="wallet-account">
                <span>Account</span>
                <code>{wallet.account}</code>
              </div>
              <ExternalLink
                href={`${network.explorer}/address/${wallet.account}`}
              >
                View account on Etherscan
              </ExternalLink>
              {wrongNetwork && (
                <button
                  className="button primary-button"
                  disabled={wallet.busy}
                  onClick={wallet.switchNetwork}
                >
                  {wallet.busy ? "Check your wallet…" : "Switch to Ethereum"}
                </button>
              )}
              <button
                className="button secondary-button full-width"
                onClick={() => {
                  wallet.disconnect();
                  setWalletOpen(false);
                }}
              >
                Disconnect from this site
              </button>
              <p className="form-note">
                This removes the session here. Wallet permissions and on-chain
                allowances stay unchanged.
              </p>
            </>
          ) : (
            <>
              <p className="modal-copy">
                Connect an Ethereum wallet to view your balance and manage
                Coinstark.
              </p>
              {wallet.options.length ? (
                <div className="wallet-options">
                  {wallet.options.map((option) => (
                    <button
                      className="button wallet-option"
                      key={option.id}
                      disabled={wallet.busy}
                      onClick={async () => {
                        if (await wallet.connect(option)) setWalletOpen(false);
                      }}
                    >
                      <Icon name="wallet" />
                      <span>
                        {wallet.busy ? "Check your wallet…" : option.name}
                      </span>
                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-wallet">
                  <Icon name="wallet" size={32} />
                  <h3>No wallet detected</h3>
                  <p>
                    Open this site in your wallet’s browser, or enable an
                    Ethereum wallet extension.
                  </p>
                  <button
                    className="button secondary-button"
                    onClick={wallet.discover}
                  >
                    Check for a wallet
                  </button>
                </div>
              )}
              <p className="form-note">
                Connecting is free. You approve transactions in your wallet.
              </p>
            </>
          )}
          {wallet.error && (
            <p role="alert" className="field-error">
              {wallet.error}
            </p>
          )}
        </Modal>
      )}

      {review && (
        <Modal
          title={
            review.operation === "transfer"
              ? "Review your transfer"
              : review.amount === 0n
                ? "Review allowance revocation"
                : "Review token allowance"
          }
          onClose={() => {
            setReview(null);
            setErrors({});
          }}
          locked={signing}
        >
          <div className="review-amount">
            <strong>{displayAmount(review.amount)}</strong>
            <span>COINSTARK</span>
          </div>
          <dl className="review-details">
            <div>
              <dt>From</dt>
              <dd className="address">{review.owner}</dd>
            </div>
            <div>
              <dt>
                {review.operation === "transfer" ? "Recipient" : "Spender"}
              </dt>
              <dd className="address">{review.target}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Ethereum mainnet</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd className="address">{token}</dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>Paid in ETH; shown in your wallet</dd>
            </div>
          </dl>
          <p className="review-warning">
            {review.operation === "transfer"
              ? "Check the full recipient address. Confirmed transfers cannot be reversed."
              : review.amount === 0n
                ? "This removes the spender’s remaining allowance. It cannot undo tokens already spent."
                : "This spender will be able to move up to this amount of your tokens. Only approve it if you trust it."}
          </p>
          {errors.general && (
            <p className="field-error" role="alert">
              {errors.general}
            </p>
          )}
          <button
            className="button primary-button"
            onClick={confirm}
            disabled={signing}
          >
            {signing
              ? "Confirm in your wallet…"
              : review.operation === "transfer"
                ? "Confirm transfer in wallet"
                : review.amount === 0n
                  ? "Revoke allowance in wallet"
                  : "Approve amount in wallet"}
            <Icon name="arrow" />
          </button>
          <button
            className="text-button modal-back"
            onClick={() => {
              setReview(null);
              setErrors({});
            }}
            disabled={signing}
          >
            Back to edit
          </button>
        </Modal>
      )}
    </>
  );
}
