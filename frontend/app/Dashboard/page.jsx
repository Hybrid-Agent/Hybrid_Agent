'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import {
  FiPlusCircle, FiGrid, FiMessageSquare, FiHome, FiTruck, FiUpload, FiShield,
  FiDollarSign, FiUser, FiMail, FiCheck, FiArrowLeft, FiInbox, FiClock,
  FiAlertCircle, FiExternalLink,
} from 'react-icons/fi';
import { useAuth } from '../components/Atoms/AuthProvider';
import { useNotifications } from '../components/Atoms/NotificationProvider';
import { Spinner, Skeleton } from '../components/Atoms/Loaders';
import ChatThread from '../components/Molecules/ChatThread';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { timeAgo, shortAddress } from '@/lib/format';
import { pickEmbeddedWallet, getChainConfig } from '@/lib/wallet';

const ESCROW_ABI = [
  'function createDeal(address buyer, address seller, address agent, uint256 price, bytes32 listingRef, uint16 commissionBps) returns (uint256)',
  'event DealCreated(uint256 indexed id, address indexed buyer, address indexed seller, address agent, uint256 price, uint16 commissionBps, uint16 platformFeeBps, bytes32 listingRef, uint256 mandateId)',
];

const EMPTY = {
  assetType: 'property', listingType: 'agent_brokered', title: '', description: '',
  priceUsdc: '', commissionBps: 500, ownerName: '', ownerEmail: '',
};

const DashboardPage = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const notifications = useNotifications();
  const { wallets } = useWallets();
  const { login: connectPrivy } = usePrivy();

  const wallet = useMemo(() => pickEmbeddedWallet(wallets), [wallets]);

  const [tab, setTab] = useState('create');
  const [form, setForm] = useState(EMPTY);
  const [imageFile, setImageFile] = useState(null);
  const [authDocs, setAuthDocs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [listings, setListings] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [dealStep, setDealStep] = useState(''); // per-request step tracker: '<requestId>:escrow'

  const verified = user?.kyc_status === 'verified';
  const brokered = form.listingType === 'agent_brokered';

  useEffect(() => {
    if (!loading && !user) router.push('/Login');
  }, [loading, user, router]);

  const loadAll = useCallback(async () => {
    setLoadingLists(true);
    try {
      const [mine, convos, inc] = await Promise.all([
        api.myListings(),
        api.conversations(),
        api.incomingPurchaseRequests(),
      ]);
      setListings(mine);
      setConversations(convos);
      setIncoming(inc);
    } catch {
      /* offline */
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadAll();
  }, [user, loadAll]);

  // Live: refresh on new chat messages AND new purchase requests.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onMsg = () => loadAll();
    const onPR = ({ listingTitle, buyerName }) => {
      notifications.info(
        'New purchase request',
        `${buyerName || 'A buyer'} wants to buy "${listingTitle}". Go to Incoming to respond.`,
      );
      loadAll();
      setTab('incoming');
    };
    socket.on('message:notify', onMsg);
    socket.on('purchase:request', onPR);
    return () => {
      socket.off('message:notify', onMsg);
      socket.off('purchase:request', onPR);
    };
  }, [user, loadAll, notifications]);

  const setField = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!verified) {
      notifications.error('Verification required', 'Verify your identity on your profile before listing.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('assetType', form.assetType);
      fd.append('listingType', form.listingType);
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('priceUsdc', form.priceUsdc);
      if (brokered) {
        fd.append('commissionBps', form.commissionBps);
        fd.append('ownerName', form.ownerName);
        fd.append('ownerEmail', form.ownerEmail);
      }
      if (imageFile) fd.append('image', imageFile);
      authDocs.forEach((file) => fd.append('authDocs', file));

      const created = await api.createListing(fd);
      notifications.success('Listing published', `"${created.title}" is now live.`);
      setForm(EMPTY);
      setImageFile(null);
      setAuthDocs([]);
      setTab('listings');
      loadAll();
    } catch (err) {
      notifications.error('Could not publish', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Create the on-chain escrow deal from the dashboard.
  const createDeal = async (r) => {
    if (!wallet) { connectPrivy(); return; }
    setDealStep(`${r.id}:escrow`);
    try {
      const cfg = await getChainConfig();
      if (!cfg?.contracts?.hybridEscrow) throw new Error('Escrow contract not configured');

      await wallet.switchChain(cfg.chainId);
      const provider = new ethers.BrowserProvider(await wallet.getEthereumProvider());
      const signer = await provider.getSigner();
      const escrow = new ethers.Contract(cfg.contracts.hybridEscrow, ESCROW_ABI, signer);

      const seller = r.owner_address;
      if (!seller) throw new Error('Owner payout address not set. Open the listing and attach it first.');
      const agent = r.listing_type === 'owner_direct'
        ? ethers.ZeroAddress
        : (r.agent_address || ethers.ZeroAddress);
      const priceBase = BigInt(Math.round(Number(r.price_usdc) * 1e6));
      const commissionBps = r.commission_bps ? Number(r.commission_bps) : 0;

      notifications.info('Creating escrow…', 'Waiting for transaction to confirm.');
      const tx = await escrow.createDeal(r.buyer_address, seller, agent, priceBase, r.listing_ref, commissionBps);
      const receipt = await tx.wait();

      const iface = escrow.interface;
      let dealId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'DealCreated') { dealId = Number(parsed.args.id); break; }
        } catch { /* skip */ }
      }
      if (dealId === null) throw new Error('Could not read deal ID from transaction');

      await api.recordDeal(r.listing_id, r.buyer_id, dealId);
      notifications.success('Escrow deal created', `Deal #${dealId} is live. The buyer can now fund it.`);
      loadAll();
    } catch (err) {
      notifications.error('Escrow creation failed', err?.shortMessage || err.message);
    } finally {
      setDealStep('');
    }
  };

  if (loading || !user) {
    return <div className="min-h-screen bg-white dark:bg-black pt-24 flex justify-center"><Spinner size={28} className="text-teal-500 mt-10" /></div>;
  }

  const inputClass = 'w-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-teal-500 transition-all';
  const label = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const pendingIncoming = incoming.filter((r) => r.status === 'requested');

  const tabs = [
    { id: 'create',   label: 'List an item',  icon: FiPlusCircle },
    { id: 'listings', label: 'My Listings',   icon: FiGrid },
    { id: 'incoming', label: 'Incoming',       icon: FiInbox,       badge: pendingIncoming.length },
    { id: 'messages', label: 'Messages',       icon: FiMessageSquare, badge: conversations.length },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white transition-colors pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto animate-fade-up">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold">Agent Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">List properties &amp; vehicles, respond to purchase requests, and talk to buyers.</p>
        </div>

        {!verified && (
          <div className="mb-6 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4">
            <FiShield className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">Verify your identity to publish listings and transact.</p>
            <Link href="/Profile" className="text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg">Verify</Link>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl w-full sm:w-fit mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'incoming') loadAll(); }}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-white dark:bg-white/15 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              <t.icon size={15} /> {t.label}
              {!!t.badge && (
                <span className="bg-teal-500 text-white text-[10px] rounded-full px-1.5 leading-tight py-0.5">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Create ── */}
        {tab === 'create' && (
          <form onSubmit={submit} className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-2xl animate-fade-in space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>Asset type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'property', t: 'Property', Icon: FiHome }, { v: 'vehicle', t: 'Vehicle', Icon: FiTruck }].map(({ v, t, Icon }) => (
                    <button type="button" key={v} onClick={() => setForm((p) => ({ ...p, assetType: v }))}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${form.assetType === v ? 'border-teal-500 bg-teal-50 dark:bg-[#121212]/20 text-teal-700 dark:text-teal-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                      <Icon size={15} /> {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={label}>Listing type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'agent_brokered', t: 'For an owner' }, { v: 'owner_direct', t: 'My own' }].map(({ v, t }) => (
                    <button type="button" key={v} onClick={() => setForm((p) => ({ ...p, listingType: v }))}
                      className={`p-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${form.listingType === v ? 'border-teal-500 bg-teal-50 dark:bg-[#121212]/20 text-teal-700 dark:text-teal-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className={label}>Title</label>
              <input name="title" value={form.title} onChange={setField} required placeholder="e.g. 3-Bedroom Bungalow, Jos" className={inputClass} />
            </div>
            <div>
              <label className={label}>Description</label>
              <textarea name="description" value={form.description} onChange={setField} rows={3} placeholder="Key details buyers should know…" className={`${inputClass} resize-none`} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>Price (USDC)</label>
                <div className="relative">
                  <FiDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500" size={15} />
                  <input name="priceUsdc" type="number" min="1" value={form.priceUsdc} onChange={setField} required placeholder="45000" className={`${inputClass} pl-9`} />
                </div>
              </div>
              {brokered && (
                <div>
                  <label className={label}>Commission (%)</label>
                  <input type="number" min="0.1" max="30" step="0.1" value={form.commissionBps / 100}
                    onChange={(e) => setForm((p) => ({ ...p, commissionBps: Math.round(Number(e.target.value) * 100) }))}
                    required className={inputClass} />
                </div>
              )}
            </div>

            {brokered && (
              <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-800">
                <div className="sm:col-span-2 text-xs text-gray-500 dark:text-gray-400">You're selling for an owner — just their email. We reserve a secure wallet for them and email a claim link; their proceeds are paid there directly.</div>
                <div>
                  <label className={label}>Owner name</label>
                  <div className="relative">
                    <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500" size={15} />
                    <input name="ownerName" value={form.ownerName} onChange={setField} required placeholder="Mr. Danladi" className={`${inputClass} pl-9`} />
                  </div>
                </div>
                <div>
                  <label className={label}>Owner email</label>
                  <div className="relative">
                    <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500" size={15} />
                    <input name="ownerEmail" type="email" value={form.ownerEmail} onChange={setField} required placeholder="owner@email.com" className={`${inputClass} pl-9`} />
                  </div>
                </div>
              </div>
            )}

            {brokered && (
              <div>
                <label className={label}>Authorization Documents (PDF/Images)</label>
                <label className="flex items-center gap-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 cursor-pointer hover:border-teal-500 transition-colors">
                  <FiUpload className="text-teal-500" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {authDocs.length ? `${authDocs.length} document(s) selected` : 'Upload mandate/documents'}
                  </span>
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => setAuthDocs(Array.from(e.target.files || []))} />
                </label>
              </div>
            )}

            <div>
              <label className={label}>Photo</label>
              <label className="flex items-center gap-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 cursor-pointer hover:border-teal-500 transition-colors">
                <FiUpload className="text-teal-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">{imageFile ? imageFile.name : 'Upload an image (optional)'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <button type="submit" disabled={submitting || !verified} className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
              {submitting ? <Spinner size={20} /> : <>Publish listing <FiCheck size={16} /></>}
            </button>
          </form>
        )}

        {/* ── My Listings ── */}
        {tab === 'listings' && (
          loadingLists ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)}</div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-gray-800">
              <p className="font-semibold">No listings yet</p>
              <button onClick={() => setTab('create')} className="mt-3 text-teal-600 dark:text-teal-400 font-semibold text-sm">Create your first listing →</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((l) => {
                const pendingCount = incoming.filter((r) => r.listing_id === l.id && r.status === 'requested').length;
                return (
                  <Link key={l.id} href={`/Listings/${l.id}`} className="bg-white dark:bg-white/5 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 hover:border-teal-500 transition-all group">
                    {l.image ? <img src={l.image} alt={l.title} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-40 bg-teal-100 dark:bg-[#121212]/30" />}
                    <div className="p-4">
                      <h3 className="font-bold text-sm truncate">{l.title}</h3>
                      <p className="text-teal-600 dark:text-teal-400 text-sm font-semibold mt-1">{l.price_usdc} USDC</p>
                      <div className="flex items-center justify-between mt-1.5 flex-wrap gap-1">
                        <span className="text-xs text-gray-400 capitalize">{l.status}</span>
                        {pendingCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                            {pendingCount} request{pendingCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {l.listing_type === 'agent_brokered' && !pendingCount && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${l.owner_status === 'confirmed' ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                            owner {l.owner_status}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {/* ── Incoming Purchase Requests ── */}
        {tab === 'incoming' && (
          <div className="animate-fade-in space-y-4">
            {loadingLists ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
            ) : incoming.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-gray-800">
                <FiInbox size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="font-semibold">No purchase requests yet</p>
                <p className="text-sm text-gray-400 mt-1">When a buyer requests your listing, it appears here.</p>
              </div>
            ) : (
              incoming.map((r) => {
                const isProcessing = dealStep === `${r.id}:escrow`;
                return (
                  <div key={r.id} className={`bg-gray-50 dark:bg-white/5 border rounded-2xl p-5 flex flex-col sm:flex-row gap-4 ${
                    r.status === 'requested' ? 'border-amber-200 dark:border-amber-800/60' :
                    r.status === 'deal_created' ? 'border-teal-200 dark:border-teal-800/60' :
                    r.status === 'funded' ? 'border-green-200 dark:border-green-800/60' :
                    'border-gray-200 dark:border-gray-800'
                  }`}>
                    {/* Listing thumbnail */}
                    {r.listing_image
                      ? <img src={r.listing_image} alt={r.listing_title} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                      : <div className="w-20 h-20 rounded-xl bg-teal-100 dark:bg-[#121212]/30 flex-shrink-0 flex items-center justify-center text-teal-400"><FiHome size={28} /></div>}

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <Link href={`/Listings/${r.listing_id}`} className="font-bold text-gray-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
                            {r.listing_title}
                          </Link>
                          <p className="text-sm text-teal-600 dark:text-teal-400 font-semibold">{Number(r.price_usdc).toLocaleString()} USDC</p>
                        </div>
                        <StatusBadge status={r.status} dealId={r.deal_id} />
                      </div>

                      <div className="flex items-center gap-2">
                        {r.buyer_avatar && <img src={r.buyer_avatar} alt={r.buyer_name} className="w-7 h-7 rounded-full border-2 border-teal-500 flex-shrink-0" />}
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.buyer_name || 'Unknown buyer'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{shortAddress(r.buyer_address)}</p>
                        </div>
                        <span className="ml-auto text-xs text-gray-400">{timeAgo(new Date(r.updated_at).getTime())}</span>
                      </div>

                      {/* Action */}
                      {r.status === 'requested' && (
                        <div className="pt-1">
                          {!r.owner_address ? (
                            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15 rounded-lg px-3 py-2">
                              <FiAlertCircle size={13} className="flex-shrink-0" />
                              Owner payout address not set.{' '}
                              <Link href={`/Listings/${r.listing_id}`} className="underline font-semibold">Open listing to attach it.</Link>
                            </div>
                          ) : !wallet ? (
                            <button onClick={connectPrivy} className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
                              <FiShield size={14} /> Connect wallet to create deal
                            </button>
                          ) : (
                            <button
                              onClick={() => createDeal(r)}
                              disabled={!!dealStep}
                              className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                            >
                              {isProcessing ? <><Spinner size={14} /> Creating escrow…</> : <><FiShield size={14} /> Create escrow deal</>}
                            </button>
                          )}
                        </div>
                      )}

                      {r.status === 'deal_created' && (
                        <p className="text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                          <FiClock size={12} /> Deal #{r.deal_id} created — waiting for buyer to fund escrow.
                        </p>
                      )}

                      {r.status === 'funded' && (
                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                          <FiCheck size={12} /> Escrow funded — payment secured. Proceed with the sale.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Messages ── */}
        {tab === 'messages' && (
          <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden grid md:grid-cols-[300px_1fr] h-[72vh] animate-fade-in">
            <div className={`md:border-r border-gray-200 dark:border-gray-800 overflow-y-auto ${selectedConv ? 'hidden md:block' : 'block'}`}>
              {loadingLists ? (
                <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  <FiMessageSquare size={26} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  No conversations yet. Buyers who message you appear here.
                </div>
              ) : (
                conversations.map((c) => {
                  const other = c.agent_id === user.id ? c.buyer_name : c.agent_name;
                  const sel = selectedConv?.id === c.id;
                  return (
                    <button key={c.id} onClick={() => setSelectedConv({ id: c.id, title: `${c.listing_title || 'Listing'} · ${other}` })}
                      className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100 dark:border-gray-800/60 transition-colors ${sel ? 'bg-teal-50 dark:bg-[#121212]/15' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}>
                      {c.listing_image ? <img src={c.listing_image} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" /> : <div className="w-11 h-11 rounded-lg bg-teal-100 dark:bg-[#121212]/30 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{c.listing_title || 'Listing'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{other} · {c.last_message || 'No messages yet'}</p>
                      </div>
                      {c.last_at && <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(new Date(c.last_at).getTime())}</span>}
                    </button>
                  );
                })
              )}
            </div>

            <div className={`flex-col min-h-0 ${selectedConv ? 'flex' : 'hidden md:flex'}`}>
              {selectedConv ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                    <button className="md:hidden text-gray-500" onClick={() => setSelectedConv(null)}><FiArrowLeft size={18} /></button>
                    <span className="font-semibold text-sm truncate">{selectedConv.title}</span>
                  </div>
                  <ChatThread conversationId={selectedConv.id} className="flex-1" />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                  <FiMessageSquare size={32} className="mb-2" />
                  <p className="text-sm">Select a conversation to start chatting</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatusBadge = ({ status, dealId }) => {
  const map = {
    requested:    { label: 'Pending',      cls: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' },
    deal_created: { label: dealId ? `Deal #${dealId} · Awaiting payment` : 'Deal created', cls: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300' },
    funded:       { label: 'Funded ✓',     cls: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${cls}`}>{label}</span>;
};

export default DashboardPage;
