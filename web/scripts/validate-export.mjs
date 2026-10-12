// Deterministic browser tests. Every RPC and wallet request is simulated here;
// no test connects a real wallet or broadcasts a transaction.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  keccak256,
  toHex,
} from "viem";

const web = fileURLToPath(new URL("../", import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const dist = resolve(arg("--dist", resolve(web, "../dist")));
const output = resolve(
  arg("--out", resolve(web, "../test/scratch/interactions")),
);
const artifactPath = arg("--artifact");
if (!artifactPath)
  throw new Error("Pass --artifact /absolute/path/to/compiled/Coinstark.json.");
const artifact = JSON.parse(await readFile(resolve(artifactPath), "utf8"));
const deployment = JSON.parse(
  await readFile(resolve(web, "src/contracts/deployment.json"), "utf8"),
);
const config = JSON.parse(
  await readFile(resolve(web, "src/contracts/network.json"), "utf8"),
);
const { abi } = artifact;
const code = artifact.deployedBytecode.object;
const token = deployment.contracts[0].address;
// These are fixture identities from the manifest, never an assumed visitor's account.
const owner = deployment.manifest.economics.remainderTo;
const receiver = deployment.manifest.pool.pairedCurrency;
const block = toHex(BigInt(deployment.contracts[0].blockNumber));
const supply = BigInt(deployment.manifest.token.totalSupply);
const rpcHosts = config.network.rpcUrls.map((value) => new URL(value).hostname);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const results = [];
const limitations = [];
await mkdir(output, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/preview/")) {
      res.writeHead(404).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice("/preview/".length));
    const path = resolve(dist, relative || "index.html");
    if (!path.startsWith(dist + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/preview/`;

function makeState() {
  return {
    balance: 1000n * 10n ** 18n + 1n,
    allowance: 0n,
    chain: "0x1",
    accounts: [owner],
    rejectConnect: false,
    rejectSend: false,
    mismatch: false,
    offline: false,
    receipt: "pending",
    receiptOffline: false,
    failPrimary: false,
    calls: [],
    sent: [],
    delaySimulation: 0,
    simulationReject: false,
  };
}
function contractRead(data, state) {
  const { functionName, args } = decodeFunctionData({ abi, data });
  const values = {
    name: "Coinstark",
    symbol: "COINSTARK",
    decimals: 18,
    totalSupply: supply,
    balanceOf: state.balance,
    allowance: state.allowance,
    transfer: true,
    approve: true,
  };
  if (!(functionName in values))
    throw new Error(`Unexpected contract function ${functionName}`);
  return {
    functionName,
    args,
    encoded: encodeFunctionResult({
      abi,
      functionName,
      result: values[functionName],
    }),
  };
}
async function rpc(method, params = [], state, wallet = false) {
  state.calls.push({ method, params, wallet });
  if (method === "eth_chainId") return wallet ? state.chain : "0x1";
  if (method === "eth_blockNumber") return block;
  if (method === "eth_getCode") {
    assert.equal(params[0], token);
    return state.mismatch ? "0x00" : code;
  }
  if (method === "eth_accounts") return state.accounts;
  if (method === "eth_requestAccounts") {
    if (state.rejectConnect)
      throw Object.assign(new Error("User rejected request"), { code: 4001 });
    return state.accounts;
  }
  if (method === "eth_call") {
    assert.equal(params[0].to, token);
    const read = contractRead(params[0].data, state);
    if (["transfer", "approve"].includes(read.functionName)) {
      if (state.delaySimulation)
        await new Promise((done) => setTimeout(done, state.delaySimulation));
      if (state.simulationReject) throw new Error("execution reverted");
    }
    return read.encoded;
  }
  if (method === "eth_sendTransaction") {
    if (state.rejectSend)
      throw Object.assign(new Error("User rejected request"), { code: 4001 });
    const transaction = params[0];
    assert.equal(transaction.to, token);
    assert.equal(transaction.from, owner);
    assert.equal(transaction.value, "0x0");
    assert.equal(transaction.chainId, "0x1");
    state.sent.push(transaction);
    state.hash = keccak256(toHex(`Simulated transaction ${state.sent.length}`));
    return state.hash;
  }
  if (method === "wallet_switchEthereumChain") {
    assert.equal(params[0].chainId, "0x1");
    state.chain = "0x1";
    return null;
  }
  if (method === "wallet_watchAsset") {
    assert.equal(params.options.address, token);
    return true;
  }
  if (method === "eth_getTransactionReceipt") {
    if (state.receiptOffline) throw new Error("RPC temporarily unavailable");
    if (state.receipt === "pending") return null;
    return {
      status: state.receipt === "success" ? "0x1" : "0x0",
      transactionHash: params[0],
    };
  }
  throw new Error(`Unexpected RPC method ${method}`);
}

async function session(
  browser,
  { injected = true, width = 390, state = makeState() } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const localFailures = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(url) && response.status() >= 400)
      localFailures.push(response.url());
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const host = new URL(request.url()).hostname;
    if (host === "127.0.0.1") {
      await route.continue();
      return;
    }
    if (!rpcHosts.includes(host)) {
      await route.abort();
      throw new Error(`Unexpected external request ${request.url()}`);
    }
    if (state.offline || (state.failPrimary && host === rpcHosts[0])) {
      await route.fulfill({ status: 503, body: "Unavailable" });
      return;
    }
    const body = request.postDataJSON();
    try {
      const result = await rpc(body.method, body.params, state);
      await route.fulfill({ json: { id: body.id, jsonrpc: "2.0", result } });
    } catch (error) {
      await route.fulfill({
        json: {
          id: body.id,
          jsonrpc: "2.0",
          error: { code: -32000, message: error.message },
        },
      });
    }
  });
  if (injected) {
    await page.exposeFunction("__testRpc", async (args) => {
      try {
        return { result: await rpc(args.method, args.params, state, true) };
      } catch (error) {
        return { error: { message: error.message, code: error.code } };
      }
    });
    await page.addInitScript(() => {
      const listeners = new Map();
      const provider = {
        async request(args) {
          const response = await window.__testRpc(args);
          if (response.error)
            throw Object.assign(new Error(response.error.message), {
              code: response.error.code,
            });
          if (args.method === "eth_requestAccounts")
            provider.emit("accountsChanged", response.result);
          if (args.method === "wallet_switchEthereumChain")
            provider.emit("chainChanged", "0x1");
          return response.result;
        },
        on(event, fn) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event).add(fn);
        },
        removeListener(event, fn) {
          listeners.get(event)?.delete(fn);
        },
        emit(event, value) {
          for (const fn of listeners.get(event) ?? []) fn(value);
        },
      };
      window.ethereum = provider;
      const detail = {
        info: {
          uuid: "test-provider",
          name: "Simulated wallet",
          rdns: "test.wallet",
        },
        provider,
      };
      window.addEventListener("eip6963:requestProvider", () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail }),
        ),
      );
    });
  }
  await page.goto(url);
  await expect(page.locator(".connection-strip")).not.toContainText(
    "Connecting",
  );
  return {
    context,
    page,
    state,
    async close() {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(localFailures, []);
      await context.close();
    },
  };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simulated wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Wallet connected", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".balance")).not.toContainText("Loading");
}
async function fillTransfer(page, value = "1.000000000000000001") {
  await page.getByLabel("Recipient address").fill(receiver);
  await page.getByLabel("Amount COINSTARK").fill(value);
}
async function test(name, run) {
  const started = Date.now();
  try {
    const details = await run();
    results.push({
      name,
      passed: true,
      durationMs: Date.now() - started,
      ...(details ? { details } : {}),
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      durationMs: Date.now() - started,
      error: error.stack,
    });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  await test("Relative assets, metadata, reflow at 320/390/768/1440, and first-screen action", async () => {
    const s = await session(browser, { injected: false });
    for (const width of [320, 390, 768, 1440]) {
      await s.page.setViewportSize({ width, height: 844 });
      await s.page.evaluate(() => window.scrollTo(0, 0));
      const geometry = await s.page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        action: document
          .querySelector(".primary-button")
          .getBoundingClientRect().bottom,
      }));
      assert.ok(
        geometry.scroll <= geometry.width,
        `${width}px page overflowed to ${geometry.scroll}px`,
      );
      if (width === 390)
        assert.ok(
          geometry.action <= 844,
          "Main action is below the first screen",
        );
    }
    const assets = await s.page.evaluate(() =>
      [...document.querySelectorAll("script[src],link[href]")].map(
        (node) => node.getAttribute("src") ?? node.getAttribute("href"),
      ),
    );
    assert.ok(
      assets.every((value) => value.startsWith("./")),
      JSON.stringify(assets),
    );
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:image"]',
    ])
      assert.ok(await s.page.locator(selector).getAttribute("content"));
    assert.equal(
      (
        await s.page.request.get(
          new URL(
            await s.page
              .locator('meta[property="og:image"]')
              .getAttribute("content"),
            url,
          ).href,
        )
      ).status(),
      200,
    );
    await s.close();
  });
  await test("No-wallet prompt, keyboard loop, Escape, focus return and FAQ navigation", async () => {
    const s = await session(browser, { injected: false });
    await s.page.getByRole("button", { name: "Connect to send" }).focus();
    await s.page.keyboard.press("Enter");
    await expect(
      s.page.getByRole("heading", { name: "No wallet detected" }),
    ).toBeVisible();
    await s.page.keyboard.press("Tab");
    await expect(
      s.page.getByRole("button", { name: "Check for a wallet" }),
    ).toBeFocused();
    await s.page.keyboard.press("Tab");
    await expect(
      s.page.getByRole("button", { name: "Close dialog" }),
    ).toBeFocused();
    await s.page.keyboard.press("Escape");
    await expect(
      s.page.getByRole("button", { name: "Connect to send" }),
    ).toBeFocused();
    const faq = s.page
      .locator("summary")
      .filter({ hasText: "Can I undo a transfer?" });
    await faq.focus();
    await s.page.keyboard.press("Enter");
    await expect(
      s.page.getByText("Confirmed transfers cannot be reversed by this site.", {
        exact: false,
      }),
    ).toBeVisible();
    await s.close();
  });
  await test("RPC failover, unavailable state and refresh recovery", async () => {
    const state = makeState();
    state.offline = true;
    const s = await session(browser, { state });
    await expect(s.page.locator(".connection-strip")).toContainText(
      "Live data is unavailable",
    );
    state.offline = false;
    state.failPrimary = true;
    await s.page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(s.page.locator(".connection-strip")).toContainText(
      "Live contract verified",
    );
    await s.close();
  });
  await test("Wrong deployed bytecode blocks transactions", async () => {
    const state = makeState();
    state.mismatch = true;
    const s = await session(browser, { state });
    await connect(s.page);
    await expect(s.page.locator(".connection-strip")).toContainText(
      "could not be verified",
    );
    await expect(
      s.page.getByRole("button", { name: "Retry live data" }),
    ).toBeVisible();
    assert.equal(state.sent.length, 0);
    await s.close();
  });
  await test("Connection rejection is recoverable and wallet connection survives accountsChanged", async () => {
    const state = makeState();
    state.rejectConnect = true;
    const s = await session(browser, { state });
    await s.page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await s.page.getByRole("button", { name: "Simulated wallet" }).click();
    await expect(s.page.getByRole("alert")).toContainText("Request declined");
    state.rejectConnect = false;
    await s.page.getByRole("button", { name: "Simulated wallet" }).click();
    await expect(
      s.page.getByRole("button", { name: "Wallet connected" }),
    ).toBeVisible();
    await expect(s.page.locator(".balance")).toHaveText(
      "1,000.000000000000000001",
    );
    await s.close();
  });
  await test("Wrong network switches explicitly to Ethereum", async () => {
    const state = makeState();
    state.chain = "0x2";
    const s = await session(browser, { state });
    await connect(s.page);
    await s.page
      .getByRole("button", { name: "Switch to Ethereum", exact: true })
      .click();
    await expect(
      s.page.getByRole("button", { name: "Review transfer", exact: true }),
    ).toBeVisible();
    assert.ok(
      state.calls.some((call) => call.method === "wallet_switchEthereumChain"),
    );
    assert.equal(state.sent.length, 0);
    await s.close();
  });
  await test("Validation rejects addresses, zero, exponent, overprecision and excess balance; Max stays exact", async () => {
    const s = await session(browser);
    await connect(s.page);
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(s.page.getByLabel("Recipient address")).toBeFocused();
    await s.page.getByLabel("Recipient address").fill(token);
    await s.page.getByLabel("Amount COINSTARK").fill("1");
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(s.page.locator("#target-error")).toContainText("cannot be");
    await s.page.getByLabel("Recipient address").fill(receiver);
    for (const value of ["0", "1e2", "1.0000000000000000001", "1001", "-1"]) {
      await s.page.getByLabel("Amount COINSTARK").fill(value);
      await s.page
        .getByRole("button", { name: "Review transfer", exact: true })
        .click();
      await expect(s.page.locator("#amount-error")).toBeVisible();
      await expect(s.page.getByLabel("Amount COINSTARK")).toBeFocused();
    }
    await s.page.getByRole("button", { name: "Max", exact: true }).click();
    await expect(s.page.getByLabel("Amount COINSTARK")).toHaveValue(
      "1000.000000000000000001",
    );
    assert.equal(s.state.sent.length, 0);
    await s.close();
  });
  await test("Transfer review, rejected signature, exact calldata, duplicate blocking and confirmation", async () => {
    const s = await session(browser);
    await connect(s.page);
    await fillTransfer(s.page);
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(s.page.getByRole("dialog")).toContainText(receiver);
    await s.page.screenshot({ path: resolve(output, "simulated-transfer-review-390.png") });
    assert.equal(s.state.sent.length, 0);
    s.state.rejectSend = true;
    await s.page
      .getByRole("button", { name: "Confirm transfer in wallet" })
      .click();
    await expect(s.page.getByRole("alert")).toContainText("Request declined");
    s.state.rejectSend = false;
    await s.page
      .getByRole("button", { name: "Confirm transfer in wallet" })
      .click();
    await expect(
      s.page.getByRole("button", { name: "Awaiting confirmation" }),
    ).toBeDisabled();
    assert.equal(s.state.sent.length, 1);
    const decoded = decodeFunctionData({ abi, data: s.state.sent[0].data });
    assert.equal(decoded.functionName, "transfer");
    assert.equal(decoded.args[0].toLowerCase(), receiver);
    assert.equal(decoded.args[1], 1000000000000000001n);
    s.state.receipt = "success";
    await s.page
      .getByRole("button", { name: "Check confirmation", exact: true })
      .click();
    await expect(s.page.locator(".transaction-result")).toContainText(
      "Transfer confirmed",
    );
    await s.close();
  });
  await test("Account change invalidates an open review and an in-flight simulation", async () => {
    const s = await session(browser);
    await connect(s.page);
    await fillTransfer(s.page, "1");
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(s.page.getByRole("dialog")).toBeVisible();
    s.state.accounts = [receiver];
    await s.page.evaluate(
      (address) => window.ethereum.emit("accountsChanged", [address]),
      receiver,
    );
    await expect(s.page.getByRole("dialog")).toHaveCount(0);
    s.state.accounts = [owner];
    await s.page.evaluate(
      (address) => window.ethereum.emit("accountsChanged", [address]),
      owner,
    );
    await expect(
      s.page.getByRole("button", { name: "Review transfer", exact: true }),
    ).toBeEnabled();
    s.state.delaySimulation = 600;
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    s.state.accounts = [receiver];
    await s.page.evaluate(
      (address) => window.ethereum.emit("accountsChanged", [address]),
      receiver,
    );
    await s.page.waitForTimeout(800);
    await expect(s.page.getByRole("dialog")).toHaveCount(0);
    assert.equal(s.state.sent.length, 0);
    await s.close();
  });
  await test("Allowance lookup, nonzero replacement guard, zero revocation and exact approval", async () => {
    const s = await session(browser);
    await connect(s.page);
    s.state.allowance = 5n * 10n ** 18n;
    await s.page
      .getByRole("button", { name: "Allowances", exact: true })
      .click();
    await s.page.getByLabel("Spender address").fill(receiver);
    await s.page
      .getByRole("button", { name: "Check allowance", exact: true })
      .click();
    await expect(s.page.locator(".allowance-read")).toContainText(
      "5 COINSTARK allowed",
    );
    await s.page.getByLabel("Amount COINSTARK").fill("2");
    await s.page
      .getByRole("button", { name: "Review allowance", exact: true })
      .click();
    await expect(s.page.getByRole("alert")).toContainText(
      "Revoke the existing allowance first",
    );
    await s.page.getByLabel("Amount COINSTARK").fill("0");
    await s.page
      .getByRole("button", { name: "Review allowance", exact: true })
      .click();
    await s.page
      .getByRole("button", { name: "Revoke allowance in wallet" })
      .click();
    await expect(
      s.page.getByRole("button", { name: "Awaiting confirmation" }),
    ).toBeDisabled();
    assert.equal(
      decodeFunctionData({ abi, data: s.state.sent[0].data }).args[1],
      0n,
    );
    s.state.receipt = "success";
    s.state.allowance = 0n;
    await s.page
      .getByRole("button", { name: "Check confirmation", exact: true })
      .click();
    await expect(s.page.locator(".transaction-result")).toContainText(
      "Allowance confirmed",
    );
    await expect(
      s.page.getByRole("button", { name: "Review allowance", exact: true }),
    ).toBeEnabled();
    await s.page.getByLabel("Amount COINSTARK").fill("2");
    await s.page
      .getByRole("button", { name: "Review allowance", exact: true })
      .click();
    await s.page
      .getByRole("button", { name: "Approve amount in wallet" })
      .click();
    await expect(
      s.page.getByRole("button", { name: "Awaiting confirmation" }),
    ).toBeDisabled();
    const approved = decodeFunctionData({ abi, data: s.state.sent[1].data });
    assert.equal(approved.functionName, "approve");
    assert.equal(approved.args[1], 2n * 10n ** 18n);
    await s.close();
  });
  await test("Simulation revert and wallet bytecode mismatch never send", async () => {
    const s = await session(browser);
    await connect(s.page);
    await fillTransfer(s.page, "1");
    s.state.simulationReject = true;
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(s.page.getByRole("alert")).toContainText("contract rejected");
    s.state.simulationReject = false;
    s.state.mismatch = true;
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(s.page.getByRole("alert")).toContainText(
      "could not be verified",
    );
    assert.equal(s.state.sent.length, 0);
    await s.close();
  });
  await test("Receipt failure keeps the hash, blocks resending and recovers to reverted", async () => {
    const s = await session(browser);
    await connect(s.page);
    await fillTransfer(s.page, "1");
    await s.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await s.page
      .getByRole("button", { name: "Confirm transfer in wallet" })
      .click();
    s.state.receiptOffline = true;
    await s.page
      .getByRole("button", { name: "Check confirmation", exact: true })
      .click();
    await expect(s.page.locator(".transaction-result")).toContainText(
      "Confirmation unavailable",
    );
    await expect(
      s.page.getByRole("button", { name: "Awaiting confirmation" }),
    ).toBeDisabled();
    assert.equal(
      await s.page
        .getByRole("link", { name: "View transaction", exact: false })
        .getAttribute("href"),
      `${config.network.explorer}/tx/${s.state.hash}`,
    );
    s.state.receiptOffline = false;
    s.state.receipt = "reverted";
    await s.page
      .getByRole("button", { name: "Check confirmation", exact: true })
      .click();
    await expect(s.page.locator(".transaction-result")).toContainText(
      "Transaction reverted",
    );
    await s.close();
  });
  await test("Token import, clipboard copy, account detail and local disconnect", async () => {
    const s = await session(browser);
    await connect(s.page);
    await s.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await s.page
      .getByRole("button", { name: "Copy address", exact: true })
      .click();
    assert.equal(
      await s.page.evaluate(() => navigator.clipboard.readText()),
      token,
    );
    await s.page
      .getByRole("button", { name: "Add token to wallet", exact: true })
      .click();
    await expect(s.page.locator(".notice")).toContainText(
      "added to your wallet",
    );
    await s.page
      .getByRole("button", { name: "Wallet connected", exact: true })
      .click();
    await expect(s.page.getByRole("dialog")).toContainText(owner);
    await s.page
      .getByRole("button", { name: "Disconnect from this site" })
      .click();
    await expect(
      s.page.getByRole("button", { name: "Connect wallet", exact: true }),
    ).toBeVisible();
    await s.close();
  });
  await test("Axe accessibility: entry page, no-wallet dialog, connected form and review", async () => {
    const s = await session(browser, { injected: false });
    const scans = [];
    async function scan(page, name) {
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      scans.push({ state: name, violations: audit.violations });
      assert.deepEqual(
        audit.violations.map((item) => ({
          id: item.id,
          nodes: item.nodes.map((node) => node.target),
        })),
        [],
      );
    }
    await scan(s.page, "disconnected");
    await s.page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await scan(s.page, "no wallet");
    await s.close();
    const c = await session(browser);
    await connect(c.page);
    await scan(c.page, "connected");
    await fillTransfer(c.page, "1");
    await c.page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await scan(c.page, "review");
    await writeFile(
      resolve(output, "axe.json"),
      JSON.stringify(scans, null, 2),
    );
    await c.close();
  });
  await test("Text enlargement, RTL geometry and reduced-motion styles", async () => {
    const s = await session(browser, { injected: false });
    await s.page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    assert.ok(
      await s.page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      "200% text overflows",
    );
    await s.page.evaluate(() => {
      document.documentElement.style.fontSize = "";
      document.documentElement.dir = "rtl";
    });
    assert.ok(
      await s.page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      "RTL overflows",
    );
    await s.page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await s.page
        .locator(".primary-button")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await s.close();
  });

  let safari;
  try {
    safari = await webkit.launch({ headless: true });
  } catch (error) {
    limitations.push(
      `WebKit could not launch: ${error.message.slice(0, 3000)}`,
    );
    console.log("LIMITATION WebKit could not launch; see results.json");
  }
  if (safari) {
    await test("WebKit mobile main interaction and transfer review", async () => {
      const s = await session(safari);
      await connect(s.page);
      await fillTransfer(s.page, "1");
      await s.page
        .getByRole("button", { name: "Review transfer", exact: true })
        .click();
      await expect(s.page.getByRole("dialog")).toContainText(receiver);
      await s.page.getByRole("button", { name: "Back to edit" }).click();
      await expect(s.page.getByRole("dialog")).toHaveCount(0);
      await s.close();
    });
    await safari.close();
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        fixtureNotice:
          "RPC and wallet behavior simulated; no funds, signing keys or live broadcasts used.",
        results,
        limitations,
      },
      null,
      2,
    ),
  );
}
console.log(
  `${results.filter((item) => item.passed).length}/${results.length} checks passed`,
);
if (results.some((item) => !item.passed)) process.exitCode = 1;
