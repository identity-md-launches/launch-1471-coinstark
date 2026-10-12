import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  isAddress,
  keccak256,
  parseUnits,
} from "viem";
import type { Abi, Address, Hex } from "viem";
import abiJson from "./contracts/Coinstark.abi.json";
import deployment from "./contracts/deployment.json";
import config from "./contracts/network.json";
import integrity from "./contracts/integrity.json";

export const abi = abiJson as Abi;
export const token = deployment.contracts[0].address as Address;
export const network = config.network;
export const walletChain = config.walletAddChain;
export const tokenInfo = deployment.manifest.token;
export const explorer = `${network.explorer}/address/${token}`;
export const sourceUrl = `${deployment.repoUrl}/blob/${deployment.sourceCommit}/src/Coinstark.sol`;
export type Request = (args: {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}) => Promise<unknown>;
export type Provider = {
  request: Request;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};
export type Snapshot = {
  supply: bigint;
  balance: bigint | null;
  block: bigint;
  checkedAt: number;
};
export type Operation = "transfer" | "approve";
export type Review = {
  operation: Operation;
  owner: Address;
  target: Address;
  amount: bigint;
  data: Hex;
};

export function asAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value)
    ? (value as Address)
    : null;
}
export function validTarget(value: string): Address | null {
  const address = asAddress(value.trim());
  return address &&
    BigInt(address) !== 0n &&
    address.toLowerCase() !== token.toLowerCase()
    ? address
    : null;
}
export function parseAmount(value: string, allowZero = false): bigint {
  const clean = value.trim();
  if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(clean) || clean.length > 80) {
    throw new Error("Enter a number with up to 18 decimal places.");
  }
  const amount = parseUnits(clean, tokenInfo.decimals);
  if (amount < 0n || (!allowZero && amount === 0n))
    throw new Error("Enter an amount greater than zero.");
  if (amount > BigInt(tokenInfo.totalSupply))
    throw new Error("The amount exceeds the total token supply.");
  return amount;
}
export function amountText(amount: bigint): string {
  return formatUnits(amount, tokenInfo.decimals);
}
export function displayAmount(amount: bigint): string {
  const [whole, fraction] = amountText(amount).split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (fraction ? `.${fraction}` : "")
  );
}
export function callData(
  functionName: string,
  args: readonly unknown[] = [],
): Hex {
  return encodeFunctionData({ abi, functionName, args });
}
function result(functionName: string, value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith("0x"))
    throw new Error(
      "The network returned an invalid result. Retry the connection.",
    );
  return decodeFunctionResult({ abi, functionName, data: value as Hex });
}
export function checkCode(code: unknown): void {
  if (
    typeof code !== "string" ||
    !/^0x[0-9a-f]+$/i.test(code) ||
    keccak256(code as Hex) !== integrity.runtimeCodeHash
  ) {
    throw new Error(
      "The deployed contract could not be verified. Transactions are unavailable.",
    );
  }
}

let requestId = 0;
async function atEndpoint(
  url: string,
  method: string,
  params: unknown[] = [],
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 8000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Network request failed.");
    const body = (await response.json()) as {
      result?: unknown;
      error?: unknown;
    };
    if (body.error || body.result === undefined)
      throw new Error("Network request failed.");
    return body.result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function loadSnapshot(
  account: Address | null,
  signal?: AbortSignal,
): Promise<Snapshot> {
  let mismatch: Error | undefined;
  for (const endpoint of network.rpcUrls) {
    if (signal?.aborted) throw new Error("Request cancelled.");
    try {
      const chain = await atEndpoint(endpoint, "eth_chainId", [], signal);
      if (chain !== walletChain.chainId)
        throw new Error(
          "The RPC returned a different network. Transactions are unavailable.",
        );
      const block = (await atEndpoint(
        endpoint,
        "eth_blockNumber",
        [],
        signal,
      )) as Hex;
      const read = (name: string, args: readonly unknown[] = []) =>
        atEndpoint(
          endpoint,
          "eth_call",
          [{ to: token, data: callData(name, args) }, block],
          signal,
        ).then((value) => result(name, value));
      const [code, supply, name, symbol, decimals, balance] = await Promise.all(
        [
          atEndpoint(endpoint, "eth_getCode", [token, block], signal),
          read("totalSupply"),
          read("name"),
          read("symbol"),
          read("decimals"),
          account ? read("balanceOf", [account]) : Promise.resolve(null),
        ],
      );
      try {
        checkCode(code);
        if (
          supply !== BigInt(tokenInfo.totalSupply) ||
          name !== tokenInfo.name ||
          symbol !== tokenInfo.symbol ||
          decimals !== tokenInfo.decimals
        ) {
          throw new Error(
            "The token details do not match the verified deployment. Transactions are unavailable.",
          );
        }
      } catch (error) {
        mismatch = error as Error;
        throw error;
      }
      return {
        supply: supply as bigint,
        balance: balance as bigint | null,
        block: BigInt(block),
        checkedAt: Date.now(),
      };
    } catch {
      /* Retry the other pinned RPC before showing an unavailable state. */
    }
  }
  throw (
    mismatch ??
    new Error("Live data is unavailable. Check your connection and retry.")
  );
}

export async function verifyWallet(
  provider: Provider,
  account: Address,
): Promise<void> {
  const chain = await provider.request({ method: "eth_chainId" });
  if (chain !== walletChain.chainId)
    throw new Error("Switch your wallet to Ethereum, then try again.");
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as unknown[];
  if (
    !Array.isArray(accounts) ||
    asAddress(accounts[0])?.toLowerCase() !== account.toLowerCase()
  ) {
    throw new Error("Your wallet account changed. Review the action again.");
  }
  checkCode(
    await provider.request({
      method: "eth_getCode",
      params: [token, "latest"],
    }),
  );
}

export async function walletRead(
  provider: Provider,
  functionName: string,
  args: readonly unknown[],
): Promise<bigint> {
  return result(
    functionName,
    await provider.request({
      method: "eth_call",
      params: [{ to: token, data: callData(functionName, args) }, "latest"],
    }),
  ) as bigint;
}

export async function prepareReview(
  provider: Provider,
  account: Address,
  operation: Operation,
  target: Address,
  amount: bigint,
): Promise<Review> {
  await verifyWallet(provider, account);
  if (operation === "transfer") {
    const balance = await walletRead(provider, "balanceOf", [account]);
    if (amount > balance)
      throw new Error(
        "This amount exceeds your current balance. Enter a smaller amount.",
      );
  } else {
    const allowance = await walletRead(provider, "allowance", [
      account,
      target,
    ]);
    if (amount > 0n && allowance > 0n)
      throw new Error(
        "Revoke the existing allowance first: set the amount to 0 and confirm it, then approve a new amount.",
      );
  }
  const data = callData(operation, [target, amount]);
  const simulated = await provider.request({
    method: "eth_call",
    params: [{ from: account, to: token, data }, "latest"],
  });
  if (result(operation, simulated) !== true)
    throw new Error(
      "This transaction could not be simulated. Refresh your balance and try again.",
    );
  return { operation, owner: account, target, amount, data };
}

export async function sendReviewed(
  provider: Provider,
  review: Review,
  isCurrent: () => boolean,
): Promise<Hex> {
  // Repeat state and allowance checks after the review, immediately before requesting a signature.
  await prepareReview(
    provider,
    review.owner,
    review.operation,
    review.target,
    review.amount,
  );
  await verifyWallet(provider, review.owner);
  if (!isCurrent())
    throw new Error("Your wallet account changed. Review the action again.");
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: review.owner,
        to: token,
        data: review.data,
        value: "0x0",
        chainId: walletChain.chainId,
      },
    ],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash))
    throw new Error(
      "The wallet did not return a transaction hash. Check your wallet activity before trying again.",
    );
  return hash as Hex;
}

export async function transactionReceipt(
  hash: Hex,
): Promise<"pending" | "success" | "reverted"> {
  for (const url of network.rpcUrls) {
    try {
      if ((await atEndpoint(url, "eth_chainId")) !== walletChain.chainId)
        continue;
      const receipt = (await atEndpoint(url, "eth_getTransactionReceipt", [
        hash,
      ])) as null | { status?: string; transactionHash?: string };
      if (receipt === null) return "pending";
      if (receipt.transactionHash?.toLowerCase() !== hash.toLowerCase())
        continue;
      if (receipt.status === "0x1") return "success";
      if (receipt.status === "0x0") return "reverted";
    } catch {
      /* Receipt tracking can continue on the other pinned RPC. */
    }
  }
  throw new Error(
    "Confirmation is unavailable. Check the transaction on Etherscan before sending again.",
  );
}

export function walletError(error: unknown): string {
  const value = error as { code?: number; message?: string };
  if (
    value?.code === 4001 ||
    /user rejected|user denied/i.test(value?.message ?? "")
  )
    return "Request declined in your wallet. You can try again when ready.";
  if (value?.code === -32002)
    return "A request is already open. Check your wallet to continue.";
  if (/insufficient funds/i.test(value?.message ?? ""))
    return "Your wallet needs ETH for the network fee.";
  if (/revert/i.test(value?.message ?? ""))
    return "The contract rejected this request. Check the amount and balance, then try again.";
  if (
    error instanceof Error &&
    /^(Switch |Your wallet account|The deployed|This amount|Revoke |This transaction|The wallet did|Confirmation|No account)/.test(
      error.message,
    )
  )
    return error.message;
  return "The wallet request could not complete. Check your wallet and try again.";
}
