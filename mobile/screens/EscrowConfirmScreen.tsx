import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  StatusBar, Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { api, type Listing, type WalletData } from '../lib/api';
import { storage } from '../lib/storage';
import { buyListing, ethersId, ZeroAddress } from '../lib/contracts';

const NAVY  = '#0c2340';
const GOLD  = '#c9912a';
const GREEN = '#22c55e';
const RED   = '#ef4444';

// Platform fee: 100 bps = 1%
const PLATFORM_FEE_BPS = 100;

type Step = 'review' | 'wallet' | 'executing' | 'done' | 'error';

type ExecPhase =
  | { id: 'idle' }
  | { id: 'approving' }
  | { id: 'approved' }
  | { id: 'funding' }
  | { id: 'funded'; txHash: string };

type EscrowRoute = RouteProp<RootStackParamList, 'EscrowConfirm'>;

export default function EscrowConfirmScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route  = useRoute<EscrowRoute>();

  const [listing, setListing] = useState<Listing | null>(null);
  const [wallet,  setWallet]  = useState<WalletData | null>(null);

  useEffect(() => {
    api.listing(route.params.listingId).then(setListing).catch(() => {});
    api.wallet().then(setWallet).catch(() => {});
  }, [route.params.listingId]);

  const [step, setStep]         = useState<Step>('review');
  const [phase, setPhase]       = useState<ExecPhase>({ id: 'idle' });
  const [errorMsg, setErrorMsg] = useState('');

  // Animated checkmark scale for success
  const checkScale = useRef(new Animated.Value(0)).current;
  const progressW  = useRef(new Animated.Value(0)).current;

  // ── Derived amounts ──────────────────────────────────────────────────────
  const rawPrice      = listing ? parseFloat(String(listing.price_usdc).replace(/,/g, '')) : 0;
  const agentCommBps  = listing?.commission_bps ?? 0;
  const agentFee      = parseFloat(((rawPrice * agentCommBps) / 10000).toFixed(2));
  const platFee       = parseFloat(((rawPrice * PLATFORM_FEE_BPS) / 10000).toFixed(2));
  const sellerAmt     = parseFloat((rawPrice - agentFee - platFee).toFixed(2));
  const totalDue      = rawPrice;
  const walletUsdc    = wallet ? parseFloat(wallet.balanceUsdc) : 0;
  const walletAddress = wallet?.address ?? '';
  const hasBalance    = walletUsdc >= totalDue;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shortAddr = (a: string) => `${a.slice(0, 6)}···${a.slice(-4)}`;

  // ── Execution flow ───────────────────────────────────────────────────────
  const runExecution = async () => {
    if (!listing) return;
    setStep('executing');
    setPhase({ id: 'approving' });
    Animated.timing(progressW, { toValue: 0.25, duration: 500, useNativeDriver: false }).start();

    try {
      // Fetch embedded-wallet private key from backend (custodial MVP)
      const { privateKey } = await api.walletKey();

      setPhase({ id: 'approved' });
      Animated.timing(progressW, { toValue: 0.5, duration: 400, useNativeDriver: false }).start();
      await new Promise(r => setTimeout(r, 350));

      setPhase({ id: 'funding' });
      Animated.timing(progressW, { toValue: 0.75, duration: 500, useNativeDriver: false }).start();

      // bytes32 listing ref: use stored value or derive from listing id
      const listingRef = listing.listing_ref ?? ethersId(listing.id);
      const isAgentBrokered = listing.listing_type === 'agent_brokered';
      const seller = listing.owner_address ?? listing.agent_address ?? walletAddress;
      const agent  = isAgentBrokered
        ? (listing.agent_address ?? ZeroAddress)
        : ZeroAddress;
      // price_usdc is stored in human-readable USDC (e.g. 50000) → convert to 6-decimal base units
      const priceBaseUnits = String(BigInt(Math.round(rawPrice * 1_000_000)));

      const { dealId, txHash } = await buyListing({
        privateKey,
        listingRef,
        seller,
        agent,
        commissionBps: listing.commission_bps,
        priceUsdc: priceBaseUnits,
      });

      // Record the on-chain deal in the backend
      const myUser = await storage.getUser();
      if (myUser?.id) {
        await api.recordDeal(listing.id, String(myUser.id), dealId).catch(() => {});
      }

      Animated.timing(progressW, { toValue: 1, duration: 400, useNativeDriver: false }).start(() => {
        setPhase({ id: 'funded', txHash });
        setStep('done');
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 70, friction: 8 }).start();
      });
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Transaction failed. Please try again.');
      setStep('error');
    }
  };

  if (!listing) return null;

  const STEPS: Step[] = ['review', 'wallet', 'executing'];
  const stepIdx = STEPS.indexOf(step === 'done' || step === 'error' ? 'executing' : step);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => nav.goBack()}
          disabled={step === 'executing'}
        >
          <Ionicons name={step === 'done' ? 'close' : 'arrow-back'} size={20} color={step === 'executing' ? '#d1d5db' : NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'review'    ? 'Review Deal'
           : step === 'wallet'  ? 'Confirm Wallet'
           : step === 'executing' ? 'Processing…'
           : step === 'done'    ? 'Deal Funded ✓'
           : 'Error'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Step dots */}
      {step !== 'done' && step !== 'error' && (
        <View style={styles.dotRow}>
          {['Review', 'Wallet', 'Escrow'].map((l, i) => (
            <React.Fragment key={l}>
              <View style={styles.dotItem}>
                <View style={[styles.dot, i <= stepIdx && styles.dotActive, i < stepIdx && styles.dotDone]}>
                  {i < stepIdx
                    ? <Ionicons name="checkmark" size={11} color="#fff" />
                    : <Text style={[styles.dotNum, i <= stepIdx && { color: '#fff' }]}>{i + 1}</Text>}
                </View>
                <Text style={[styles.dotLabel, i === stepIdx && styles.dotLabelActive]}>{l}</Text>
              </View>
              {i < 2 && <View style={[styles.dotLine, i < stepIdx && styles.dotLineDone]} />}
            </React.Fragment>
          ))}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEnabled={step !== 'executing'}
      >

        {/* ── STEP 1: REVIEW ─────────────────────────────────────────── */}
        {step === 'review' && (
          <View>
            {/* Listing summary */}
            <View style={styles.listingCard}>
              <View style={[styles.listingThumb, { backgroundColor: listing.asset_type === 'property' ? '#e8f0fe' : '#fef3c7' }]}>
                <Ionicons
                  name={listing.asset_type === 'property' ? 'business-outline' : 'car-sport-outline'}
                  size={28}
                  color={listing.asset_type === 'property' ? NAVY : GOLD}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listingType}>{listing.asset_type.toUpperCase()}</Text>
                <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="location-outline" size={12} color="#9ca3af" />
                  <Text style={styles.listingLoc}>{listing.asset_type.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            {/* Price breakdown */}
            <Text style={styles.sectionLabel}>Payment breakdown</Text>
            <View style={styles.breakdownCard}>
              <BreakdownRow label="Listing price" value={`$${fmt(rawPrice)}`} />
              <View style={styles.breakdownDivider} />
              <BreakdownRow
                label={`Agent commission (${agentCommBps / 100}%)`}
                value={`$${fmt(agentFee)}`}
                sub="Paid to broker on settlement"
                muted
              />
              <BreakdownRow
                label={`Platform fee (${PLATFORM_FEE_BPS / 100}%)`}
                value={`$${fmt(platFee)}`}
                sub="HybridAgent service fee"
                muted
              />
              <BreakdownRow
                label="Seller receives"
                value={`$${fmt(sellerAmt)}`}
                sub="After fees on settlement"
                muted
              />
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalLabel}>You send to escrow</Text>
                  <Text style={styles.totalSub}>Released atomically on completion</Text>
                </View>
                <Text style={styles.totalAmount}>${fmt(totalDue)}</Text>
              </View>
            </View>

            {/* Agent card */}
            <Text style={styles.sectionLabel}>Agent</Text>
            <View style={styles.agentCard}>
              <View style={styles.agentAvatar}>
                <Text style={styles.agentInitial}>{(listing.agent_name ?? '?')[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.agentName}>{listing.agent_name ?? 'Agent'}</Text>
                  {listing.agent_kyc === 'verified' && (
                    <View style={styles.kycPill}>
                      <Ionicons name="shield-checkmark" size={10} color={GOLD} />
                      <Text style={styles.kycPillText}>KYC</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.agentSub}>Commission guaranteed on-chain</Text>
              </View>
              <Text style={styles.agentComm}>${fmt(agentFee)} <Text style={{ fontSize: 11, fontWeight: '500', color: '#9ca3af' }}>USDC</Text></Text>
            </View>

            {/* Escrow explanation */}
            <View style={styles.escrowInfo}>
              <Ionicons name="lock-closed-outline" size={16} color={GOLD} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.escrowInfoTitle}>How escrow works</Text>
                {[
                  'Your USDC is locked in the smart contract — nobody can spend it.',
                  'When you confirm receipt of the asset, funds are released atomically.',
                  'If there is a dispute, an arbiter resolves it on-chain.',
                  'If 30 days pass with no action, you can reclaim your funds.',
                ].map(t => (
                  <View key={t} style={{ flexDirection: 'row', gap: 6 }}>
                    <Text style={styles.escrowBullet}>·</Text>
                    <Text style={styles.escrowInfoText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={() => setStep('wallet')} activeOpacity={0.85}>
              <Text style={styles.btnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 7 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: WALLET ─────────────────────────────────────────── */}
        {step === 'wallet' && (
          <View>
            {/* Balance card */}
            <View style={[styles.walletCard, !hasBalance && styles.walletCardInsuff]}>
              <View style={styles.walletCardTop}>
                <View style={styles.walletIcon}>
                  <Ionicons name="wallet-outline" size={20} color={hasBalance ? GOLD : RED} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletLabel}>Paying from</Text>
                  <Text style={styles.walletAddr}>{walletAddress ? shortAddr(walletAddress) : 'Loading…'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.walletBalLabel}>Balance</Text>
                  <Text style={[styles.walletBal, !hasBalance && { color: RED }]}>
                    ${fmt(walletUsdc)} USDC
                  </Text>
                </View>
              </View>

              {hasBalance ? (
                <View style={styles.balOkRow}>
                  <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                  <Text style={styles.balOkText}>
                    Sufficient balance · ${fmt(walletUsdc - totalDue)} USDC remaining after
                  </Text>
                </View>
              ) : (
                <View style={styles.balErrRow}>
                  <Ionicons name="alert-circle-outline" size={15} color={RED} />
                  <Text style={styles.balErrText}>
                    Insufficient balance. Need ${fmt(totalDue - walletUsdc)} more USDC.
                  </Text>
                </View>
              )}
            </View>

            {/* What will happen */}
            <Text style={styles.sectionLabel}>What happens next</Text>
            <View style={styles.stepsCard}>
              <TxStep n={1} title="Approve USDC spend" desc={`Sign a transaction allowing the escrow contract to spend $${fmt(totalDue)} USDC from your wallet.`} />
              <TxStep n={2} title="Fund the escrow" desc="A second transaction locks your USDC in the HybridEscrow contract and creates the deal on-chain." />
              <TxStep n={3} title="Confirm on completion" desc="Once you've received the asset, confirm on-chain and all parties are paid atomically." last />
            </View>

            {/* Gas note */}
            <View style={styles.gasNote}>
              <Ionicons name={"diamond-outline" as any} size={14} color="#9ca3af" />
              <Text style={styles.gasNoteText}>Two transactions required · ~0.0008 ETH in gas · ensure your wallet has ETH</Text>
            </View>

            {hasBalance ? (
              <TouchableOpacity style={styles.btnPrimary} onPress={runExecution} activeOpacity={0.85}>
                <Ionicons name="lock-closed-outline" size={16} color="#fff" style={{ marginRight: 7 }} />
                <Text style={styles.btnText}>Approve & Fund Escrow</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.btnDanger} onPress={() => { nav.goBack(); nav.navigate('Wallet'); }} activeOpacity={0.85}>
                  <Text style={styles.btnDangerText}>Top up wallet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={() => nav.goBack()}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── STEP 3: EXECUTING ──────────────────────────────────────── */}
        {step === 'executing' && (
          <View style={styles.execContainer}>
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[styles.progressFill, { width: progressW.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
              />
            </View>

            {/* Phase steps */}
            <View style={styles.phaseList}>
              <PhaseRow
                label="Approve USDC spend"
                state={phase.id === 'approving' ? 'active' : phase.id === 'idle' ? 'waiting' : 'done'}
              />
              <PhaseRow
                label="Fund escrow contract"
                state={phase.id === 'funding' ? 'active' : phase.id === 'funded' ? 'done' : 'waiting'}
              />
              <PhaseRow
                label="Deal created on-chain"
                state={phase.id === 'funded' ? 'done' : 'waiting'}
              />
            </View>

            <Text style={styles.execNote}>
              {phase.id === 'approving'  ? 'Waiting for USDC approval signature…'
               : phase.id === 'approved' ? 'Approval confirmed. Funding escrow…'
               : phase.id === 'funding'  ? 'Broadcasting escrow transaction…'
               : 'Confirming on chain…'}
            </Text>
            <Text style={styles.execSub}>Do not close this screen.</Text>
          </View>
        )}

        {/* ── ERROR ──────────────────────────────────────────────────── */}
        {step === 'error' && (
          <View style={styles.successContainer}>
            <Ionicons name="close-circle" size={64} color={RED} />
            <Text style={[styles.successTitle, { color: RED }]}>Transaction failed</Text>
            <Text style={[styles.successSub, { color: '#6b7280' }]}>{errorMsg}</Text>
            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 24 }]} onPress={() => {
              setStep('wallet');
              setPhase({ id: 'idle' });
              progressW.setValue(0);
              setErrorMsg('');
            }} activeOpacity={0.85}>
              <Text style={styles.btnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnGhost} onPress={() => nav.goBack()}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── DONE ────────────────────────────────────────────────────── */}
        {step === 'done' && phase.id === 'funded' && (
          <View style={styles.successContainer}>
            <Animated.View style={[styles.successRing, { transform: [{ scale: checkScale }] }]}>
              <Ionicons name="checkmark-circle" size={64} color={GREEN} />
            </Animated.View>

            <Text style={styles.successTitle}>Escrow funded!</Text>
            <Text style={styles.successSub}>
              Your USDC is locked in the smart contract. The deal is live on-chain.
            </Text>

            {/* Deal summary */}
            <View style={styles.dealCard}>
              <View style={styles.dealRow}>
                <Text style={styles.dealLabel}>Asset</Text>
                <Text style={styles.dealValue} numberOfLines={1}>{listing.title}</Text>
              </View>
              <View style={styles.dealRow}>
                <Text style={styles.dealLabel}>Amount locked</Text>
                <Text style={[styles.dealValue, { color: NAVY, fontWeight: '800' }]}>${fmt(totalDue)} USDC</Text>
              </View>
              <View style={styles.dealRow}>
                <Text style={styles.dealLabel}>Transaction</Text>
                <Text style={[styles.dealValue, { fontFamily: 'monospace', fontSize: 12 }]}>{phase.txHash.slice(0, 18)}…</Text>
              </View>
              <View style={[styles.dealRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.dealLabel}>Status</Text>
                <View style={styles.dealStatusPill}>
                  <View style={styles.dealStatusDot} />
                  <Text style={styles.dealStatusText}>Awaiting asset delivery</Text>
                </View>
              </View>
            </View>

            {/* Next steps */}
            <View style={styles.nextSteps}>
              <Text style={styles.nextStepsTitle}>What's next</Text>
              {[
                { icon: 'cube-outline',        text: 'The seller will arrange delivery of the asset.' },
                { icon: 'checkmark-circle-outline', text: 'Once you receive it, confirm on-chain to release funds.' },
                { icon: 'shield-outline',      text: 'If anything goes wrong, open a dispute.' },
              ].map(n => (
                <View key={n.text} style={styles.nextRow}>
                  <Ionicons name={n.icon as any} size={15} color={GOLD} style={{ marginTop: 1 }} />
                  <Text style={styles.nextText}>{n.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={() => { nav.goBack(); nav.goBack(); }} activeOpacity={0.85}>
              <Text style={styles.btnText}>Back to Listing</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnGhost} onPress={() => nav.navigate('Main')}>
              <Text style={styles.btnGhostText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BreakdownRow({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <View style={styles.breakdownRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.breakdownLabel, muted && { color: '#9ca3af' }]}>{label}</Text>
        {sub && <Text style={styles.breakdownSub}>{sub}</Text>}
      </View>
      <Text style={[styles.breakdownValue, muted && { color: '#9ca3af', fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

function TxStep({ n, title, desc, last }: { n: number; title: string; desc: string; last?: boolean }) {
  return (
    <View style={[styles.txStep, !last && styles.txStepBorder]}>
      <View style={styles.txStepNum}>
        <Text style={styles.txStepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txStepTitle}>{title}</Text>
        <Text style={styles.txStepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function PhaseRow({ label, state }: { label: string; state: 'waiting' | 'active' | 'done' }) {
  return (
    <View style={styles.phaseRow}>
      <View style={[styles.phaseIcon, state === 'active' && styles.phaseIconActive, state === 'done' && styles.phaseIconDone]}>
        {state === 'done'
          ? <Ionicons name="checkmark" size={13} color="#fff" />
          : state === 'active'
          ? <ActivityIndicator size="small" color="#fff" />
          : <View style={styles.phaseWaitDot} />}
      </View>
      <Text style={[styles.phaseLabel, state === 'active' && styles.phaseLabelActive, state === 'done' && styles.phaseLabelDone]}>
        {label}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  closeBtn:    { width: 38, height: 38, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: NAVY },

  dotRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dotItem: { alignItems: 'center', gap: 4 },
  dot:     { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: NAVY },
  dotDone:   { backgroundColor: GREEN },
  dotNum:    { fontSize: 11, fontWeight: '800', color: '#9ca3af' },
  dotLabel:  { fontSize: 10, color: '#9ca3af', fontWeight: '600' },
  dotLabelActive: { color: NAVY },
  dotLine:   { flex: 1, height: 1.5, backgroundColor: '#e5e7eb', marginHorizontal: 4, marginBottom: 14 },
  dotLineDone: { backgroundColor: GREEN },

  scroll:  { paddingHorizontal: 20, paddingTop: 20 },

  // Listing card
  listingCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 20 },
  listingThumb: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  listingType:  { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.8, marginBottom: 2 },
  listingTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 3 },
  listingLoc:   { fontSize: 11, color: '#9ca3af' },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  // Breakdown
  breakdownCard:  { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 0, marginBottom: 20 },
  breakdownRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  breakdownLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  breakdownSub:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  breakdownValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  breakdownDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
  totalRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  totalLabel:     { fontSize: 15, fontWeight: '800', color: NAVY },
  totalSub:       { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  totalAmount:    { fontSize: 22, fontWeight: '900', color: NAVY },

  // Agent
  agentCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 20 },
  agentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  agentInitial: { fontSize: 16, fontWeight: '800', color: '#fff' },
  agentName:   { fontSize: 14, fontWeight: '700', color: '#111827' },
  agentSub:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  agentComm:   { fontSize: 15, fontWeight: '800', color: NAVY },
  kycPill:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: GOLD + '15', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 },
  kycPillText: { fontSize: 9, fontWeight: '800', color: GOLD },

  // Escrow info
  escrowInfo:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: NAVY + '06', borderRadius: 16, borderWidth: 1, borderColor: NAVY + '12', padding: 16, marginBottom: 24 },
  escrowInfoTitle: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 6 },
  escrowBullet:    { fontSize: 14, color: '#9ca3af', lineHeight: 20 },
  escrowInfoText:  { flex: 1, fontSize: 12, color: '#6b7280', lineHeight: 20 },

  // Wallet check
  walletCard:      { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 16, marginBottom: 20 },
  walletCardInsuff: { borderColor: RED + '50', backgroundColor: '#fff5f5' },
  walletCardTop:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  walletIcon:      { width: 42, height: 42, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  walletLabel:     { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  walletAddr:      { fontSize: 14, fontWeight: '700', color: NAVY, fontFamily: 'monospace' },
  walletBalLabel:  { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginBottom: 2 },
  walletBal:       { fontSize: 16, fontWeight: '900', color: NAVY },
  balOkRow:        { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10 },
  balOkText:       { fontSize: 12, color: '#166534', flex: 1 },
  balErrRow:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderRadius: 10, padding: 10 },
  balErrText:      { fontSize: 12, color: RED, flex: 1 },

  stepsCard:  { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 16, marginBottom: 14 },
  txStep:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  txStepBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  txStepNum:  { width: 24, height: 24, borderRadius: 12, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  txStepNumText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  txStepTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 3 },
  txStepDesc:  { fontSize: 12, color: '#6b7280', lineHeight: 18 },

  gasNote:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 20, paddingHorizontal: 4 },
  gasNoteText: { fontSize: 12, color: '#9ca3af', flex: 1 },

  // Executing
  execContainer: { alignItems: 'center', paddingTop: 16, gap: 0 },
  progressTrack: { width: '100%', height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginBottom: 32, overflow: 'hidden' },
  progressFill:  { height: 4, backgroundColor: GOLD, borderRadius: 2 },
  phaseList:     { width: '100%', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 14, marginBottom: 24 },
  phaseRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  phaseIcon:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  phaseIconActive: { backgroundColor: NAVY },
  phaseIconDone:   { backgroundColor: GREEN },
  phaseWaitDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' },
  phaseLabel:      { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  phaseLabelActive: { color: NAVY, fontWeight: '700' },
  phaseLabelDone:   { color: GREEN, fontWeight: '600' },
  execNote:  { fontSize: 15, color: NAVY, fontWeight: '600', textAlign: 'center' },
  execSub:   { fontSize: 12, color: '#9ca3af', marginTop: 4 },

  // Success
  successContainer: { alignItems: 'center', paddingTop: 8, gap: 12 },
  successRing:  { marginBottom: 8 },
  successTitle: { fontSize: 26, fontWeight: '900', color: NAVY },
  successSub:   { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
  dealCard:     { width: '100%', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 16, marginTop: 8 },
  dealRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dealLabel:    { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  dealValue:    { fontSize: 13, color: '#111827', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  dealStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD + '15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  dealStatusDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  dealStatusText: { fontSize: 11, fontWeight: '700', color: GOLD },
  nextSteps:    { width: '100%', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 12 },
  nextStepsTitle: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 4 },
  nextRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nextText:     { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },

  // Buttons
  btnPrimary:   { backgroundColor: NAVY, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, width: '100%' },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDanger:    { backgroundColor: RED, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnDangerText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnGhost:     { paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
});
