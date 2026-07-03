import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar,
  TextInput, Modal, Pressable, ActivityIndicator, Image, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ListingsStackParamList, RootStackParamList } from '../navigation/types';
import { api, type Listing } from '../lib/api';
import { storage } from '../lib/storage';
import { useAppTheme, type Theme } from '../lib/theme';

type PurchaseStatus = null | 'requested' | 'deal_created' | 'funded';
type DetailRoute    = RouteProp<ListingsStackParamList, 'ListingDetail'>;

type PurchaseRequest = {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerAddress: string;
  requestedAt: string;
  dealId?: string;
};

// ────────────────────────────────────────────────────────────────────────────
export default function ListingDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route  = useRoute<DetailRoute>();
  const theme  = useAppTheme();
  const styles = makeStyles(theme);

  const [listing, setListing] = useState<Listing | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);

  useEffect(() => {
    api.listing(route.params.id)
      .then(data => setListing(data))
      .catch(() => {})
      .finally(() => setLoadingListing(false));
    storage.getUser().then(u => { if (u?.id) setMyUserId(String(u.id)); });
  }, [route.params.id]);

  // ── all hooks before any conditional returns ──
  const isOwner    = listing?.created_by != null && myUserId != null && String(listing.created_by) === myUserId;
  const isProperty = listing?.asset_type === 'property';

  // Buyer state machine
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatus>(null);
  const [showBuyModal, setShowBuyModal]     = useState(false);
  const [requestingPurchase, setRequestingPurchase] = useState(false);

  // Owner — invite-owner state
  const [ownerName,   setOwnerName]   = useState('');
  const [ownerEmail,  setOwnerEmail]  = useState('');
  const [ownerStatus, setOwnerStatus] = useState<'none' | 'pending_email' | 'confirmed'>('none');

  useEffect(() => {
    if (listing) {
      setOwnerName(listing.owner_name ?? '');
      setOwnerEmail(listing.owner_email ?? '');
      setOwnerStatus((listing.owner_status as any) ?? 'none');
    }
  }, [listing]);

  // Owner — incoming purchase requests
  const [pendingReqs, setPendingReqs]  = useState<PurchaseRequest[]>([]);
  const [activeDeals, setActiveDeals]  = useState<PurchaseRequest[]>([]);
  const [creatingDealId, setCreatingDealId] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  useEffect(() => {
    if (isOwner && listing) {
      api.incomingRequests().then(reqs => {
        const mine = reqs.filter((r: any) => String(r.listing_id) === String(listing.id));
        setPendingReqs(mine.map((r: any) => ({
          id: r.id,
          buyerId: String(r.buyer_id ?? r.id),
          buyerName: r.buyer_name ?? 'Buyer',
          buyerAddress: r.buyer_address ?? '0x…',
          requestedAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
        })));
      }).catch(() => {});
    }
  }, [isOwner, listing]);

  if (loadingListing) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.navy} />
      </View>
    );
  }

  if (!listing) return null;

  // ── price math ──
  const priceNum     = parseFloat(String(listing.price_usdc).replace(/,/g, ''));
  const commPct      = listing.commission_bps ? listing.commission_bps / 100 : 0;
  const agentFee     = listing.commission_bps ? Math.round(priceNum * listing.commission_bps / 10000) : 0;
  const platformFee  = Math.round(priceNum * 100 / 10000);
  const sellerAmt    = priceNum - agentFee - platformFee;

  // ── owner actions ──
  function sendOwnerInvite() {
    if (!ownerName.trim() || !ownerEmail.trim()) return;
    setOwnerStatus('pending_email');
  }

  async function resendOwnerEmail() {
    if (!listing) return;
    setResendingEmail(true);
    try {
      await api.resendOwnerNotice(String(listing.id));
      Alert.alert('Email Sent', `Notification resent to ${ownerEmail}.`);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not resend email.');
    } finally {
      setResendingEmail(false);
    }
  }

  async function createEscrowDeal(req: PurchaseRequest) {
    setCreatingDealId(req.id);
    try {
      await api.approvePurchaseRequest(String(listing!.id), req.buyerId);
    } catch (_) {}
    setPendingReqs(prev => prev.filter(r => r.id !== req.id));
    setActiveDeals(prev => [...prev, { ...req, dealId: 'pending' }]);
    setCreatingDealId(null);
  }

  // ── buyer actions ──
  async function requestPurchase() {
    setShowBuyModal(false);
    setRequestingPurchase(true);
    try {
      await api.requestPurchase(listing!.id);
    } catch (_) {}
    setPurchaseStatus('requested');
    setRequestingPurchase(false);
  }

  // ── helper: can the owner create a deal? ──
  // For agent_brokered, owner must have confirmed via email before deals can be created.
  const canCreateDeal =
    listing.listing_type !== 'agent_brokered' || ownerStatus === 'confirmed';

  const handleChat = async () => {
    if (!listing) return;
    try {
      setOpeningChat(true);
      const res = await api.openConversation(listing.id);
      nav.navigate('Chat', { conversationId: res.id });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start chat.');
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
          <Ionicons name="arrow-back" size={20} color={theme.navy} />
        </TouchableOpacity>
        <View style={styles.heroImage}>
          {listing.image ? (
            <Image source={{ uri: listing.image }} style={styles.heroImg} resizeMode="cover" />
          ) : (
            <Ionicons
              name={isProperty ? 'business-outline' : 'car-outline'}
              size={56}
              color={isProperty ? (theme.navy === '#0c2340' ? theme.navy : '#fff') : theme.gold}
            />
          )}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Tags row */}
        <View style={styles.topRow}>
          <View style={styles.typeTag}>
            <Text style={styles.typeTagText}>{listing.asset_type.toUpperCase()}</Text>
          </View>
          <View style={[styles.statusTag, listing.status === 'pending' && styles.statusPending, listing.status === 'sold' && styles.statusSold]}>
            <Text style={[
              styles.statusText,
              listing.status === 'pending' && { color: '#92400e' },
              listing.status === 'sold'    && { color: '#dc2626' },
            ]}>
              {listing.status === 'open' ? 'Available' : listing.status === 'sold' ? 'Sold' : 'Under Offer'}
            </Text>
          </View>
          {listing.listing_type === 'agent_brokered' && (
            <View style={styles.brokerTag}>
              <Ionicons name="briefcase-outline" size={10} color={theme.gold} />
              <Text style={styles.brokerTagText}>Agent Brokered</Text>
            </View>
          )}
        </View>

        {/* Title + Price */}
        <Text style={styles.title}>{listing.title}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>${listing.price_usdc}</Text>
          <Text style={styles.priceUnit}> USDC</Text>
        </View>

        {/* Specs */}
        {isProperty ? (
          <View style={styles.specs}>
            {listing.bedrooms != null && <SpecChip icon="bed-outline"        value={`${listing.bedrooms} Beds`} />}
            {listing.bathrooms != null && <SpecChip icon="water-outline"     value={`${listing.bathrooms} Baths`} />}
            <SpecChip icon="home-outline" value="Residential" />
          </View>
        ) : (
          <View style={styles.specs}>
            {listing.year != null    && <SpecChip icon="calendar-outline"   value={String(listing.year)} />}
            {listing.mileage != null && <SpecChip icon="speedometer-outline" value={listing.mileage} />}
            <SpecChip icon="car-outline" value="Foreign Used" />
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.desc}>{listing.description}</Text>
        </View>

        {/* Commission breakdown (agent_brokered only) */}
        {listing.listing_type === 'agent_brokered' && listing.commission_bps != null && (
          <View style={styles.commCard}>
            <View style={styles.commHeader}>
              <Ionicons name="briefcase-outline" size={15} color={theme.gold} />
              <Text style={styles.commTitle}>Agent commission: {commPct}%</Text>
            </View>
            <BreakdownRow label="Listing price"                    value={`$${listing.price_usdc}`} />
            <BreakdownRow label={`Agent commission (${commPct}%)`} value={`-$${agentFee.toLocaleString()}`} />
            <BreakdownRow label="Platform fee (1%)"               value={`-$${platformFee.toLocaleString()}`} />
            <View style={styles.commDivider} />
            <BreakdownRow label="Seller receives"                 value={`$${sellerAmt.toLocaleString()}`} bold />
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            OWNER / AGENT PANEL
            Shows when the current user created this listing.
        ═══════════════════════════════════════════════════════════ */}
        {isOwner && (
          <View style={styles.ownerPanel}>

            {/* "This is your listing" */}
            <View style={styles.ownerBanner}>
              <View style={styles.ownerBannerIcon}>
                <Ionicons name="business-outline" size={18} color={theme.navy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerBannerTitle}>This is your listing</Text>
                <Text style={styles.ownerBannerSub}>
                  {listing.listing_type === 'agent_brokered'
                    ? 'You are the agent — brokering on behalf of the owner.'
                    : 'You are the owner — selling directly.'}
                </Text>
              </View>
            </View>

            {/* Invite owner (agent_brokered only) */}
            {listing.listing_type === 'agent_brokered' && (
              <View style={styles.attachCard}>

                {/* ── confirmed ── */}
                {ownerStatus === 'confirmed' && (
                  <>
                    <View style={styles.attachHeader}>
                      <Ionicons name="checkmark-circle" size={16} color="#059669" />
                      <Text style={[styles.attachTitle, { color: '#059669' }]}>Owner confirmed</Text>
                    </View>
                    <View style={styles.ownerConfirmedRow}>
                      <View style={styles.ownerConfirmedAvatar}>
                        <Text style={styles.ownerConfirmedInitial}>
                          {(ownerName || listing.owner_name || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ownerConfirmedName}>
                          {ownerName || listing.owner_name}
                        </Text>
                        <Text style={styles.ownerConfirmedEmail}>
                          {ownerEmail || listing.owner_email}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setOwnerStatus('none')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil-outline" size={15} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.attachConfirmedNote}>
                      A custodial wallet has been created for this owner. Their payout will be sent there automatically at settlement.
                    </Text>
                  </>
                )}

                {/* ── pending email ── */}
                {ownerStatus === 'pending_email' && (
                  <>
                    <View style={styles.attachHeader}>
                      <Ionicons name="mail-outline" size={16} color={theme.gold} />
                      <Text style={[styles.attachTitle, { color: theme.badgePendingText }]}>Awaiting owner confirmation</Text>
                    </View>
                    <View style={styles.pendingEmailBox}>
                      <Text style={styles.pendingEmailName}>{ownerName}</Text>
                      <Text style={styles.pendingEmailAddr}>{ownerEmail}</Text>
                    </View>
                    <Text style={styles.attachHint}>
                      An invitation email was sent to the owner. The listing will go live once they click the confirmation link.
                    </Text>
                    <TouchableOpacity
                      style={[styles.attachBtn, { backgroundColor: '#d97706', marginTop: 4 }, resendingEmail && { opacity: 0.6 }]}
                      onPress={resendOwnerEmail}
                      disabled={resendingEmail}
                      activeOpacity={0.8}
                    >
                      {resendingEmail
                        ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                        : <Ionicons name="mail-outline" size={14} color="#fff" style={{ marginRight: 6 }} />}
                      <Text style={styles.attachBtnText}>
                        {resendingEmail ? 'Sending…' : 'Resend Email to Owner'}
                      </Text>
                    </TouchableOpacity>
                    {/* Demo advance */}
                    <TouchableOpacity style={styles.demoBtn} onPress={() => setOwnerStatus('confirmed')}>
                      <Text style={styles.demoBtnText}>▶ Simulate: owner confirms email</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── not yet invited ── */}
                {ownerStatus === 'none' && (
                  <>
                    <View style={styles.attachHeader}>
                      <Ionicons name="person-add-outline" size={16} color={theme.gold} />
                      <Text style={styles.attachTitle}>Invite the property owner</Text>
                    </View>
                    <Text style={styles.attachHint}>
                      Enter the owner's name and email. We will create a secure wallet for them and send a confirmation link. The listing goes live once they confirm.
                    </Text>
                    <View style={styles.attachFieldGroup}>
                      <TextInput
                        style={styles.attachInput}
                        placeholder="Owner's full name"
                        placeholderTextColor="#9ca3af"
                        value={ownerName}
                        onChangeText={setOwnerName}
                        autoCapitalize="words"
                      />
                      <TextInput
                        style={styles.attachInput}
                        placeholder="Owner's email address"
                        placeholderTextColor="#9ca3af"
                        value={ownerEmail}
                        onChangeText={setOwnerEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={[styles.attachBtn, (!ownerName.trim() || !ownerEmail.trim()) && { opacity: 0.4 }]}
                        onPress={sendOwnerInvite}
                        disabled={!ownerName.trim() || !ownerEmail.trim()}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="send-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.attachBtnText}>Send Invitation</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Pending purchase requests */}
            {pendingReqs.length > 0 && (
              <View style={styles.requestsSection}>
                <Text style={styles.requestsTitle}>
                  {pendingReqs.length} Purchase Request{pendingReqs.length !== 1 ? 's' : ''}
                </Text>
                {pendingReqs.map(req => (
                  <View key={req.id} style={styles.reqCard}>
                    <View style={styles.reqCardTop}>
                      <View style={styles.reqAvatar}>
                        <Text style={styles.reqAvatarText}>{req.buyerName[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqBuyer}>{req.buyerName}</Text>
                        <Text style={styles.reqAddr}>{req.buyerAddress}</Text>
                      </View>
                      <Text style={styles.reqTime}>{req.requestedAt}</Text>
                    </View>

                    {!canCreateDeal && (
                      <View style={styles.reqBlockedNote}>
                        <Ionicons name="warning-outline" size={13} color="#92400e" />
                        <Text style={styles.reqBlockedText}>Owner must confirm their email invitation before you can create a deal</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.createDealBtn,
                        (!canCreateDeal || creatingDealId === req.id) && { opacity: 0.45 },
                      ]}
                      onPress={() => createEscrowDeal(req)}
                      disabled={!canCreateDeal || creatingDealId != null}
                      activeOpacity={0.85}
                    >
                      {creatingDealId === req.id
                        ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                        : <Ionicons name="lock-closed-outline" size={15} color="#fff" style={{ marginRight: 6 }} />}
                      <Text style={styles.createDealBtnText}>
                        {creatingDealId === req.id ? 'Creating deal on-chain…' : 'Create Escrow Deal'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Active deals — waiting for buyer to fund */}
            {activeDeals.length > 0 && (
              <View style={[styles.requestsSection, pendingReqs.length > 0 && { marginTop: 4 }]}>
                {pendingReqs.length === 0 && (
                  <Text style={styles.requestsTitle}>Active Deals</Text>
                )}
                {activeDeals.map(deal => (
                  <View key={deal.id} style={styles.activeDealCard}>
                    <View style={styles.activeDealTop}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeDealLabel}>Waiting for buyer to fund</Text>
                    </View>
                    <Text style={styles.activeDealMeta}>Deal #{deal.dealId} · {deal.buyerName}</Text>
                    <Text style={styles.activeDealAddr}>{deal.buyerAddress}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Empty state */}
            {pendingReqs.length === 0 && activeDeals.length === 0 && (
              <View style={styles.emptyReqs}>
                <Ionicons name="time-outline" size={22} color="#d1d5db" />
                <Text style={styles.emptyReqsText}>No purchase requests yet</Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            BUYER PANEL
            Shows state-specific cards when viewing someone else's listing.
        ═══════════════════════════════════════════════════════════ */}
        {!isOwner && (
          <View style={{ gap: 12 }}>
            {/* SOLD */}
            {listing.status === 'sold' && (
              <View style={styles.soldCard}>
                <Ionicons name="close-circle-outline" size={22} color="#dc2626" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.soldTitle}>This item has been sold</Text>
                  <Text style={styles.soldSub}>It is no longer available for purchase.</Text>
                </View>
              </View>
            )}

            {/* FUNDED */}
            {listing.status !== 'sold' && purchaseStatus === 'funded' && (
              <View style={styles.fundedCard}>
                <Ionicons name="checkmark-circle" size={22} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fundedTitle}>Escrow funded</Text>
                  <Text style={styles.fundedSub}>Your payment is secured in the smart contract. The deal will close shortly.</Text>
                </View>
              </View>
            )}

            {/* DEAL CREATED — fund now */}
            {listing.status !== 'sold' && purchaseStatus === 'deal_created' && (
              <View style={styles.dealReadyCard}>
                <View style={styles.dealReadyTop}>
                  <Ionicons name="alert-circle-outline" size={18} color="#92400e" />
                  <Text style={styles.dealReadyTitle}>Escrow deal is ready — fund it now</Text>
                </View>
                <Text style={styles.dealReadySub}>
                  The agent has created your escrow deal on-chain. Approve and fund it to secure the purchase.
                </Text>
                <View style={styles.dealMeta}>
                  <DealMetaRow label="Deal" value="#42" />
                  <DealMetaRow label="Amount" value={`$${listing.price_usdc} USDC`} />
                </View>
                {/* Demo advance button */}
                <TouchableOpacity style={styles.demoBtn} onPress={() => setPurchaseStatus(null)}>
                  <Text style={styles.demoBtnText}>↩ Reset demo state</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* REQUESTED — waiting */}
            {listing.status !== 'sold' && purchaseStatus === 'requested' && (
              <View style={styles.waitingCard}>
                <View style={styles.waitingTop}>
                  <Ionicons name="time-outline" size={18} color="#374151" />
                  <Text style={styles.waitingTitle}>Purchase requested</Text>
                </View>
                <Text style={styles.waitingSub}>
                  The agent is reviewing your request and will create your escrow deal on-chain. You will be notified when it is ready to fund.
                </Text>
                {/* Demo advance button */}
                <TouchableOpacity style={styles.demoBtn} onPress={() => setPurchaseStatus('deal_created')}>
                  <Text style={styles.demoBtnText}>▶ Simulate: agent creates deal</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Agent card */}
        <View style={[styles.section, { marginTop: 20 }]}>
          <Text style={styles.sectionTitle}>Listing Agent</Text>
          <View style={styles.agentCard}>
            <View style={styles.agentAvatar}>
              <Text style={styles.agentInitial}>{(listing.agent_name ?? '?')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.agentName}>{listing.agent_name ?? 'Agent'}</Text>
                {listing.agent_kyc === 'verified' && (
                  <View style={styles.kycBadge}>
                    <Ionicons name="shield-checkmark" size={11} color={theme.gold} />
                    <Text style={styles.kycText}>KYC Verified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.agentSub}>Licensed HybridAgent broker</Text>
            </View>
            <TouchableOpacity style={styles.contactBtn} onPress={handleChat} disabled={openingChat}>
              {openingChat ? <ActivityIndicator size="small" color={theme.navy} /> : <Ionicons name="chatbubble-outline" size={16} color={theme.navy} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Escrow explanation */}
        <View style={styles.escrowCard}>
          <View style={styles.escrowRow}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.gold} />
            <Text style={styles.escrowTitle}>On-chain Escrow</Text>
          </View>
          <Text style={styles.escrowDesc}>
            Payment is held in a USDC smart contract and released atomically — agent commission, platform fee, and seller payout in a single on-chain step.
          </Text>
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════
          STICKY CTA BAR — adapts to every state
      ═══════════════════════════════════════════════════════════ */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>

        {/* ── OWNER view ── */}
        {isOwner && (
          <View style={styles.ownerCtaRow}>
            <Ionicons name="eye-outline" size={16} color="#6b7280" />
            <Text style={styles.ownerCtaText}>
              {pendingReqs.length > 0
                ? `${pendingReqs.length} request${pendingReqs.length > 1 ? 's' : ''} waiting for your action`
                : activeDeals.length > 0
                ? 'Waiting for buyer to fund the deal'
                : 'Your listing is live and visible to buyers'}
            </Text>
          </View>
        )}

        {/* ── SOLD ── */}
        {!isOwner && listing.status === 'sold' && (
          <View style={styles.soldCtaRow}>
            <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
            <Text style={styles.soldCtaText}>This item has been sold</Text>
          </View>
        )}

        {/* ── FUNDED ── */}
        {!isOwner && listing.status !== 'sold' && purchaseStatus === 'funded' && (
          <View style={styles.fundedCtaRow}>
            <Ionicons name="checkmark-circle" size={16} color="#059669" />
            <Text style={styles.fundedCtaText}>Escrow funded — your payment is secured</Text>
          </View>
        )}

        {/* ── DEAL CREATED: fund it ── */}
        {!isOwner && listing.status !== 'sold' && purchaseStatus === 'deal_created' && (
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              style={styles.fundBtn}
              activeOpacity={0.85}
              onPress={() => nav.navigate('EscrowConfirm', { listingId: listing.id })}
            >
              <Ionicons name="lock-closed-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.fundBtnText}>Fund Escrow · ${listing.price_usdc} USDC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chatBtnRow} onPress={handleChat} disabled={openingChat}>
              {openingChat ? <ActivityIndicator size="small" color={theme.navy} style={{ marginRight: 6 }} /> : <Ionicons name="chatbubble-outline" size={15} color={theme.navy} style={{ marginRight: 6 }} />}
              <Text style={styles.chatBtnRowText}>Chat with agent</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── REQUESTED: waiting ── */}
        {!isOwner && listing.status !== 'sold' && purchaseStatus === 'requested' && (
          <View style={{ gap: 8 }}>
            <View style={styles.waitCtaRow}>
              <Ionicons name="time-outline" size={15} color="#6b7280" />
              <Text style={styles.waitCtaText}>Waiting for the agent to set up your escrow deal</Text>
            </View>
            <TouchableOpacity style={styles.chatBtnRow} onPress={handleChat} disabled={openingChat}>
              {openingChat ? <ActivityIndicator size="small" color={theme.navy} style={{ marginRight: 6 }} /> : <Ionicons name="chatbubble-outline" size={15} color={theme.navy} style={{ marginRight: 6 }} />}
              <Text style={styles.chatBtnRowText}>Chat with agent</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── DEFAULT: buy now ── */}
        {!isOwner && listing.status !== 'sold' && purchaseStatus === null && (
          <View style={{ gap: 8 }}>
            <View style={styles.ctaTopRow}>
              <View>
                <Text style={styles.ctaTotalLabel}>Total</Text>
                <Text style={styles.ctaTotalValue}>${listing.price_usdc} USDC</Text>
              </View>
              <TouchableOpacity style={styles.chatIconBtn} onPress={handleChat} disabled={openingChat}>
                {openingChat ? <ActivityIndicator size="small" color={theme.navy} /> : <Ionicons name="chatbubble-outline" size={18} color={theme.navy} />}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.buyBtn} activeOpacity={0.85} onPress={() => setShowBuyModal(true)}>
              <Ionicons name="cart-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.buyBtnText}>Buy Now</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════
          BUY NOW MODAL — price review + request purchase
      ═══════════════════════════════════════════════════════════ */}
      <Modal
        visible={showBuyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBuyModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBuyModal(false)}>
          <Pressable style={[styles.buySheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Request Purchase</Text>

            {/* Listing summary */}
            <View style={styles.sheetSummary}>
              <View style={[styles.sheetThumb, { backgroundColor: isProperty ? (theme.navy === '#0c2340' ? '#e8f0fe' : theme.navyCard) : (theme.gold + '22') }]}>
                <Ionicons
                  name={isProperty ? 'business-outline' : 'car-outline'}
                  size={22}
                  color={isProperty ? (theme.navy === '#0c2340' ? theme.navy : '#fff') : theme.gold}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetListingTitle} numberOfLines={2}>{listing.title}</Text>
                <Text style={styles.sheetListingLoc}>{listing.asset_type.toUpperCase()}</Text>
              </View>
            </View>

            {/* Price breakdown */}
            <View style={styles.sheetBreakdown}>
              <SheetRow label="You pay"    value={`$${listing.price_usdc} USDC`} />
              {listing.listing_type === 'agent_brokered' && listing.commission_bps != null && (
                <>
                  <View style={styles.sheetDivider} />
                  <SheetRow label={`Agent commission (${commPct}%)`} value={`$${agentFee.toLocaleString()}`}   />
                  <SheetRow label="Platform fee (1%)"               value={`$${platformFee.toLocaleString()}`} />
                  <SheetRow label="To seller"                        value={`$${sellerAmt.toLocaleString()}`}   bold />
                </>
              )}
            </View>

            {/* Explanation note */}
            <View style={styles.sheetNote}>
              <Ionicons name="information-circle-outline" size={15} color="#6b7280" />
              <Text style={styles.sheetNoteText}>
                The agent will create your escrow deal on-chain. You will fund it once it is ready.
              </Text>
            </View>

            <TouchableOpacity style={styles.sheetConfirmBtn} activeOpacity={0.85} onPress={requestPurchase}>
              <Text style={styles.sheetConfirmText}>Request Purchase</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowBuyModal(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SpecChip({ icon, value }: { icon: string; value: string }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.specChip}>
      <Ionicons name={icon as any} size={14} color={theme.gold} />
      <Text style={styles.specChipText}>{value}</Text>
    </View>
  );
}

function BreakdownRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, bold && { fontWeight: '700', color: theme.text }]}>{label}</Text>
      <Text style={[styles.breakdownValue, bold && { fontWeight: '800', color: theme.navy }]}>{value}</Text>
    </View>
  );
}

function DealMetaRow({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.dealMetaRow}>
      <Text style={styles.dealMetaLabel}>{label}</Text>
      <Text style={styles.dealMetaValue}>{value}</Text>
    </View>
  );
}

function SheetRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.sheetRow}>
      <Text style={[styles.sheetRowLabel, bold && { fontWeight: '700', color: theme.text }]}>{label}</Text>
      <Text style={[styles.sheetRowValue, bold && { fontWeight: '800', color: theme.navy }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:  { flex: 1, backgroundColor: theme.background },
  hero:  { backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f3f4f6', paddingHorizontal: 16, paddingBottom: 0 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroImage: { height: 180, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroImg:   { width: '100%', height: '100%' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  // Tags row
  topRow:       { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  typeTag:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: theme.navy + '12', borderWidth: 1, borderColor: theme.navy + '25' },
  typeTagText:  { fontSize: 10, fontWeight: '700', color: theme.navy, letterSpacing: 0.8 },
  statusTag:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: theme.badgeSuccessBg },
  statusPending: { backgroundColor: theme.badgePendingBg },
  statusSold:    { backgroundColor: '#fee2e2' },
  statusText:   { fontSize: 10, fontWeight: '700', color: theme.successText },
  brokerTag:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, backgroundColor: theme.gold + '15', borderWidth: 1, borderColor: theme.gold + '30' },
  brokerTagText: { fontSize: 10, fontWeight: '700', color: theme.gold },

  // Title / price / location
  title:     { fontSize: 22, fontWeight: '800', color: theme.text, lineHeight: 30, marginBottom: 8 },
  priceRow:  { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  price:     { fontSize: 28, fontWeight: '900', color: theme.navy },
  priceUnit: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  locRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  locText:   { fontSize: 13, color: theme.textSecondary },

  // Spec chips
  specs:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  specChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  specChipText: { fontSize: 13, fontWeight: '600', color: theme.text },

  // Sections
  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.navy, marginBottom: 10 },
  desc:         { fontSize: 14, color: theme.textSecondary, lineHeight: 22 },

  // Commission card
  commCard:    { backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#fdf3e3', borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: theme.gold + '30' },
  commHeader:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  commTitle:   { fontSize: 13, fontWeight: '700', color: theme.badgePendingText },
  commDivider: { height: 1, backgroundColor: theme.gold + '35', marginVertical: 8 },
  breakdownRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  breakdownLabel: { fontSize: 12, color: theme.textSecondary },
  breakdownValue: { fontSize: 12, color: theme.text, fontWeight: '600' },

  // ── OWNER PANEL ──
  ownerPanel:      { backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f8faff', borderRadius: 18, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: theme.navy + '18', gap: 14 },
  ownerBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ownerBannerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.navy + '10', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ownerBannerTitle: { fontSize: 15, fontWeight: '800', color: theme.navy, marginBottom: 2 },
  ownerBannerSub:   { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },

  // Attach owner wallet
  attachCard:   { backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 10 },
  attachHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  attachTitle:  { fontSize: 13, fontWeight: '700', color: theme.badgePendingText },
  attachHint:   { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  attachFieldGroup: { gap: 8 },
  attachInput:  { borderWidth: 1.5, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: theme.text, backgroundColor: theme.inputBg },
  attachBtn:    { backgroundColor: theme.navy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  attachBtnText: { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 13 },
  attachConfirmedNote: { fontSize: 11, color: theme.textSecondary, lineHeight: 16 },

  // Owner confirmed state
  ownerConfirmedRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.badgeSuccessBg, borderRadius: 10, padding: 10 },
  ownerConfirmedAvatar:  { width: 34, height: 34, borderRadius: 17, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  ownerConfirmedInitial: { fontSize: 14, fontWeight: '800', color: '#fff' },
  ownerConfirmedName:    { fontSize: 13, fontWeight: '700', color: theme.successText },
  ownerConfirmedEmail:   { fontSize: 11, color: theme.textSecondary, marginTop: 1 },

  // Pending email state
  pendingEmailBox:  { backgroundColor: theme.badgePendingBg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.gold },
  pendingEmailName: { fontSize: 13, fontWeight: '700', color: theme.badgePendingText },
  pendingEmailAddr: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

  // Requests
  requestsSection: { gap: 10 },
  requestsTitle:   { fontSize: 13, fontWeight: '700', color: theme.navy },
  reqCard:    { backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 10 },
  reqCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqAvatar:  { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.navy, alignItems: 'center', justifyContent: 'center' },
  reqAvatarText: { fontSize: 14, fontWeight: '800', color: theme.background === '#121212' ? '#121212' : '#fff' },
  reqBuyer:   { fontSize: 14, fontWeight: '700', color: theme.text },
  reqAddr:    { fontSize: 11, color: theme.textSecondary, fontFamily: 'monospace' },
  reqTime:    { fontSize: 11, color: theme.textSecondary },
  reqBlockedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.badgePendingBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  reqBlockedText: { fontSize: 12, color: theme.badgePendingText, flex: 1, lineHeight: 16 },
  createDealBtn: { backgroundColor: theme.navy, borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  createDealBtnText: { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 14 },

  // Active deals
  activeDealCard: { backgroundColor: theme.badgeSuccessBg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border, gap: 4 },
  activeDealTop:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  activeDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.green },
  activeDealLabel: { fontSize: 13, fontWeight: '700', color: theme.successText },
  activeDealMeta:  { fontSize: 12, color: theme.text },
  activeDealAddr:  { fontSize: 11, color: theme.textSecondary, fontFamily: 'monospace' },

  // Empty requests state
  emptyReqs:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, justifyContent: 'center' },
  emptyReqsText: { fontSize: 13, color: theme.textSecondary },

  // ── BUYER CARDS ──
  soldCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fef2f2', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#fecaca' },
  soldTitle: { fontSize: 14, fontWeight: '700', color: '#dc2626', marginBottom: 2 },
  soldSub:   { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },

  fundedCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: theme.badgeSuccessBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  fundedTitle: { fontSize: 14, fontWeight: '700', color: theme.successText, marginBottom: 2 },
  fundedSub:   { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },

  dealReadyCard: { backgroundColor: theme.badgePendingBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.gold, gap: 8 },
  dealReadyTop:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dealReadyTitle: { fontSize: 14, fontWeight: '700', color: theme.badgePendingText, flex: 1 },
  dealReadySub:   { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  dealMeta:       { backgroundColor: theme.card, borderRadius: 10, padding: 10, gap: 4 },
  dealMetaRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  dealMetaLabel:  { fontSize: 12, color: theme.badgePendingText },
  dealMetaValue:  { fontSize: 12, fontWeight: '700', color: theme.badgePendingText },

  waitingCard: { backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 8 },
  waitingTop:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  waitingTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  waitingSub:   { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },

  // Demo state-advance button (dev only)
  demoBtn:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.border, marginTop: 4 },
  demoBtnText: { fontSize: 11, color: theme.text, fontWeight: '600' },

  // Agent card
  agentCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  agentAvatar:  { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.navy, alignItems: 'center', justifyContent: 'center' },
  agentInitial: { fontSize: 17, fontWeight: '800', color: theme.background === '#121212' ? '#121212' : '#fff' },
  agentName:    { fontSize: 15, fontWeight: '700', color: theme.text },
  agentSub:     { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  kycBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.gold + '18', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  kycText:      { fontSize: 10, fontWeight: '700', color: theme.gold },
  contactBtn:   { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },

  // Escrow card
  escrowCard: { backgroundColor: theme.navyCard, borderRadius: 16, padding: 16, marginBottom: 8 },
  escrowRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  escrowTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  escrowDesc:  { fontSize: 13, color: '#94a3b8', lineHeight: 20 },

  // ── STICKY CTA BAR ──
  ctaBar: { backgroundColor: theme.card, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border },

  // Owner CTA
  ownerCtaRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  ownerCtaText: { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18 },

  // Sold CTA
  soldCtaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  soldCtaText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },

  // Funded CTA
  fundedCtaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  fundedCtaText: { fontSize: 13, fontWeight: '600', color: theme.successText, flex: 1 },

  // Fund escrow button
  fundBtn:     { backgroundColor: '#d97706', borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fundBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Chat row (secondary)
  chatBtnRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: theme.border },
  chatBtnRowText: { fontSize: 14, fontWeight: '600', color: theme.navy },

  // Waiting CTA
  waitCtaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  waitCtaText: { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18 },

  // Default buy CTA
  ctaTopRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctaTotalLabel: { fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  ctaTotalValue: { fontSize: 20, fontWeight: '900', color: theme.navy },
  chatIconBtn:   { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  buyBtn:        { backgroundColor: theme.navy, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buyBtnText:    { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 16 },

  // ── BUY SHEET (modal) ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  buySheet:     { backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 16 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:   { fontSize: 20, fontWeight: '800', color: theme.navy, marginBottom: 16 },

  sheetSummary:      { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  sheetThumb:        { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetListingTitle: { fontSize: 14, fontWeight: '700', color: theme.text, lineHeight: 19 },
  sheetListingLoc:   { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

  sheetBreakdown: { backgroundColor: theme.background, borderRadius: 14, padding: 14, gap: 4, marginBottom: 14, borderWidth: 1, borderColor: theme.border },
  sheetRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  sheetRowLabel:  { fontSize: 13, color: theme.textSecondary },
  sheetRowValue:  { fontSize: 13, fontWeight: '600', color: theme.text },
  sheetDivider:   { height: 1, backgroundColor: theme.border, marginVertical: 4 },

  sheetNote:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: theme.background, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  sheetNoteText: { fontSize: 12, color: theme.textSecondary, flex: 1, lineHeight: 17 },

  sheetConfirmBtn:  { backgroundColor: theme.navy, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  sheetConfirmText: { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 16 },
  sheetCancelBtn:   { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  sheetCancelText:  { fontSize: 15, color: theme.textSecondary, fontWeight: '600' },
});
