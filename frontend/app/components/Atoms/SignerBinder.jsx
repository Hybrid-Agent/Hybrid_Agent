"use client";

import { useEffect, useRef } from "react";
import { useSigners, useWallets, usePrivy } from "@privy-io/react-auth";

// The server-side authorization key quorum created in the Privy Dashboard
// (Wallet infrastructure -> Keys and quorums). This is the signer the backend
// uses to relay escrow transactions on the user's embedded wallet. It must be
// attached to each wallet via Privy's signers flow so the backend's signed
// requests are accepted (otherwise Privy returns 401).
const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID?.trim();

export default function SignerBinder() {
  const { addSigners } = useSigners();
  const { wallets } = useWallets();
  const { authenticated, ready } = usePrivy();
  const done = useRef(new Set());

  useEffect(() => {
    if (!ready || !authenticated || !SIGNER_ID) return;
    const privyWallet = (wallets || []).find(
      (w) => w.walletClientType === "privy"
    );
    if (!privyWallet) return;

    const address = privyWallet.address.toLowerCase();
    if (done.current.has(address)) return;

    done.current.add(address);
    addSigners({
      address,
      signers: [{ signerId: SIGNER_ID }],
    }).catch((err) => {
      console.warn("[SignerBinder] addSigners failed:", err?.message || err);
      done.current.delete(address); // allow retry on next run
    });
  }, [ready, authenticated, wallets, addSigners]);

  return null;
}
