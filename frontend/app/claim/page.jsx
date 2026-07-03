'use client';

import React, { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  FiMail, FiShield, FiCheckCircle, FiCopy, FiCheck, FiArrowRight, FiHome,
  FiTruck, FiLock, FiClock, FiAlertTriangle, FiExternalLink, FiThumbsUp,
  FiDollarSign, FiList, FiInfo,
} from 'react-icons/fi';
import { PageLoader, Spinner } from '../components/Atoms/Loaders';
import { useNotifications } from '../components/Atoms/NotificationProvider';
import { api } from '@/lib/api';
import { getUsdcBalance, withdrawUsdc, pickEmbeddedWallet } from '@/lib/wallet';

const EXPLORER_TX = 'https://sepolia.etherscan.io/tx/';

/* ─────────────────────────────────────────────────────────── helpers ── */
function Brand() {
  return (
    <div className="text-center mb-6">
      <Link href="/" className="text-2xl font-extrabold tracking-tight">
        <b className="text-teal-600">HYBRID</b>
        <span className="text-gray-900 dark:text-white">AGENT</span>
      </Link>
    </div>
  );
}

function AssetHeader({ claim }) {
  const Icon = claim.assetType === 'vehicle' ? FiTruck : FiHome;
  return (
    <div className="flex items-center gap-4 p-5 border-b border-gray-100 dark:border-gray-800">
      {claim.image ? (
        <img src={claim.image} alt={claim.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
          <Icon className="text-teal-500" size={24} />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-bold truncate text-gray-900 dark:text-white">{claim.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Listed by {claim.agentName}</p>
        <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
          claim.settled
            ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
            : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
        }`}>
          {claim.settled ? <><FiCheckCircle size={11} /> Sale completed</> : <><FiClock size={11} /> Sale in progress</>}
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────── APPROVE FLOW ── */
function ApproveView({ claim, listingId }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const notifications = useNotifications();

  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(
    claim.ownerStatus === 'approved' || claim.ownerStatus === 'confirmed'
  );

  const wallet = useMemo(() => pickEmbeddedWallet(wallets, claim?.ownerWallet), [wallets, claim]);
  const mismatch = Boolean(
    authenticated && wallet && claim?.ownerWallet &&
    wallet.address.toLowerCase() !== claim.ownerWallet.toLowerCase()
  );
  const signedIn = authenticated && wallet && !mismatch;

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.approveClaim(listingId);
      setApproved(true);
      notifications.success('Listing approved!', 'You have confirmed this listing. The agent can now proceed.');
    } catch (err) {
      notifications.error('Approval failed', err?.message || 'Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const commissionPct = claim.commissionBps ? (claim.commissionBps / 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white flex items-center justify-center px-4 py-24 transition-colors">
      <div className="w-full max-w-md animate-fade-up">
        <Brand />

        {/* Intent banner */}
        <div className="mb-4 flex items-start gap-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4">
          <FiList className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-blue-800 dark:text-blue-200">Listing approval request</p>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
              An agent has listed your asset. Review it and confirm below.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden">
          <AssetHeader claim={claim} />

          {/* Deal breakdown */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Deal summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Sale price</span>
              <span className="font-semibold">{Number(claim.totalPriceUsdc).toLocaleString()} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Agent commission ({commissionPct}%)</span>
              <span className="text-orange-500 font-semibold">−{claim.commissionUsdc} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Platform fee (1%)</span>
              <span className="text-orange-500 font-semibold">−{(Number(claim.totalPriceUsdc) * 0.01).toLocaleString()} USDC</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-100 dark:border-gray-800">
              <span>Your payout</span>
              <span className="text-teal-600 dark:text-teal-400 text-base">{claim.payoutUsdc} USDC</span>
            </div>
          </div>

          <div className="p-6">
            {approved ? (
              /* ── Already approved ── */
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                  <FiCheckCircle className="text-green-500" size={28} />
                </div>
                <h2 className="text-lg font-bold mb-1">Listing approved!</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  You've confirmed this listing. The agent can now proceed with the sale.
                  You'll receive another email when your funds are ready to withdraw.
                </p>
              </div>
            ) : !signedIn ? (
              /* ── Sign in to approve ── */
              <div>
                <h1 className="text-xl font-bold mb-1">Review & approve</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                  Sign in with <strong>{claim.ownerEmail}</strong> to confirm you authorised{' '}
                  <strong>{claim.agentName}</strong> to list this asset on your behalf.
                </p>

                {mismatch && (
                  <div className="mb-4 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
                    <FiAlertTriangle className="mt-0.5 flex-shrink-0" size={14} />
                    <span>You're signed in with the wrong account. Log out and sign in with {claim.ownerEmail}.</span>
                  </div>
                )}

                <button
                  onClick={login}
                  disabled={!ready}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors"
                >
                  {!ready ? <Spinner size={18} /> : <><FiMail size={16} /> Sign in to review <FiArrowRight size={16} /></>}
                </button>

                {mismatch && (
                  <button onClick={logout} className="w-full mt-2 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    Log out
                  </button>
                )}

                <div className="flex items-center gap-2 mt-5 text-[11px] text-gray-400">
                  <FiShield size={12} className="text-blue-500" />
                  Only {claim.ownerEmail} can approve this listing.
                </div>
              </div>
            ) : (
              /* ── Signed in: show approve button ── */
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-semibold">
                    <FiCheckCircle size={16} /> Signed in
                  </span>
                  <button onClick={logout} className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    Log out
                  </button>
                </div>

                <div className="mb-5 flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-xl p-3">
                  <FiInfo className="flex-shrink-0 mt-0.5" size={13} />
                  <span>
                    By approving, you confirm that <strong>{claim.agentName}</strong> is authorised to sell{' '}
                    <strong>"{claim.title}"</strong> on your behalf and that you agree to the commission rate above.
                  </span>
                </div>

                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {approving ? <Spinner size={18} /> : <><FiThumbsUp size={15} /> Approve this listing</>}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Secured by HybridAgent · your payout is reserved and paid directly to your wallet
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────── WITHDRAW FLOW ── */
function WithdrawView({ claim, listingId }) {
  const notifications = useNotifications();
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const [withdrawTo, setWithdrawTo] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const wallet = useMemo(() => pickEmbeddedWallet(wallets, claim?.ownerWallet), [wallets, claim]);
  const mismatch = Boolean(
    authenticated && wallet && claim?.ownerWallet &&
    wallet.address.toLowerCase() !== claim.ownerWallet.toLowerCase()
  );
  const signedIn = authenticated && wallet && !mismatch;

  const refreshBalance = useCallback(async () => {
    if (!wallet?.address) return;
    setBalLoading(true);
    try { setBalance(await getUsdcBalance(wallet.address)); }
    catch { /* leave previous */ }
    finally { setBalLoading(false); }
  }, [wallet]);

  useEffect(() => { if (signedIn) refreshBalance(); }, [signedIn, refreshBalance]);

  const copyWallet = async () => {
    try {
      await navigator.clipboard.writeText(claim.ownerWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const withdraw = async (e) => {
    e.preventDefault();
    if (!wallet) return;
    setWithdrawing(true);
    setTxHash(null);
    try {
      const dest = withdrawTo.trim() || wallet.address;
      const receipt = await withdrawUsdc(wallet, dest);
      setTxHash(receipt.hash);
      notifications.success('Withdrawal sent', 'Your USDC transfer is confirmed on-chain.');
      await refreshBalance();
    } catch (err) {
      notifications.error('Withdrawal failed', err?.shortMessage || err?.message || 'Transaction was rejected.');
    } finally {
      setWithdrawing(false);
    }
  };

  const short = claim.ownerWallet ? `${claim.ownerWallet.slice(0, 8)}…${claim.ownerWallet.slice(-6)}` : '';
  const hasFunds = balance && balance.raw > 0n;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white flex items-center justify-center px-4 py-24 transition-colors">
      <div className="w-full max-w-md animate-fade-up">
        <Brand />

        {/* Intent banner */}
        <div className="mb-4 flex items-start gap-3 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 rounded-2xl p-4">
          <FiDollarSign className="text-teal-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-teal-800 dark:text-teal-200">Your sale proceeds are ready</p>
            <p className="text-xs text-teal-600 dark:text-teal-300 mt-0.5">
              Sign in to access your wallet and withdraw your USDC.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden">
          <AssetHeader claim={claim} />

          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex justify-between text-sm font-bold">
              <span className="text-gray-600 dark:text-gray-400">Your payout</span>
              <span className="text-teal-600 dark:text-teal-400 text-base">{claim.payoutUsdc} USDC</span>
            </div>
          </div>

          {!signedIn ? (
            <div className="p-6">
              <h1 className="text-xl font-bold mb-1">Withdraw your funds</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Sign in with <strong>{claim.ownerEmail}</strong> — we'll open the secure wallet reserved for you
                so you can transfer your USDC.
              </p>

              {mismatch && (
                <div className="mb-4 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
                  <FiAlertTriangle className="mt-0.5 flex-shrink-0" size={14} />
                  <span>Wrong account. Log out and sign in with {claim.ownerEmail} to access your funds.</span>
                </div>
              )}

              <button
                onClick={login}
                disabled={!ready}
                className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors"
              >
                {!ready ? <Spinner size={18} /> : <><FiMail size={16} /> Sign in to withdraw <FiArrowRight size={16} /></>}
              </button>

              {mismatch && (
                <button onClick={logout} className="w-full mt-2 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  Log out
                </button>
              )}

              <div className="flex items-center gap-2 mt-5 text-[11px] text-gray-400">
                <FiShield size={12} className="text-teal-500" />
                Your wallet is reserved for {claim.ownerEmail}. Only this email can access it.
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm font-semibold">
                  <FiCheckCircle size={16} /> Signed in
                </span>
                <button onClick={logout} className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  Log out
                </button>
              </div>

              <div className="bg-teal-600 text-white rounded-2xl p-5 mb-4">
                <p className="text-xs text-teal-100 mb-1">Available to withdraw</p>
                <p className="text-3xl font-extrabold">
                  {balLoading && !balance ? '…' : (balance ? Number(balance.formatted).toLocaleString() : '0')}
                  <span className="text-lg font-semibold text-teal-100"> USDC</span>
                </p>
                <button onClick={copyWallet} className="mt-3 flex items-center gap-2 text-xs font-mono text-teal-50 hover:text-white">
                  {short} {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
                </button>
              </div>

              <form onSubmit={withdraw} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Withdraw to</label>
                  <input
                    value={withdrawTo}
                    onChange={(e) => setWithdrawTo(e.target.value)}
                    placeholder="0x external wallet (optional)"
                    className="w-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Leave blank to keep funds in your reserved wallet.</p>
                </div>
                <button
                  type="submit"
                  disabled={!hasFunds || withdrawing}
                  className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {withdrawing ? <Spinner size={18} /> : <><FiLock size={15} /> {hasFunds ? 'Withdraw funds' : 'No funds to withdraw yet'}</>}
                </button>
              </form>

              {txHash ? (
                <a href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline">
                  View transaction <FiExternalLink size={12} />
                </a>
              ) : !hasFunds ? (
                <p className="text-[11px] text-gray-400 mt-3 text-center">
                  We'll email you the moment the sale completes and your funds land here.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Secured by HybridAgent escrow · funds paid directly to your reserved wallet
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────── ROOT ── */
function ClaimInner() {
  const params = useSearchParams();
  const listingId = params.get('listingId');
  // action=approve  → owner approves the listing (sent from listing-notice email)
  // action=withdraw → owner withdraws funds (sent from claim-ready email)
  // default: withdraw (backwards-compatible for any old links)
  const action = params.get('action') || 'withdraw';

  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!listingId) { setLoading(false); return; }
    api.claim(listingId)
      .then((c) => setClaim(c))
      .catch(() => setClaim(false))
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black pt-24">
        <PageLoader label={action === 'approve' ? 'Loading listing details' : 'Loading your claim'} />
      </div>
    );
  }

  if (!listingId || !claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black text-center px-4">
        <div>
          <p className="text-5xl font-bold text-teal-500 mb-3">404</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-5">This link is invalid or expired.</p>
          <Link href="/" className="text-teal-600 dark:text-teal-400 font-semibold hover:underline">← Back to HybridAgent</Link>
        </div>
      </div>
    );
  }

  if (action === 'approve') {
    return <ApproveView claim={claim} listingId={listingId} />;
  }

  return <WithdrawView claim={claim} listingId={listingId} />;
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-black pt-24"><PageLoader /></div>}>
      <ClaimInner />
    </Suspense>
  );
}
