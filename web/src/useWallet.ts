import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { asAddress, walletChain, walletError } from "./chain";
import type { Provider } from "./chain";

export type WalletOption = { id: string; name: string; provider: Provider };
declare global {
  interface Window {
    ethereum?: Provider;
  }
}

export function useWallet() {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);

  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        typeof detail?.provider?.request !== "function" ||
        typeof detail?.info?.uuid !== "string" ||
        typeof detail?.info?.name !== "string"
      )
        return;
      const option = {
        id: detail.info.uuid as string,
        name: detail.info.name as string,
        provider: detail.provider as Provider,
      };
      setOptions((current) =>
        current.some(
          (item) => item.id === option.id || item.provider === option.provider,
        )
          ? current
          : [...current, option],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  const discover = useCallback(() => {
    setError("");
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum) {
      const injected = window.ethereum;
      setOptions((current) =>
        current.some((option) => option.provider === injected)
          ? current
          : [
              ...current,
              { id: "injected", name: "Browser wallet", provider: injected },
            ],
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    epoch.current++;
    setProvider(null);
    setAccount(null);
    setChainId(null);
    setError("");
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!provider) return;
    const changedAccounts = (...args: unknown[]) => {
      epoch.current++;
      const accounts = args[0];
      setAccount(Array.isArray(accounts) ? asAddress(accounts[0]) : null);
      setBusy(false);
    };
    const changedChain = (...args: unknown[]) => {
      epoch.current++;
      setChainId(typeof args[0] === "string" ? args[0] : null);
      setBusy(false);
    };
    provider.on?.("accountsChanged", changedAccounts);
    provider.on?.("chainChanged", changedChain);
    provider.on?.("disconnect", disconnect);
    return () => {
      provider.removeListener?.("accountsChanged", changedAccounts);
      provider.removeListener?.("chainChanged", changedChain);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider, disconnect]);

  async function connect(option: WalletOption): Promise<boolean> {
    if (busy) return false;
    const requestEpoch = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const accounts = await option.provider.request({
        method: "eth_requestAccounts",
      });
      const chain = await option.provider.request({ method: "eth_chainId" });
      if (epoch.current !== requestEpoch) return false;
      const nextAccount = Array.isArray(accounts)
        ? asAddress(accounts[0])
        : null;
      if (!nextAccount)
        throw new Error(
          "No account was shared. Unlock your wallet and try again.",
        );
      setProvider(option.provider);
      setAccount(nextAccount);
      setChainId(typeof chain === "string" ? chain : null);
      return true;
    } catch (cause) {
      if (epoch.current === requestEpoch) {
        setError(walletError(cause));
        setProvider(null);
      }
      return false;
    } finally {
      if (epoch.current === requestEpoch) setBusy(false);
    }
  }

  async function switchNetwork() {
    if (!provider || busy) return;
    const requestEpoch = epoch.current;
    setBusy(true);
    setError("");
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: walletChain.chainId }],
        });
      } catch (cause) {
        if ((cause as { code?: number }).code !== 4902) throw cause;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [walletChain],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: walletChain.chainId }],
        });
      }
      const chain = await provider.request({ method: "eth_chainId" });
      if (epoch.current === requestEpoch)
        setChainId(typeof chain === "string" ? chain : null);
    } catch (cause) {
      if (epoch.current === requestEpoch) setError(walletError(cause));
    } finally {
      if (epoch.current === requestEpoch) setBusy(false);
    }
  }

  return {
    options,
    provider,
    account,
    chainId,
    busy,
    error,
    discover,
    connect,
    disconnect,
    switchNetwork,
    epoch,
  };
}
