'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import {
  FiHome, FiTruck, FiDollarSign, FiShield, FiPhone, FiMessageSquare,
  FiShoppingCart, FiX, FiCheck, FiAlertTriangle, FiUser, FiStar,
  FiClock, FiArrowRight, FiExternalLink, FiMail,
} from 'react-icons/fi';
import { useAuth } from '../../components/Atoms/AuthProvider';
import { useNotifications } from '../../components/Atoms/NotificationProvider';
import { PageLoader, Spinner } from '../../components/Atoms/Loaders';
import ChatPanel from '../../components/Molecules/ChatPanel';
import ReviewModal from '../../components/Molecules/ReviewModal';
import { StarRating } from '../../components/Atoms/StarRating';
import { api } from '@/lib/api';
import { formatUsdc, shortAddress } from '@/lib/format';
import { pickEmbeddedWallet, getChainConfig } from '@/lib/wallet';

// Minimal ABI for the buyer's on-chain steps.
const ESCROW_ABI = [
  'function createDeal(address buyer, address seller, address agent, uint256 price, bytes32 listingRef, uint16 commissionBps) returns (uint256)',
  'function fundDeal(uint256 id)',
  'event DealCreated(uint256 indexed id, address indexed buyer, address indexed seller, address agent, uint256 price, uint16 commissionBps, uint16 platformFeeBps, bytes32 listingRef, uint256 mandateId)',
];

// Chain-specific block explorer roots.
const EXPLORERS = {
  sepolia: 'https://sepolia.etherscan.io/tx/',
  base:    'https://sepolia.basescan.org/tx/',
};

const DetailRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 bg-gray-100 dark:bg-white/10 rounded-lg p-3">
    <Icon className="text-teal-600 dark:text-teal-400 flex-shrink-0" size={18} />
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="font-semibold text-gray-900 dark:text-white text-sm capitalize">{value}</div>
    </div>
  </div>
);

const ItemDetailsPage = () => {
  const { id } = useParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const notifications = useNotifications();
  const { wallets } = useWallets();
  const { login: connectPrivy } = usePrivy();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatConv, setChatConv] = useState(null);
  const [opening, setOpening] = useState(false);
  const [quote, setQuote] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState({ summary: null, reviews: [] });

  // Purchase request state
  const [pr, setPr] = useState(undefined); // undefined = not loaded yet
  const [prList, setPrList] = useState([]); // agent sees all requests
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyStep, setBuyStep] = useState(''); // '', 'requesting', 'escrow', 'approving', 'funding', 'done'
  const [fundTx, setFundTx] = useState(null);
  const [fundTxChain, setFundTxChain] = useState('sepolia'); // 'sepolia' | 'base'

  // Payment method: 'evm-usdc' (Ethereum Sepolia) | 'base-usdc' (Base Sepolia) | 'stellar-usdc' | 'stellar-xlm'
  const [payMethod, setPayMethod] = useState('evm-usdc');
  const [stellarQuoteData, setStellarQuoteData] = useState(null);
  const [stellarPaying, setStellarPaying] = useState(false);
  const [stellarResult, setStellarResult] = useState(null);

  const wallet = useMemo(() => pickEmbeddedWallet(wallets), [wallets]);

  const load = useCallback(async () => {
    try { setItem(await api.listing(id)); } catch { setItem(false); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadReviews = useCallback(async (agentId) => {
    try { setReviewData(await api.agentReviews(agentId)); } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (item?.created_by) loadReviews(item.created_by); }, [item?.created_by, loadReviews]);

  // Load the purchase request for this listing once we know the user role.
  const loadPr = useCallback(async () => {
    if (!isLoggedIn || !item) return;
    try {
      const data = await api.getPurchaseRequest(item.id);
      if (Array.isArray(data)) { setPrList(data); setPr(null); }
      else { setPr(data); setPrList([]); }
    } catch { /* not found or unauthenticated */ }
  }, [isLoggedIn, item]);

  useEffect(() => { loadPr(); }, [loadPr]);

  // Refresh purchase request every 10 s to catch when agent creates the deal.
  useEffect(() => {
    if (!isLoggedIn || !item) return;
    const t = setInterval(loadPr, 10_000);
    return () => clearInterval(t);
  }, [isLoggedIn, item, loadPr]);

  const isVehicle = item?.asset_type === 'vehicle';
  // Coerce both to Number — the API may return created_by as a string while
  // user.id is always a number, causing === to silently fail on the frontend
  // even though the backend (two integers) correctly blocks the purchase.
  const isOwnerOfListing = user && item && Number(item.created_by) === Number(user.id);
  // Price in USDC base units (6 dec) as BigInt
  const priceBase = item ? BigInt(Math.round(Number(item.price_usdc) * 1e6)) : 0n;

  // Open the quote modal with breakdown
  const openBuy = async () => {
    if (!isLoggedIn) { notifications.info('Sign in to buy', 'Log in to purchase securely through escrow.'); return router.push('/Login'); }
    if (!user?.wallet_address) { notifications.error('Wallet not set up', 'Go to your Profile and complete wallet setup before buying.'); return router.push('/Profile'); }
    setBuyOpen(true);
    setPayMethod('evm-usdc');
    setStellarQuoteData(null);
    setStellarResult(null);
    try { setQuote(await api.quote(`?price=${priceBase}&commissionBps=${item.commission_bps || 0}&platformFeeBps=100`)); }
    catch { setQuote(null); }
  };

  // Fetch an XLM quote whenever the buyer picks the Stellar XLM option
  // — works both in the initial buy modal AND the "fund escrow" panel.
  useEffect(() => {
    if (payMethod !== 'stellar-xlm') return;
    let cancelled = false;
    setStellarQuoteData(null);
    api.stellarQuote(item?.id)
      .then((q) => { if (!cancelled) setStellarQuoteData(q); })
      .catch(() => { if (!cancelled) setStellarQuoteData(null); });
    return () => { cancelled = true; };
  }, [payMethod, item?.id]);

  // Step (Stellar): buyer pays directly through the Soroban escrow.
  const payStellar = async () => {
    if (!user?.email) { notifications.error('Email needed', 'A verified email is required to derive your Stellar wallet.'); return; }
    setStellarPaying(true);
    try {
      const method = payMethod === 'stellar-xlm' ? 'xlm' : 'usdc';
      const result = await api.payStellar(item.id, method);
      setStellarResult(result);
      notifications.success(`Paid in ${method === 'xlm' ? 'XLM' : 'USDC'} (Stellar)`, `Deal #${result.dealId} funded on the Soroban escrow.`);
      setBuyOpen(false);
      await loadPr();
    } catch (err) {
      notifications.error('Stellar payment failed', err.message);
    } finally {
      setStellarPaying(false);
    }
  };

  // Step 1: buyer submits a purchase request
  const submitRequest = async () => {
    setBuyStep('requesting');
    try {
      const newPr = await api.requestPurchase(item.id);
      setPr(newPr);
      // Open chat so buyer and agent can coordinate
      try {
        const conv = await api.openConversation(item.id);
        setChatConv(conv.id);
      } catch { /* ignore if chat already open */ }
      notifications.success('Purchase requested', 'The agent will set up your escrow deal. Fund it once it is ready.');
      setBuyOpen(false);
    } catch (err) {
      notifications.error('Could not request purchase', err.message);
    } finally {
      setBuyStep('');
    }
  };

  // Step 2 (agent): create the escrow deal on-chain from the agent's Privy wallet
  const createDealOnChain = async (buyerAddress, buyerId) => {
    if (!wallet) { connectPrivy(); return; }
    setBuyStep('escrow');
    try {
      const cfg = await getChainConfig();
      if (!cfg?.contracts?.hybridEscrow) throw new Error('Escrow contract not configured');

      await wallet.switchChain(cfg.chainId);
      const provider = new ethers.BrowserProvider(await wallet.getEthereumProvider());
      const signer = await provider.getSigner();
      const escrow = new ethers.Contract(cfg.contracts.hybridEscrow, ESCROW_ABI, signer);

      const seller = item.owner_address;
      if (!seller) throw new Error('Owner payout address not set. Cannot create deal.');
      const agent = item.listing_type === 'owner_direct' ? ethers.ZeroAddress : (item.agent_address || ethers.ZeroAddress);
      const priceBase = BigInt(Math.round(Number(item.price_usdc) * 1e6));
      const commissionBps = item.commission_bps ? Number(item.commission_bps) : 0;

      notifications.info('Creating escrow…', 'Waiting for transaction confirmation');

      // JIT Gas Funding
      try { await api.fundGas(signer.address); } catch (e) { console.warn('JIT fund failed', e); }

      const tx = await escrow.createDeal(buyerAddress, seller, agent, priceBase, item.listing_ref, commissionBps);
      const receipt = await tx.wait();

      // Parse DealCreated event to get dealId
      const iface = escrow.interface;
      let dealId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'DealCreated') { dealId = Number(parsed.args.id); break; }
        } catch { /* skip unparseable logs */ }
      }
      if (!dealId) throw new Error('Could not read deal ID from transaction');

      // Record dealId in the backend
      await api.recordDeal(item.id, buyerId, dealId);
      await loadPr();
      notifications.success('Escrow deal created', `Deal #${dealId} is live. The buyer can now fund it.`);
    } catch (err) {
      notifications.error('Escrow creation failed', err?.shortMessage || err.message);
    } finally {
      setBuyStep('');
    }
  };

  // Step 3a (buyer): fund the escrow deal on Ethereum Sepolia. Gas is paid in
  // the buyer's USDC via Privy "User pays" (EIP-7702) — no ETH is needed.
  const fundDeal = async (dealId) => {
    if (!isLoggedIn) { notifications.info('Sign in to fund', 'Log in to fund this escrow deal.'); return router.push('/Login'); }
    const amount = (priceBase ?? 0n).toString();
    if (amount === '0' || amount === '0n') { notifications.error('Payment failed', 'Invalid deal amount'); return; }
    setBuyStep('approving');
    try {
      notifications.info('Funding escrow…', 'Paying gas in USDC via your email wallet.');
      const result = await api.fundEscrowUsdcGas(dealId, amount, 'sepolia');
      setFundTx(result.fundHash || result.userOpHash);
      setFundTxChain('sepolia');
      setBuyStep('done');
      await loadPr();
      notifications.success('Escrow funded!', 'Your payment is secured in escrow. The agent will proceed with the sale.');
    } catch (err) {
      notifications.error('Payment failed', err?.data?.error || err?.data?.message || err.message);
      setBuyStep('');
    }
  };

  // Step 3b (buyer): fund the escrow deal on Base Sepolia. Gas paid in USDC.
  const fundDealOnBase = async (dealId) => {
    if (!isLoggedIn) { notifications.info('Sign in to fund', 'Log in to fund this escrow deal.'); return router.push('/Login'); }
    const amount = (priceBase ?? 0n).toString();
    if (amount === '0' || amount === '0n') { notifications.error('Payment failed', 'Invalid deal amount'); return; }
    setBuyStep('approving');
    try {
      const cfg = await getChainConfig();
      const baseCfg = cfg?.base;
      if (!baseCfg?.configured) throw new Error('Base Sepolia escrow not configured on this platform yet.');

      notifications.info('Funding escrow on Base…', 'Paying gas in USDC via your email wallet.');
      const result = await api.fundEscrowUsdcGas(dealId, amount, 'base');
      setFundTx(result.fundHash || result.userOpHash);
      setFundTxChain('base');
      setBuyStep('done');
      await loadPr();
      notifications.success('Escrow funded on Base!', 'Your USDC payment is secured on Base Sepolia. The agent will proceed.');
    } catch (err) {
      notifications.error('Base payment failed', err?.data?.error || err?.data?.message || err.message);
      setBuyStep('');
    }
  };

  const openChat = async () => {
    if (!isLoggedIn) { notifications.info('Sign in to chat', 'Log in to message the agent on-platform.'); return router.push('/Login'); }
    setOpening(true);
    try { const conv = await api.openConversation(item.id); setChatConv(conv.id); }
    catch (err) { notifications.error('Could not open chat', err.message); }
    finally { setOpening(false); }
  };

  if (loading) return <div className="min-h-screen bg-white dark:bg-black pt-24"><PageLoader label="Loading listing" /></div>;

  if (!item) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="text-center">
        <p className="text-7xl font-bold text-teal-500 mb-4">404</p>
        <p className="text-2xl font-semibold mb-6">Listing not found</p>
        <Link href="/Listings" className="bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 px-6 rounded-xl transition-colors">← Back to Listings</Link>
      </div>
    </div>
  );

  // Buyer purchase state
  const hasPr = pr && pr.status;
  const dealReady = hasPr && pr.status === 'deal_created' && pr.deal_id;
  const alreadyFunded = hasPr && pr.status === 'funded';

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white transition-colors duration-300 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto animate-fade-up">
        <Link href="/Listings" className="inline-flex items-center gap-2 text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-200 font-medium text-sm mb-6">← Back to Listings</Link>

        <div className="bg-gray-50 dark:bg-white/5 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row">
            <div className="md:w-1/2 w-full">
              {item.image ? (
                <img src={item.image} alt={item.title} className="w-full h-64 sm:h-80 md:h-full object-cover" style={{ maxHeight: '560px' }} />
              ) : (
                <div className="w-full h-64 md:h-full min-h-[320px] bg-teal-100 dark:bg-[#121212]/30 flex items-center justify-center text-teal-300 dark:text-teal-700">
                  {isVehicle ? <FiTruck size={64} /> : <FiHome size={64} />}
                </div>
              )}
            </div>

            <div className="md:w-1/2 w-full p-6 sm:p-8 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">{item.title}</h1>
                <span className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full capitalize ${item.status === 'sold' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'}`}>
                  {item.status === 'open' ? 'Available' : item.status}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-3xl font-extrabold text-teal-600 dark:text-teal-400">{Number(item.price_usdc).toLocaleString()}</span>
                <span className="text-lg font-semibold text-gray-400">USDC</span>
                <span className="text-xs text-gray-400 ml-2">· fixed price</span>
              </div>

              {item.description && <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-6">{item.description}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <DetailRow icon={FiDollarSign} label="Price" value={`${item.price_usdc} USDC`} />
                <DetailRow icon={isVehicle ? FiTruck : FiHome} label="Type" value={item.asset_type} />
                {item.listing_type === 'agent_brokered' && <DetailRow icon={FiUser} label="Sold by agent" value="Brokered" />}
                <DetailRow icon={FiShield} label="Settlement" value="USDC escrow" />
              </div>

              <div className="mt-auto space-y-3">
                {isOwnerOfListing ? (
                  <AgentActions
                    item={item}
                    prList={prList}
                    buyStep={buyStep}
                    wallet={wallet}
                    onConnectWallet={connectPrivy}
                    onCreateDeal={createDealOnChain}
                    onDone={load}
                    notifications={notifications}
                  />
                ) : item.status === 'sold' ? (
                  <div className="text-center bg-gray-100 dark:bg-white/5 rounded-xl py-3 text-sm font-semibold text-gray-500">This item has been sold.</div>
                ) : alreadyFunded ? (
                  <div className="bg-teal-50 dark:bg-[#121212]/15 border border-teal-200 dark:border-teal-800 rounded-xl p-4 text-sm text-teal-700 dark:text-teal-300 font-semibold flex items-center gap-2">
                    <FiCheck size={16} /> Escrow funded — your payment is secured.
                    {fundTx && <a href={`${EXPLORERS[fundTxChain] ?? EXPLORERS.sepolia}${fundTx}`} target="_blank" rel="noreferrer" className="ml-auto text-xs flex items-center gap-1 hover:underline"><FiExternalLink size={12} /> Tx</a>}
                  </div>
                ) : dealReady ? (
                  <div className="space-y-3">
                    <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm">
                      <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Escrow deal is ready — fund it now</p>
                      <p className="text-amber-700 dark:text-amber-400 text-xs">Deal #{pr.deal_id} · {Number(item.price_usdc).toLocaleString()} USDC will be held in escrow until you confirm receipt.</p>
                    </div>

                    {/* Token / network selector */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Choose payment token &amp; network</p>
                      {[
                        { k: 'evm-usdc',    title: 'USDC',           sub: 'Ethereum Sepolia · EVM escrow' },
                        { k: 'base-usdc',   title: 'USDC (Base)',     sub: 'Base Sepolia · EVM escrow (L2)' },
                        { k: 'stellar-usdc',title: 'USDC (Stellar)',  sub: 'Stellar network · Soroban escrow' },
                        { k: 'stellar-xlm', title: 'XLM (Stellar)',   sub: 'Pay in XLM · platform converts to USDC' },
                      ].map((opt) => (
                        <button
                          key={opt.k}
                          type="button"
                          onClick={() => { setPayMethod(opt.k); setStellarQuoteData(null); setStellarResult(null); }}
                          className={`w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2.5 text-left transition-colors ${
                            payMethod === opt.k
                              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-500'
                              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5'
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-semibold text-gray-900 dark:text-white">{opt.title}</span>
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">{opt.sub}</span>
                          </span>
                          <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${payMethod === opt.k ? 'border-teal-600 bg-teal-600' : 'border-gray-300 dark:border-gray-600'}`} />
                        </button>
                      ))}
                      {payMethod === 'stellar-xlm' && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-2.5">
                          {stellarQuoteData
                            ? <>You’ll pay <span className="font-mono font-semibold">{stellarQuoteData.xlmAmount} XLM</span> (rate: 1 XLM ≈ {stellarQuoteData.rate.toLocaleString()} USDC). USDC equivalent lands in escrow.</>
                            : <span className="flex items-center gap-1.5"><Spinner size={12} /> Loading XLM quote…</span>}
                        </div>
                      )}
                    </div>

                    {payMethod.startsWith('stellar') ? (
                      <button
                        onClick={payStellar}
                        disabled={stellarPaying || (payMethod === 'stellar-xlm' && !stellarQuoteData)}
                        className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {stellarPaying ? <><Spinner size={16} /> Paying on Stellar…</> : <><FiArrowRight size={16} /> Pay with {payMethod === 'stellar-xlm' ? 'XLM' : 'Stellar USDC'}</>}
                      </button>
                    ) : !wallet ? (
                      <button onClick={connectPrivy} className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 rounded-xl transition-colors">
                        <FiShield size={16} /> Connect wallet to pay
                      </button>
                    ) : (
                      <button
                        onClick={() => payMethod === 'base-usdc' ? fundDealOnBase(pr.deal_id) : fundDeal(pr.deal_id)}
                        disabled={!!buyStep}
                        className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {buyStep === 'approving' ? <><Spinner size={16} /> Approving USDC…</> :
                         buyStep === 'funding'   ? <><Spinner size={16} /> Funding escrow…</> :
                         <><FiShield size={16} /> Fund escrow · {Number(item.price_usdc).toLocaleString()} USDC {payMethod === 'base-usdc' ? '(Base)' : ''}</>}
                      </button>
                    )}
                    <button onClick={openChat} className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 hover:border-teal-500 font-bold py-3 rounded-xl transition-colors text-sm">
                      <FiMessageSquare size={16} /> Chat with agent
                    </button>
                  </div>
                ) : hasPr && pr.status === 'requested' ? (
                  <div className="space-y-3">
                    <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm flex items-start gap-3">
                      <FiClock className="text-teal-500 flex-shrink-0 mt-0.5" size={16} />
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-gray-200">Purchase requested</p>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Waiting for the agent to create your escrow deal. You'll see a "Fund escrow" button here when it's ready.</p>
                      </div>
                    </div>
                    <button onClick={openChat} disabled={opening} className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 hover:border-teal-500 font-bold py-3 rounded-xl transition-colors disabled:opacity-60">
                      {opening ? <Spinner size={16} /> : <><FiMessageSquare size={16} /> Chat with agent</>}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button onClick={openBuy} className="flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 px-6 rounded-xl transition-colors">
                      <FiShoppingCart size={18} /> Buy now
                    </button>
                    <button onClick={openChat} disabled={opening} className="flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 hover:border-teal-500 font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-60">
                      {opening ? <Spinner size={18} /> : <><FiMessageSquare size={18} /> Chat with agent</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Agent card */}
        {item.agent_name && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-4">Listed by</h2>
            <div className="bg-gray-50 dark:bg-white/5 p-5 sm:p-6 rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <img src={item.agent_avatar} alt={item.agent_name} className="w-20 h-20 rounded-full border-4 border-teal-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold">{item.agent_name}</h3>
                  {item.agent_kyc === 'verified' && (
                    <span className="flex items-center gap-1 bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 px-2.5 py-1 rounded-full text-xs font-bold">
                      <FiShield size={12} /> Certified agent
                    </span>
                  )}
                </div>
                {item.agent_username && <p className="text-sm text-gray-500 dark:text-gray-400">@{item.agent_username}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <StarRating value={Number(item.agent_rating) || 0} size={14} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Number(item.agent_rating) > 0 ? `${Number(item.agent_rating).toFixed(1)} · ` : ''}{item.agent_review_count || 0} review{Number(item.agent_review_count) === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {item.agent_phone && (
                    <a href={`tel:${item.agent_phone}`} className="flex items-center gap-2 text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium">
                      <FiPhone size={14} /> {item.agent_phone}
                    </a>
                  )}
                  {!isOwnerOfListing && (
                    <button onClick={openChat} className="flex items-center gap-2 text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium">
                      <FiMessageSquare size={14} /> Message on-platform
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-3 flex items-start gap-1.5">
                  <FiAlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-500" />
                  Call to arrange a site visit, but keep all dealings &amp; payment on HybridAgent so we can protect you if anything goes wrong.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Agent reviews */}
        {item.agent_name && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Agent reviews{reviewData.summary?.count ? ` (${reviewData.summary.count})` : ''}</h2>
              {!isOwnerOfListing && (
                <button
                  onClick={() => { if (!isLoggedIn) { notifications.info('Sign in to review', 'Log in to review this agent.'); return router.push('/Login'); } setReviewOpen(true); }}
                  className="text-sm font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1.5"
                >
                  <FiStar size={14} /> Write a review
                </button>
              )}
            </div>
            {reviewData.summary?.count > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <SummaryChip label="Overall" value={reviewData.summary.rating} />
                <SummaryChip label="Communication" value={reviewData.summary.communication} />
                <SummaryChip label="Professionalism" value={reviewData.summary.professionalism} />
              </div>
            )}
            {reviewData.reviews.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 text-center">No reviews yet. Chat with the agent, then be the first to review.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {reviewData.reviews.map((r) => (
                  <div key={r.id} className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <img src={r.reviewer_avatar} alt={r.reviewer_name} className="w-9 h-9 rounded-full border-2 border-teal-500" />
                        <span className="font-semibold text-sm">{r.reviewer_name}</span>
                      </div>
                      <StarRating value={r.rating} size={13} />
                    </div>
                    {r.comment && <p className="text-sm text-gray-600 dark:text-gray-300">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {reviewOpen && (
        <ReviewModal agentId={item.created_by} agentName={item.agent_name} onClose={() => setReviewOpen(false)} onDone={(res) => { setReviewData(res); load(); }} />
      )}

      {/* Buy modal */}
      {buyOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setBuyOpen(false)}>
          <div className="bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md backdrop-blur-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold">Buy · {Number(item.price_usdc).toLocaleString()} USDC</h3>
              <button onClick={() => setBuyOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><FiX size={22} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">You pay the exact listed price into escrow. On completion, funds split automatically:</p>
              {quote ? (
                <div className="space-y-2 text-sm bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <Row label="You pay" value={`${formatUsdc(quote.price)} USDC`} bold />
                  {Number(quote.commission) > 0 && <Row label="Agent commission" value={`${formatUsdc(quote.commission)} USDC`} />}
                  <Row label="Platform fee" value={`${formatUsdc(quote.platformFee)} USDC`} />
                  <Row label="To owner/seller" value={`${formatUsdc(quote.sellerProceeds)} USDC`} />
                </div>
              ) : (
                <div className="flex justify-center py-4"><Spinner size={22} className="text-teal-500" /></div>
              )}
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-teal-50 dark:bg-[#121212]/15 rounded-xl p-3">
                <FiShield className="text-teal-500 flex-shrink-0 mt-0.5" size={14} />
                Your money is held in escrow and released only when the deal completes — protecting you, the owner, and the agent.
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Payment method</p>
                {[
                  { k: 'evm-usdc',     title: 'USDC',           sub: 'Ethereum Sepolia · default' },
                  { k: 'base-usdc',    title: 'USDC (Base)',     sub: 'Base Sepolia · L2 · low fees' },
                  { k: 'stellar-usdc', title: 'USDC (Stellar)',  sub: 'Stellar network · same escrow' },
                  { k: 'stellar-xlm',  title: 'XLM (Stellar)',   sub: 'Pay in XLM · platform converts to USDC' },
                ].map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => { setPayMethod(opt.k); setStellarQuoteData(null); }}
                    className={`w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2.5 text-left transition-colors ${
                      payMethod === opt.k
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-500'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{opt.title}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400">{opt.sub}</span>
                    </span>
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${payMethod === opt.k ? 'border-teal-600 bg-teal-600' : 'border-gray-300 dark:border-gray-600'}`} />
                  </button>
                ))}
                {payMethod === 'stellar-xlm' && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-2.5">
                    {stellarQuoteData
                      ? <>You’ll pay <span className="font-mono font-semibold">{stellarQuoteData.xlmAmount} XLM</span> (rate: 1 XLM ≈ {stellarQuoteData.rate.toLocaleString()} USDC). USDC equivalent lands in escrow.</>
                      : <span className="flex items-center gap-1.5"><Spinner size={12} /> Loading XLM quote…</span>}
                  </div>
                )}
              </div>
              <button
                onClick={payMethod.startsWith('stellar') ? payStellar : submitRequest}
                disabled={(payMethod.startsWith('stellar') ? stellarPaying : buyStep === 'requesting') || (payMethod === 'stellar-xlm' && !stellarQuoteData)}
                className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                {payMethod.startsWith('stellar') ? (
                  stellarPaying ? <><Spinner size={16} /> Paying on Stellar…</> : <><FiArrowRight size={16} /> Pay with {payMethod === 'stellar-xlm' ? 'XLM' : 'Stellar USDC'}</>
                ) : (
                  buyStep === 'requesting' ? <><Spinner size={16} /> Sending request…</> : <><FiArrowRight size={16} /> Request purchase</>
                )}
              </button>
              <p className="text-[11px] text-center text-gray-400">
                {payMethod.startsWith('stellar')
                  ? 'The Soroban escrow secures your payment and splits commission + fees atomically on completion.'
                  : payMethod === 'base-usdc'
                  ? 'Base Sepolia — same escrow logic, lower gas. The agent will create your deal; fund it once ready.'
                  : "The agent will create your escrow deal on-chain. You'll fund it once it's ready."}
              </p>
            </div>
          </div>
        </div>
      )}

      {chatConv && <ChatPanel conversationId={chatConv} title={`Chat · ${item.agent_name || 'Agent'}`} onClose={() => setChatConv(null)} />}
    </div>
  );
};

// Agent-side panel: shows pending buyer requests + "Create Escrow" button
const AgentActions = ({ item, prList, buyStep, wallet, onConnectWallet, onCreateDeal, onDone, notifications }) => {
  const pending = prList.filter((r) => r.status === 'requested');
  const active = prList.filter((r) => r.status === 'deal_created');
  const [resending, setResending] = React.useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await api.resendOwnerNotice(item.id);
      notifications.success('Email resent', `Notification sent again to ${item.owner_email}.`);
    } catch (err) {
      notifications.error('Resend failed', err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-teal-50 dark:bg-[#121212]/15 border border-teal-100 dark:border-teal-900/40 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-300">
        This is your listing.
        {item.listing_type === 'agent_brokered' && item.owner_status !== 'confirmed' && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1.5">
              <FiClock size={12} /> Waiting for owner to confirm
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              A notification was sent to <span className="font-mono font-semibold">{item.owner_email}</span>. If they didn't receive it, resend it below.
            </p>
            <button
              onClick={handleResend}
              disabled={resending}
              className="flex items-center gap-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {resending ? <Spinner size={12} /> : <FiMail size={12} />}
              {resending ? 'Sending…' : 'Resend Email to Owner'}
            </button>
          </div>
        )}
        {item.listing_type === 'agent_brokered' && item.owner_status === 'pending' && (
          <AttachOwner id={item.id} onDone={onDone} notifications={notifications} />
        )}
      </div>

      {pending.map((r) => (
        <div key={r.id} className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Purchase request</p>
            <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5 font-mono">{shortAddress(r.buyer_address)}</p>
          </div>
          {!wallet ? (
            <button
              onClick={onConnectWallet}
              className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              <FiShield size={14} /> Connect wallet to create deal
            </button>
          ) : (
            <button
              onClick={() => onCreateDeal(r.buyer_address, r.buyer_id)}
              disabled={!!buyStep}
              className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-60"
            >
              {buyStep === 'escrow' ? <><Spinner size={14} /> Creating deal…</> : <><FiShield size={14} /> Create escrow deal</>}
            </button>
          )}
          <p className="text-[11px] text-amber-600 dark:text-amber-500">Your wallet will sign a transaction on Ethereum Sepolia.</p>
        </div>
      ))}

      {active.map((r) => (
        <div key={r.id} className="bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800 rounded-xl p-4 text-sm">
          <p className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-2"><FiClock size={14} /> Waiting for buyer to fund</p>
          <p className="text-green-700 dark:text-green-400 text-xs mt-0.5">Deal #{r.deal_id} · {shortAddress(r.buyer_address)}</p>
        </div>
      ))}
    </div>
  );
};

const Row = ({ label, value, bold }) => (
  <div className="flex justify-between">
    <span className="text-gray-500 dark:text-gray-400">{label}</span>
    <span className={bold ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-200'}>{value}</span>
  </div>
);

const SummaryChip = ({ label, value }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-50 dark:bg-[#121212]/20 text-teal-700 dark:text-teal-300 px-3 py-1.5 rounded-full">
    {label}<span className="text-teal-900 dark:text-teal-100">{Number(value || 0).toFixed(1)}/5</span>
  </span>
);

const AttachOwner = ({ id, onDone, notifications }) => {
  const [addr, setAddr] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.attachOwner(id, addr);
      notifications.success('Owner payout attached', 'The owner will be paid directly at settlement.');
      onDone();
    } catch (err) {
      notifications.error('Could not attach owner', err.message);
    } finally { setSaving(false); }
  };
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1.5">Owner payout pending — add their wallet before the sale closes.</p>
      <div className="flex gap-2">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x owner wallet" className="flex-1 bg-white dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500" />
        <button onClick={save} disabled={saving || !addr} className="bg-teal-600 hover:bg-teal-500 text-white px-4 rounded-lg text-sm font-semibold disabled:opacity-50">{saving ? '…' : 'Attach'}</button>
      </div>
    </div>
  );
};

export default ItemDetailsPage;
