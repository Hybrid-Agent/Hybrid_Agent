'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiMail, FiPhone, FiEdit, FiX, FiList, FiBarChart2, FiDollarSign, FiCalendar,
  FiCopy, FiCheck, FiShield, FiAward, FiTwitter, FiLinkedin, FiFacebook,
  FiCreditCard, FiActivity, FiSettings, FiLogOut, FiExternalLink, FiCamera,
  FiSend, FiZap,
} from 'react-icons/fi';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAuth } from '../components/Atoms/AuthProvider';
import { useNotifications } from '../components/Atoms/NotificationProvider';
import { Spinner, Skeleton, PageLoader } from '../components/Atoms/Loaders';
import PaymentActivity from '../components/Molecules/PaymentActivity';
import { api } from '@/lib/api';
import { withdrawUsdc, pickEmbeddedWallet, getUsdcBalance, clearChainConfigCache } from '@/lib/wallet';
import { shortAddress, formatUsdc, tierInfo, TIERS } from '@/lib/format';

const StatCard = ({ icon: Icon, label, value, loading }) => (
  <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl flex flex-col items-center gap-1 text-center">
    <Icon size={18} className="text-teal-500 mb-1" />
    {loading ? (
      <Skeleton className="h-7 w-12 my-0.5" />
    ) : (
      <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">{value}</p>
    )}
    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
  </div>
);

const StateBadge = ({ state }) => {
  const map = {
    completed: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
    funded: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
    created: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300',
    disputed: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
    cancelled: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
    refunded: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  };
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${map[state] || map.created}`}>{state}</span>;
};

const ProfilePage = () => {
  const router = useRouter();
  const { user, loading, logout, verifyKyc, setUser } = useAuth();
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const notifications = useNotifications();

  const [tab, setTab] = useState('overview');
  const [dataLoading, setDataLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [deals, setDeals] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [socials, setSocials] = useState({ twitter: '', linkedin: '', facebook: '' });
  const [onChainBalance, setOnChainBalance] = useState(null);
  const [onChainLoading, setOnChainLoading] = useState(false);
  const [resendingNoticeId, setResendingNoticeId] = useState(null);
  const [stellarOpen, setStellarOpen] = useState(false);
  const [stellarTo, setStellarTo] = useState('');
  const [stellarAsset, setStellarAsset] = useState('usdc');
  const [stellarAmount, setStellarAmount] = useState('');
  const [stellarSubmitting, setStellarSubmitting] = useState(false);
  const [stellarActivating, setStellarActivating] = useState(false);

  // On-chain native ETH balances (fetched via raw RPC to avoid ethers provider timeouts)
  const [ethSepoliaEth, setEthSepoliaEth] = useState(null);
  const [baseSepoliaEth, setBaseSepoliaEth] = useState(null);
  const [baseSepoliaUsdc, setBaseSepoliaUsdc] = useState(null);
  const [chainBalLoading, setChainBalLoading] = useState(false);

  const wallet = user?.wallet_address?.toLowerCase();
  const tier = tierInfo(user);

  useEffect(() => {
    if (!loading && !user) router.push('/Login');
  }, [loading, user, router]);

  // Local-only social links (backend has no socials field yet).
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`profile-extras:${user.id}`);
      if (raw) setSocials(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const fetchOnChainBalance = useCallback(async () => {
    if (!wallet) return;
    setOnChainLoading(true);
    setChainBalLoading(true);
    try {
      // Ethereum Sepolia USDC via ethers provider (works — Alchemy has CORS)
      clearChainConfigCache();
      const { formatted } = await getUsdcBalance(wallet);
      setOnChainBalance(parseFloat(formatted).toFixed(2));
    } catch {
      setOnChainBalance(null);
    }
    // Base / ETH native balances come from walletInfo.chains (backend-fetched, no CORS)
    setOnChainLoading(false);
    setChainBalLoading(false);
  }, [wallet]);

  const loadData = useCallback(async () => {
    if (!wallet) return;
    setDataLoading(true);
    try {
      const [allListings, asAgent, asSeller, asBuyer] = await Promise.all([
        api.listings(),
        api.deals(`?agent=${wallet}`),
        api.deals(`?seller=${wallet}`),
        api.deals(`?buyer=${wallet}`),
      ]);
      setListings(allListings.filter((l) => l.owner_address === wallet || l.agent_address === wallet));
      const merged = new Map();
      [...asAgent, ...asSeller, ...asBuyer].forEach((d) => merged.set(d.deal_id, d));
      setDeals([...merged.values()].sort((a, b) => b.deal_id - a.deal_id));
      try {
        const wi = await api.wallet();
        setWalletInfo(wi);
        if (wi?.chains) {
          setEthSepoliaEth(wi.chains.ethSepolia?.eth ?? null);
          setBaseSepoliaEth(wi.chains.baseSepolia?.eth ?? null);
          setBaseSepoliaUsdc(wi.chains.baseSepolia?.usdc ?? null);
        }
      } catch { /* ignore */ }
    } catch {
      // Backend offline or no data yet — keep empty states.
      setListings([]);
      setDeals([]);
    } finally {
      setDataLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet) {
      loadData();
      fetchOnChainBalance();
    }
  }, [wallet, loadData, fetchOnChainBalance]);

  if (loading || !user) return <div className="min-h-screen bg-white dark:bg-black pt-24"><PageLoader label="Loading your profile" /></div>;

  const commissionEarned = deals
    .filter((d) => d.agent_address === wallet && d.state === 'completed')
    .reduce((sum, d) => sum + (BigInt(d.price) * BigInt(d.commission_bps)) / 10000n, 0n);
  const salesClosed = deals.filter((d) => d.state === 'completed' && (d.seller_address === wallet || d.agent_address === wallet)).length;

  const copyWallet = async () => {
    try {
      await navigator.clipboard.writeText(user.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifications.error('Copy failed', 'Could not access clipboard.');
    }
  };

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      notifications.error('Image too large', 'Profile picture must be under 1MB.');
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const { user: updated } = await api.updateAvatar(fd);
      setUser(updated);
      notifications.success('Photo updated', 'Your profile picture was changed.');
    } catch (err) {
      notifications.error('Upload failed', err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    // Signing happens in the user's own Privy wallet — they must be signed in.
    if (!authenticated) {
      notifications.info('Sign in to your wallet', 'Connect with the email on your account to authorize the withdrawal.');
      login();
      return;
    }
    const embedded = pickEmbeddedWallet(wallets, user?.wallet_address);
    if (!embedded) {
      notifications.error('Wallet unavailable', 'Could not open your embedded wallet. Try reconnecting.');
      return;
    }
    setWithdrawing(true);
    try {
      const dest = withdrawTo.trim() || embedded.address;
      const receipt = await withdrawUsdc(embedded, dest); // full USDC balance
      notifications.success('Withdrawal sent', `USDC transfer confirmed (tx ${receipt.hash.slice(0, 10)}…).`);
      setWithdrawOpen(false);
      setWithdrawTo('');
      try { setWalletInfo(await api.wallet()); } catch { /* ignore */ }
    } catch (err) {
      notifications.error('Withdrawal failed', err?.shortMessage || err?.message || 'Transaction was rejected.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleStellarActivate = async () => {
    setStellarActivating(true);
    try {
      const res = await api.activateStellar();
      notifications.success('Stellar wallet activated', `XLM + USDC trustline ready on ${res.address.slice(0, 10)}…`);
      setWalletInfo(await api.wallet().catch(() => walletInfo));
    } catch (err) {
      notifications.error('Stellar activation failed', err?.message || 'Could not fund the Stellar account (testnet faucet may be unreachable).');
    } finally {
      setStellarActivating(false);
    }
  };

  const handleStellarWithdraw = async (e) => {
    e.preventDefault();
    if (!stellarTo.trim()) {
      notifications.error('Destination required', 'Enter a Stellar address (G…) to withdraw to.');
      return;
    }
    setStellarSubmitting(true);
    try {
      const res = await api.withdrawStellar({
        asset: stellarAsset,
        to: stellarTo.trim(),
        amount: stellarAmount.trim() || undefined,
      });
      notifications.success('Stellar withdrawal sent', `${res.asset.toUpperCase()} → ${res.hash.slice(0, 12)}…`);
      setStellarOpen(false);
      setStellarTo('');
      setStellarAmount('');
      setWalletInfo(await api.wallet().catch(() => walletInfo));
    } catch (err) {
      notifications.error('Stellar withdrawal failed', err?.message || 'The transfer was rejected.');
    } finally {
      setStellarSubmitting(false);
    }
  };

  const copyStellar = async (addr) => {
    try {
      await navigator.clipboard.writeText(addr);
      notifications.flash('info', 'Copied', 'Stellar address copied.');
    } catch {
      /* ignore */
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await verifyKyc();
      notifications.success('Identity verified', 'You can now list and transact. Verified badge unlocked.');
    } catch (err) {
      notifications.error('Verification failed', err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    logout();
    notifications.flash('info', 'Signed out', 'See you soon.');
    router.push('/');
  };

  const saveSocials = (e) => {
    e.preventDefault();
    localStorage.setItem(`profile-extras:${user.id}`, JSON.stringify(socials));
    setEditOpen(false);
    notifications.success('Profile updated', 'Your links were saved.');
  };

  const handleResendNotice = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setResendingNoticeId(id);
    try {
      await api.resendOwnerNotice(id);
      notifications.success('Reminder sent', 'The owner has been notified again via email.');
    } catch (err) {
      notifications.error('Failed to send reminder', err.message);
    } finally {
      setResendingNoticeId(null);
    }
  };

  const memberSince = user.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear();
  const tabs = [
    { id: 'overview', label: 'Overview', icon: FiAward },
    { id: 'listings', label: 'Listings', icon: FiList },
    { id: 'activity', label: 'Activity', icon: FiActivity },
    { id: 'settings', label: 'Settings', icon: FiSettings },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white transition-colors duration-300 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto animate-fade-up">

        {/* Header */}
        <div className="bg-gray-50 dark:bg-white/5 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-800 md:flex gap-7 items-center mb-6">
          <div className="relative flex-shrink-0 mb-5 md:mb-0 mx-auto md:mx-0 w-fit">
            <label className="relative block w-28 h-28 cursor-pointer group" title="Change photo (max 1MB)">
              <img src={user.avatar} alt={user.full_name} className="w-28 h-28 rounded-full border-4 border-teal-500 bg-teal-100 object-cover" />
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                {uploadingAvatar ? <Spinner size={20} className="text-white" /> : <FiCamera className="text-white" size={22} />}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={uploadingAvatar} />
            </label>
            {tier.level === 2 && (
              <span className="absolute -bottom-1 -right-1 bg-teal-600 text-white rounded-full p-1.5 border-2 border-white dark:border-black z-10" title="Verified">
                <FiCheck size={14} />
              </span>
            )}
          </div>
          <div className="flex-grow">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold">{user.full_name}</h1>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    tier.level === 2 ? 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300'
                    : tier.level === 1 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-gray-100 dark:bg-white/10 text-gray-500'
                  }`}>
                    <FiShield size={11} /> Tier {tier.level} · {tier.label}
                  </span>
                </div>
                <p className="text-teal-600 dark:text-teal-400 text-sm mt-1">@{user.user_name} · <span className="capitalize">{user.user_type}</span></p>
              </div>
              <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-teal-500 px-3 py-1.5 rounded-lg transition-colors">
                <FiEdit size={13} /> Edit links
              </button>
            </div>
            {user.bio && <p className="text-gray-600 dark:text-gray-300 text-sm mt-3">{user.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-gray-500 dark:text-gray-400 text-sm">
              {user.email && <span className="flex items-center gap-1.5"><FiMail size={13} />{user.email}</span>}
              {user.phone_number && <span className="flex items-center gap-1.5"><FiPhone size={13} />{user.phone_number}</span>}
            </div>
            {(socials.twitter || socials.linkedin || socials.facebook) && (
              <div className="mt-3 flex items-center gap-4">
                {socials.twitter && <a href={socials.twitter} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-teal-500"><FiTwitter size={18} /></a>}
                {socials.linkedin && <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-teal-500"><FiLinkedin size={18} /></a>}
                {socials.facebook && <a href={socials.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-teal-500"><FiFacebook size={18} /></a>}
              </div>
            )}
          </div>
        </div>

        {/* Verification / wallet card */}
        <div className="bg-teal-50 dark:bg-[#121212]/15 border border-teal-100 dark:border-teal-900/40 rounded-3xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center justify-between">
            {/* Tier progress */}
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FiAward className="text-teal-500" /> Verification status
              </h3>
              <div className="flex items-center">
                {TIERS.map((t, i) => (
                  <React.Fragment key={t.level}>
                    <div className="flex flex-col items-center text-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        tier.level >= t.level ? 'bg-teal-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-400'
                      }`}>
                        {tier.level > t.level ? <FiCheck size={14} /> : t.level + 1}
                      </div>
                      <span className={`text-[10px] mt-1 font-medium ${tier.level >= t.level ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>{t.label}</span>
                    </div>
                    {i < TIERS.length - 1 && (
                      <div className="flex-1 h-0.5 mx-1 -mt-4 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full bg-teal-600 transition-all duration-700 ${tier.level > t.level ? 'w-full' : 'w-0'}`} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Wallet + KYC action */}
            <div className="flex flex-col sm:flex-row gap-3 lg:border-l lg:border-teal-100 dark:lg:border-teal-900/40 lg:pl-6">
              <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1"><FiCreditCard size={11} /> Wallet</p>
                <button onClick={copyWallet} className="flex items-center gap-2 mt-0.5 text-sm font-mono font-semibold text-gray-900 dark:text-white hover:text-teal-600">
                  {shortAddress(user.wallet_address)}
                  {copied ? <FiCheck size={13} className="text-teal-500" /> : <FiCopy size={13} className="text-gray-400" />}
                </button>
              </div>
              {tier.level < 2 ? (
                <button onClick={handleVerify} disabled={verifying} className="flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white text-sm font-semibold px-5 rounded-xl py-2.5 disabled:opacity-70 transition-colors">
                  {verifying ? <Spinner size={16} /> : <><FiShield size={15} /> Verify identity</>}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm font-semibold px-4">
                  <FiCheck size={16} /> Verified
                </div>
              )}
            </div>
          </div>
          {tier.level < 2 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Verify your identity to list assets, earn commission, and unlock the Verified badge.
            </p>
          )}
        </div>

        <PaymentActivity />

        {/* Unified Payment Wallets Card */}
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 border border-gray-700/50 text-white rounded-3xl p-6 sm:p-8 mb-6 shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2 mb-5 uppercase tracking-wider">
              <FiCreditCard size={16} /> Payment Wallets
            </h3>

            {/* USDC Rails */}
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Stablecoin (USDC)</p>
            <div className="space-y-2 mb-5">
              {[
                { label: 'ETH Sepolia', color: 'bg-blue-400', badge: 'EVM',     addr: user.wallet_address, copy: copyWallet, bal: onChainBalance !== null ? onChainBalance : (walletInfo ? walletInfo.balanceUsdc : '0.00'), balLabel: 'USDC', loading: onChainLoading },
                { label: 'Base Sepolia', color: 'bg-blue-500', badge: 'EVM',    addr: user.wallet_address, copy: copyWallet, bal: baseSepoliaUsdc !== null ? baseSepoliaUsdc : '—', balLabel: 'USDC', loading: chainBalLoading },
                { label: 'Stellar',     color: 'bg-purple-400', badge: 'Soroban', addr: walletInfo?.stellar?.address, copy: () => copyStellar(walletInfo?.stellar?.address), bal: walletInfo?.stellar?.usdcDisplay || '—', balLabel: 'USDC' },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                  <span className={`w-2 h-2 rounded-full ${r.color} flex-shrink-0`}></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-200">{r.label}</span>
                      <span className="text-[9px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded font-medium">{r.badge}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-gray-500 truncate">{r.addr ? shortAddress(r.addr, 18) : '—'}</span>
                      {r.addr && (
                        <button onClick={r.copy} className="text-gray-500 hover:text-teal-400 transition-colors flex-shrink-0" title="Copy address">
                          {copied && r.copy === copyWallet ? <FiCheck size={11} className="text-teal-400" /> : <FiCopy size={11} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.loading ? <Skeleton className="h-4 w-12 bg-white/10" /> : (
                      <p className="text-sm font-extrabold">{r.bal} <span className="text-[10px] font-medium text-gray-500">{r.balLabel}</span></p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Native / Gas Rails */}
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Native (Gas)</p>
            <div className="space-y-2 mb-5">
              {[
                { label: 'ETH Sepolia', color: 'bg-blue-400', addr: user.wallet_address, copy: copyWallet, bal: ethSepoliaEth !== null ? ethSepoliaEth : '—', balLabel: 'ETH', loading: chainBalLoading },
                { label: 'Base Sepolia', color: 'bg-blue-500', addr: user.wallet_address, copy: copyWallet, bal: baseSepoliaEth !== null ? baseSepoliaEth : '—', balLabel: 'ETH', loading: chainBalLoading },
                { label: 'Stellar',     color: 'bg-purple-400', addr: walletInfo?.stellar?.address, copy: () => copyStellar(walletInfo?.stellar?.address), bal: walletInfo?.stellar?.xlm != null ? Number(walletInfo.stellar.xlm).toFixed(2) : '—', balLabel: 'XLM' },
              ].map((r) => (
                <div key={r.label + r.balLabel} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                  <span className={`w-2 h-2 rounded-full ${r.color} flex-shrink-0`}></span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-gray-200">{r.label}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-gray-500 truncate">{r.addr ? shortAddress(r.addr, 18) : '—'}</span>
                      {r.addr && (
                        <button onClick={r.copy} className="text-gray-500 hover:text-teal-400 transition-colors flex-shrink-0" title="Copy address">
                          <FiCopy size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.loading ? <Skeleton className="h-4 w-12 bg-white/10" /> : (
                      <p className="text-sm font-extrabold">{r.bal} <span className="text-[10px] font-medium text-gray-500">{r.balLabel}</span></p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Stellar activation */}
            {!walletInfo?.stellar?.active && walletInfo?.stellar?.funded === false && (
              <p className="text-[10px] text-amber-300/80 mb-3">Stellar wallet not yet funded — activate below to enable Stellar payments</p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {!walletInfo?.stellar?.active && (
                <button
                  onClick={handleStellarActivate}
                  disabled={stellarActivating || !walletInfo?.stellar?.configured}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {stellarActivating ? <><Spinner size={15} /> Activating…</> : <><FiZap size={14} /> Activate Stellar</>}
                </button>
              )}
              {walletInfo?.stellar?.active && (
                <button
                  onClick={() => setStellarOpen(true)}
                  className="flex items-center gap-2 bg-white/10 hover:bg-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                >
                  <FiSend size={14} /> Withdraw Stellar
                </button>
              )}
              <button onClick={fetchOnChainBalance} disabled={onChainLoading} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50">
                {onChainLoading ? <><Spinner size={12} /> Refreshing</> : '↻ Refresh balances'}
              </button>
            </div>
          </div>
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-purple-500/10 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 bg-blue-500/10 blur-3xl rounded-full pointer-events-none"></div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={FiList} label="Listings" value={listings.length} loading={dataLoading} />
          <StatCard icon={FiBarChart2} label="Sales Closed" value={salesClosed} loading={dataLoading} />
          <StatCard icon={FiDollarSign} label="Commission (USDC)" value={formatUsdc(commissionEarned)} loading={dataLoading} />
          <StatCard icon={FiCalendar} label="Member Since" value={memberSince} loading={false} />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl w-full sm:w-fit mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-white dark:bg-white/15 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="animate-fade-in">
          {tab === 'overview' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <h3 className="font-bold mb-2 flex items-center gap-2"><FiActivity className="text-teal-500" size={18} /> Recent activity</h3>
                {dataLoading ? <Skeleton className="h-16 w-full" /> : deals.length === 0 ? (
                  <p className="text-sm text-gray-400">No on-chain deals yet. They'll appear here once you transact.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {deals.slice(0, 3).map((d) => (
                      <li key={d.deal_id} className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300">Deal #{d.deal_id}</span>
                        <StateBadge state={d.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <h3 className="font-bold mb-2 flex items-center gap-2"><FiShield className="text-teal-500" size={18} /> Account</h3>
                <ul className="text-sm space-y-1.5 text-gray-600 dark:text-gray-300">
                  <li className="flex justify-between"><span>Role</span><span className="capitalize font-medium">{user.user_type}</span></li>
                  <li className="flex justify-between"><span>KYC</span><span className="capitalize font-medium">{user.kyc_status}</span></li>
                  <li className="flex justify-between"><span>Wallet</span><span className="font-mono">{shortAddress(user.wallet_address)}</span></li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'listings' && (
            dataLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
              </div>
            ) : listings.length > 0 ? (
              <div>
                <div className="flex justify-end mb-4">
                  <Link href="/Dashboard" className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors">
                    Add Listing <FiExternalLink size={14} />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {listings.map((l) => (
                    <Link key={l.id} href={`/Listings/${l.id}`} className="bg-white dark:bg-white/5 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 hover:border-teal-500 transition-all group block">
                      {l.image && <img src={l.image} alt={l.title} className="w-full h-40 object-cover group-hover:opacity-90 transition-opacity" />}
                      <div className="p-4">
                        <h3 className="font-bold text-sm truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{l.title}</h3>
                        <p className="text-teal-600 dark:text-teal-400 text-sm font-semibold mt-1">{l.price_usdc} USDC</p>
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                          <span className="text-xs text-gray-400 capitalize">{l.listing_type.replace('_', '-')} · {l.status}</span>
                          {l.listing_type === 'agent_brokered' && (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                l.owner_status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' :
                                (l.owner_status === 'pending_verification' || l.owner_status === 'pending') ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' :
                                'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                              }`}>
                                {l.owner_status === 'approved' ? 'Owner Approved' : 'Pending Owner'}
                              </span>
                              {(l.owner_status === 'pending_verification' || l.owner_status === 'pending') && (
                                <button
                                  onClick={(e) => handleResendNotice(e, l.id)}
                                  disabled={resendingNoticeId === l.id}
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-500/40 transition-colors disabled:opacity-50"
                                >
                                  {resendingNoticeId === l.id ? 'Sending...' : 'Remind'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="No listings yet" body="Create a listing to start selling on-chain." cta />
            )
          )}

          {tab === 'activity' && (
            dataLoading ? <Skeleton className="h-40 w-full" /> : deals.length > 0 ? (
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl divide-y divide-gray-100 dark:divide-gray-800/60">
                {deals.map((d) => {
                  const role = d.agent_address === wallet ? 'Agent' : d.seller_address === wallet ? 'Seller' : 'Buyer';
                  return (
                    <div key={d.deal_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-semibold whitespace-nowrap">#{d.deal_id}</span>
                        <span className="text-gray-500 dark:text-gray-400">{role}</span>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-6 ml-auto">
                        <span className="font-mono whitespace-nowrap">{formatUsdc(d.price)} USDC</span>
                        <StateBadge state={d.state} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No deals yet" body="Your escrow deals (as buyer, seller, or agent) will show up here." />
            )
          )}

          {tab === 'settings' && (
            <div className="space-y-4 max-w-xl">
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <h3 className="font-bold mb-1">Your payout wallet</h3>
                <p className="text-xs text-gray-400 mb-4">Commissions (as an agent) and sale proceeds (selling your own) are paid here in USDC. Withdraw anytime.</p>

                {/* Balance */}
                <div className="bg-teal-600 text-white rounded-2xl p-5 mb-3">
                  <p className="text-xs text-teal-100 mb-1">Available to withdraw</p>
                  <p className="text-3xl font-extrabold">{walletInfo ? walletInfo.balanceUsdc : '0.00'} <span className="text-lg font-semibold text-teal-100">USDC</span></p>
                </div>

                {/* Address */}
                <div className="flex items-center justify-between gap-3 bg-white dark:bg-black/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
                  <span className="font-mono text-sm break-all">{user.wallet_address}</span>
                  <button onClick={copyWallet} className="text-gray-400 hover:text-teal-500 flex-shrink-0">{copied ? <FiCheck size={16} className="text-teal-500" /> : <FiCopy size={16} />}</button>
                </div>

                <button
                  onClick={() => setWithdrawOpen(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  <FiDollarSign size={15} /> Withdraw
                </button>
                <p className="text-[11px] text-gray-400 mt-2">Reserved from your email — you can self-custody it via an email magic-link.</p>
              </div>
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <h3 className="font-bold mb-3">Social links</h3>
                <button onClick={() => setEditOpen(true)} className="text-sm text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1.5"><FiEdit size={14} /> Edit links</button>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-500 border border-red-300 dark:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl py-3 font-semibold text-sm transition-colors">
                <FiLogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit social modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setEditOpen(false)}>
          <div className="bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md backdrop-blur-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-teal-600 dark:text-teal-400">Edit social links</h3>
              <button onClick={() => setEditOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><FiX size={22} /></button>
            </div>
            <form onSubmit={saveSocials} className="p-5 space-y-4">
              {[
                { name: 'twitter', icon: <FiTwitter />, ph: 'https://twitter.com/username' },
                { name: 'linkedin', icon: <FiLinkedin />, ph: 'https://linkedin.com/in/username' },
                { name: 'facebook', icon: <FiFacebook />, ph: 'https://facebook.com/username' },
              ].map(({ name, icon, ph }) => (
                <div key={name}>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 capitalize">{name}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400 text-sm">{icon}</span>
                    <input type="url" value={socials[name]} onChange={(e) => setSocials((p) => ({ ...p, [name]: e.target.value }))} placeholder={ph}
                      className="w-full pl-10 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-semibold">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw modal */}
      {withdrawOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setWithdrawOpen(false)}>
          <div className="bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md backdrop-blur-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold">Withdraw USDC</h3>
              <button onClick={() => setWithdrawOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><FiX size={22} /></button>
            </div>
            <form onSubmit={handleWithdraw} className="p-5 space-y-4">
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-sm flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Available</span>
                <span className="font-bold">{walletInfo ? walletInfo.balanceUsdc : '0.00'} USDC</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Destination <span className="text-gray-400">(optional — defaults to your wallet)</span></label>
                <input value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} placeholder="0x external wallet" className="w-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <button type="submit" disabled={withdrawing} className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
                {withdrawing ? <Spinner size={18} /> : 'Withdraw funds'}
              </button>
              <p className="text-[11px] text-center text-gray-400">On-chain transfer executes via your email wallet once escrow contracts are live.</p>
            </form>
          </div>
        </div>
      )}
    {/* Stellar withdraw modal */}
      {stellarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setStellarOpen(false)}>
          <div className="bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md backdrop-blur-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold">Withdraw from Stellar</h3>
              <button onClick={() => setStellarOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><FiX size={22} /></button>
            </div>
            <form onSubmit={handleStellarWithdraw} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(['usdc', 'xlm']).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setStellarAsset(a)}
                    className={`rounded-xl py-2 text-sm font-semibold border transition-colors ${
                      stellarAsset === a
                        ? 'bg-teal-700 text-white border-teal-600'
                        : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {a === 'usdc' ? 'USDC' : 'XLM'}
                    {a === 'usdc' && <span className="hidden"> (Stellar)</span>}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Destination <span className="text-gray-400">(Stellar address)</span></label>
                <input value={stellarTo} onChange={(e) => setStellarTo(e.target.value)} placeholder="G… Stellar address" className="w-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Amount <span className="text-gray-400">(optional — defaults to full balance)</span></label>
                <input value={stellarAmount} onChange={(e) => setStellarAmount(e.target.value)} placeholder={stellarAsset === 'xlm' ? 'e.g. 25.5 XLM' : 'e.g. 100 USDC'} className="w-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <button type="submit" disabled={stellarSubmitting} className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
                {stellarSubmitting ? <><Spinner size={18} /> Sending…</> : `Withdraw ${stellarAsset === 'xlm' ? 'XLM' : 'USDC'}`}
              </button>
              <p className="text-[11px] text-center text-gray-400">On-chain on Stellar testnet via your deterministic wallet.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ title, body, cta }) => (
  <div className="text-center py-16 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-gray-800">
    <p className="font-semibold text-gray-700 dark:text-gray-200">{title}</p>
    <p className="text-sm text-gray-400 mt-1 mb-4">{body}</p>
    {cta && <Link href="/Listings" className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-colors">Browse listings <FiExternalLink size={14} /></Link>}
  </div>
);

export default ProfilePage;
