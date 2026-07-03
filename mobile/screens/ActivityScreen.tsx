import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, StatusBar,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { api, type WalletData } from '../lib/api';
import { storage } from '../lib/storage';

const NAVY  = '#0c2340';
const GOLD  = '#c9912a';
const GREEN = '#22c55e';



function shortAddr(a: string) {
  return `${a.slice(0, 6)}···${a.slice(-4)}`;
}
function fmtUsdc(n: string | number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [wallet,  setWallet]  = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState<string>('');
  const [activities, setActivities] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [walletData, user] = await Promise.all([
        api.wallet().catch(() => null),
        storage.getUser(),
      ]);
      if (walletData) setWallet(walletData);
      
      const isAgent = user?.user_type === 'agent';
      if (user?.user_type) setUserType(user.user_type);

      const [buyerReqs, agentReqs] = await Promise.all([
        api.myPurchaseRequests().catch(() => []),
        isAgent ? api.incomingRequests().catch(() => []) : Promise.resolve([])
      ]);
      const mappedBuyer = buyerReqs.map(r => ({ ...r, _type: 'buyer' }));
      const mappedAgent = agentReqs.map(r => ({ ...r, _type: 'agent' }));
      const allActs = [...mappedBuyer, ...mappedAgent].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      
      setActivities(allActs);
    } catch (_) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));



  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <TouchableOpacity style={styles.walletBtn} onPress={() => nav.navigate('Wallet')} activeOpacity={0.8}>
          <Ionicons name="wallet-outline" size={16} color={GOLD} style={{ marginRight: 5 }} />
          <Text style={styles.walletBtnText}>Full Wallet</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── WALLET CARD ───────────────────────────────────────────── */}
          <View style={styles.walletCard}>
            <View style={styles.walletCardInner}>
              {/* Address row */}
              <View style={styles.addrRow}>
                <View style={styles.addrDot} />
                <Text style={styles.addrText}>
                  {wallet?.address ? shortAddr(wallet.address) : 'No wallet'}
                </Text>
                <View style={styles.networkBadge}>
                  <Text style={styles.networkText}>Sepolia</Text>
                </View>
              </View>

              {/* Big USDC balance */}
              <Text style={styles.balanceLabel}>USDC Balance</Text>
              <Text style={styles.balanceValue}>
                ${fmtUsdc(wallet?.balanceUsdc ?? '0')}
              </Text>
              <Text style={styles.balanceCurrency}>USDC · on-chain</Text>

              {/* ETH row */}
              <View style={styles.ethRow}>
                <Ionicons name={"diamond-outline" as any} size={13} color="#94a3b8" />
                <Text style={styles.ethText}>
                  {Number(wallet?.balanceBase ?? 0).toFixed(4)} ETH gas balance
                </Text>
              </View>
            </View>

            {/* Stats strip */}
            <View style={styles.statsStrip}>
              <StatPill
                icon="briefcase-outline"
                label="Commissions"
                value={`$${fmtUsdc(wallet?.breakdown?.commissionUsdc ?? '0')}`}
              />
              <View style={styles.statsDivider} />
              <StatPill
                icon="home-outline"
                label="Proceeds"
                value={`$${fmtUsdc(wallet?.breakdown?.proceedsUsdc ?? '0')}`}
              />
              <View style={styles.statsDivider} />
              <StatPill
                icon="checkmark-done-outline"
                label="Deals"
                value={String(wallet?.completedDeals ?? 0)}
              />
            </View>
          </View>

          {/* ── ACTIVITY ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent History</Text>

            {activities.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="time-outline" size={36} color="#d1d5db" />
                <Text style={styles.emptyTitle}>No recent activity</Text>
                <Text style={styles.emptySub}>
                  Your transaction and activity history will appear here once you start using the platform.
                </Text>
              </View>
            ) : (
              <View style={styles.notifList}>
                {activities.map((item, index) => {
                  const isAgentReq = item._type === 'agent';
                  
                  let title = 'Activity';
                  let body = `Update on ${item.listing_title}`;
                  let icon = 'time-outline';
                  let iconColor = GOLD;

                  if (isAgentReq) {
                    if (item.status === 'requested') {
                      title = 'New Purchase Request';
                      body = `${item.buyer_name || 'A buyer'} wants to buy ${item.listing_title}`;
                      icon = 'person-add-outline';
                    } else if (item.status === 'approved') {
                      title = 'Waiting for Escrow';
                      body = `You approved the request for ${item.listing_title}.`;
                      icon = 'hourglass-outline';
                    } else if (item.status === 'deal_created') {
                      title = 'Escrow Created';
                      body = `Escrow deal created for ${item.listing_title}.`;
                      icon = 'shield-checkmark-outline';
                      iconColor = GREEN;
                    }
                  } else {
                    if (item.status === 'requested') {
                      title = 'Request Sent';
                      body = `You requested to buy ${item.listing_title}. Waiting for agent approval.`;
                      icon = 'paper-plane-outline';
                    } else if (item.status === 'approved') {
                      title = 'Request Approved';
                      body = `Agent approved your request for ${item.listing_title}. Waiting for escrow to be created.`;
                      icon = 'checkmark-circle-outline';
                    } else if (item.status === 'deal_created') {
                      title = 'Escrow Ready';
                      body = `Escrow is ready for ${item.listing_title}. Please fund it.`;
                      icon = 'shield-checkmark-outline';
                      iconColor = GREEN;
                    }
                  }

                  const dateStr = new Date(item.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                  return (
                    <TouchableOpacity 
                      key={item.id} 
                      style={[styles.notifRow, index < activities.length - 1 && styles.notifRowBorder]}
                      onPress={() => {
                        (nav as any).navigate('ListingsTab', { screen: 'ListingDetail', params: { id: item.listing_id } });
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.notifIcon, { backgroundColor: '#ffffff10' }]}>
                        <Ionicons name={icon as any} size={20} color={iconColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.notifTitleRow}>
                          <Text style={styles.notifTitle}>{title}</Text>
                          {item.status === 'requested' && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.notifBody}>{body}</Text>
                      </View>
                      <Text style={styles.notifTime}>{dateStr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── QUICK ACTIONS ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={styles.quickRow}>
              <QuickAction
                icon="add-circle-outline"
                label="New listing"
                onPress={() => nav.navigate('CreateListing')}
              />
              <QuickAction
                icon="wallet-outline"
                label="Wallet"
                onPress={() => nav.navigate('Wallet')}
              />
              <QuickAction
                icon="shield-checkmark-outline"
                label="KYC"
                onPress={() => nav.navigate('KYC')}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon as any} size={14} color={GOLD} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon as any} size={20} color={NAVY} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 12, color: GOLD, marginTop: 2, fontWeight: '600' },
  walletBtn:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  walletBtnText: { fontSize: 12, color: NAVY, fontWeight: '700' },

  scroll: { paddingHorizontal: 16 },

  // Wallet card
  walletCard: {
    backgroundColor: NAVY,
    borderRadius: 24,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: NAVY, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  walletCardInner: { padding: 22, paddingBottom: 16 },
  addrRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 18 },
  addrDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  addrText:   { fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', flex: 1 },
  networkBadge: { backgroundColor: '#ffffff15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  networkText:  { fontSize: 10, color: '#cbd5e1', fontWeight: '700' },

  balanceLabel:   { fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceValue:   { fontSize: 38, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -1 },
  balanceCurrency:{ fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 14 },

  ethRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ethText: { fontSize: 12, color: '#64748b' },

  statsStrip:   { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ffffff10', backgroundColor: '#0c2340' },
  statsDivider: { width: 1, backgroundColor: '#ffffff10', marginVertical: 12 },
  statPill:     { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  statValue:    { fontSize: 15, fontWeight: '800', color: '#fff' },
  statLabel:    { fontSize: 10, color: '#64748b', fontWeight: '600' },

  // Activity
  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: NAVY, marginBottom: 12 },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', padding: 32, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: NAVY, marginTop: 4 },
  emptySub:   { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19 },

  notifList: { backgroundColor: '#0d2d52', borderRadius: 16, borderWidth: 1, borderColor: '#ffffff10', overflow: 'hidden' },
  notifRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  notifRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#ffffff08' },
  notifRowUnread:  { backgroundColor: '#ffffff05' },
  notifIcon:       { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  notifTitle:      { fontSize: 14, fontWeight: '700', color: '#fff' },
  unreadDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD },
  notifBody:       { fontSize: 12, color: '#94a3b8', lineHeight: 17 },
  notifTime:       { fontSize: 11, color: '#475569' },

  // Quick actions
  quickRow:    { flexDirection: 'row', gap: 10 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
  quickIcon:   { width: 44, height: 44, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  quickLabel:  { fontSize: 11, fontWeight: '700', color: '#374151' },
});
