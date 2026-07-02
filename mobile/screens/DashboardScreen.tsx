import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList, RootStackParamList } from '../navigation/types';
import { api, type AuthUser, type Listing, type WalletData } from '../lib/api';
import { storage } from '../lib/storage';

const NAVY   = '#0c2340';
const GOLD   = '#c9912a';
const GOLD_L = '#fdf3e3';
const GREEN  = '#22c55e';

type DashNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const PLATFORM_STATS = [
  { icon: 'cube-outline',            value: '—',    label: 'Active listings',  color: NAVY },
  { icon: 'checkmark-done-outline',  value: 'USDC', label: 'Settled payments', color: GOLD },
  { icon: 'people-outline',          value: '—',    label: 'Verified agents',  color: NAVY },
  { icon: 'shield-checkmark-outline',value: '100%', label: 'On-chain escrow',  color: GOLD },
];

const QUICK_ACTIONS = [
  { icon: 'add-circle-outline', label: 'New Listing', color: NAVY },
  { icon: 'search-outline',      label: 'Browse',      color: NAVY },
  { icon: 'trophy-outline',      label: 'Leaderboard', color: NAVY },
  { icon: 'person-outline',      label: 'Profile',     color: NAVY },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}···${a.slice(-4)}`;
}

function fmtUsdc(n: string | number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<DashNav>();

  const [user, setUser]         = useState<AuthUser | null>(null);
  const [recent, setRecent]     = useState<Listing[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [wallet, setWallet]     = useState<WalletData | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;

    storage.getUser().then(cached => { if (active && cached) setUser(cached); });

    api.me().then(({ user: u }) => {
      if (!active) return;
      setUser(u);
      storage.setUser(u);
    }).catch(() => {});

    api.listings().then(data => {
      if (!active) return;
      setRecent(data.slice(0, 3));
      setListingCount(data.length);
    }).catch(() => {});

    api.wallet().then(w => {
      if (active) setWallet(w);
    }).catch(() => {});

    return () => { active = false; };
  }, []));

  const stats = [
    { ...PLATFORM_STATS[0], value: listingCount !== null ? String(listingCount) : '—' },
    PLATFORM_STATS[1],
    PLATFORM_STATS[2],
    PLATFORM_STATS[3],
  ];

  const displayName = user?.full_name ?? user?.user_name ?? 'Welcome back';
  const walletAddr  = wallet?.address ?? user?.wallet_address ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting()} 👋</Text>
          <Text style={styles.greetingName}>{displayName}</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={() => nav.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={20} color={NAVY} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero / Wallet card */}
        <View style={styles.heroCard}>
          {/* Top row: brand + live badge */}
          <View style={styles.heroTop}>
            <View style={styles.heroIconRing}>
              <Ionicons name="business-outline" size={22} color={GOLD} />
            </View>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>Live · Blockchain</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>
            <Text style={{ color: GOLD }}>HYBRID</Text>AGENT
          </Text>
          <Text style={styles.heroSub}>Property · Vehicles · USDC</Text>
          <View style={styles.heroDivider} />

          {/* Wallet address row */}
          <View style={styles.addrRow}>
            <View style={[styles.addrDot, { backgroundColor: walletAddr ? GREEN : '#475569' }]} />
            <Text style={styles.addrText}>
              {walletAddr ? shortAddr(walletAddr) : 'Loading wallet…'}
            </Text>
            <View style={styles.networkBadge}>
              <Text style={styles.networkText}>Sepolia</Text>
            </View>
          </View>

          {/* USDC balance */}
          <Text style={styles.balanceLabel}>USDC Balance</Text>
          <Text style={styles.balanceValue}>${fmtUsdc(wallet?.balanceUsdc ?? '0')}</Text>
          <View style={styles.ethRow}>
            <Ionicons name={'diamond-outline' as any} size={12} color="#64748b" />
            <Text style={styles.ethText}>
              {Number(wallet?.balanceBase ?? 0).toFixed(4)} ETH gas
            </Text>
          </View>

          {/* Stats strip */}
          <View style={styles.heroStatsStrip}>
            <View style={styles.heroStatPill}>
              <Ionicons name="briefcase-outline" size={13} color={GOLD} />
              <Text style={styles.heroStatValue}>${fmtUsdc(wallet?.breakdown?.commissionUsdc ?? '0')}</Text>
              <Text style={styles.heroStatLabel}>Commissions</Text>
            </View>
            <View style={styles.heroStatsDivider} />
            <View style={styles.heroStatPill}>
              <Ionicons name="home-outline" size={13} color={GOLD} />
              <Text style={styles.heroStatValue}>${fmtUsdc(wallet?.breakdown?.proceedsUsdc ?? '0')}</Text>
              <Text style={styles.heroStatLabel}>Proceeds</Text>
            </View>
            <View style={styles.heroStatsDivider} />
            <View style={styles.heroStatPill}>
              <Ionicons name="checkmark-done-outline" size={13} color={GOLD} />
              <Text style={styles.heroStatValue}>{wallet?.completedDeals ?? 0}</Text>
              <Text style={styles.heroStatLabel}>Deals</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.heroCta} onPress={() => nav.navigate('ListingsTab')}>
            <Text style={styles.heroCtaText}>Browse Listings</Text>
            <Ionicons name="arrow-forward" size={14} color={NAVY} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Platform Stats</Text>
        </View>
        <View style={styles.statsGrid}>
          {stats.map(s => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: s.color + '12' }]}>
                <Ionicons name={s.icon as any} size={18} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map(a => (
            <TouchableOpacity
              key={a.label}
              style={styles.actionBtn}
              activeOpacity={0.8}
              onPress={() => {
                if (a.label === 'New Listing') nav.navigate('CreateListing');
                if (a.label === 'Browse') nav.navigate('ListingsTab');
                if (a.label === 'Leaderboard') nav.navigate('Leaderboard');
                if (a.label === 'Profile') nav.navigate('Profile');
              }}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon as any} size={20} color={NAVY} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent listings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Listings</Text>
          <TouchableOpacity onPress={() => nav.navigate('ListingsTab')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {recent.length === 0 ? (
          <View style={styles.emptyRecent}>
            <Ionicons name="cube-outline" size={28} color="#d1d5db" />
            <Text style={styles.emptyRecentText}>No listings yet</Text>
          </View>
        ) : recent.map(listing => (
          <View key={listing.id} style={styles.listingCard}>
            <View style={[styles.listingThumb, { backgroundColor: listing.asset_type === 'property' ? '#e8f0fe' : GOLD_L }]}>
              {listing.image ? (
                <Image source={{ uri: listing.image }} style={styles.listingThumbImg} resizeMode="cover" />
              ) : (
                <Ionicons
                  name={listing.asset_type === 'property' ? 'business-outline' : 'car-outline'}
                  size={24}
                  color={listing.asset_type === 'property' ? NAVY : GOLD}
                />
              )}
            </View>
            <View style={styles.listingInfo}>
              <Text style={styles.listingType}>{listing.asset_type.toUpperCase()}</Text>
              <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
              {listing.description ? (
                <Text style={styles.listingDesc} numberOfLines={1}>{listing.description}</Text>
              ) : null}
            </View>
            <View style={styles.listingRight}>
              <Text style={styles.listingPrice}>${Number(listing.price_usdc).toLocaleString()}</Text>
              <Text style={styles.listingUsdc}>USDC</Text>
            </View>
          </View>
        ))}

        {/* On-chain banner */}
        <View style={styles.chainBanner}>
          <Ionicons name="lock-closed-outline" size={20} color={GOLD} />
          <View style={{ flex: 1 }}>
            <Text style={styles.chainTitle}>Escrow-protected deals</Text>
            <Text style={styles.chainDesc}>Every transaction settles atomically — seller, agent, and platform are paid in a single on-chain step.</Text>
          </View>
        </View>

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f9fafb' },
  scroll:  { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },

  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  greeting:    { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  greetingName: { fontSize: 18, fontWeight: '800', color: NAVY },
  notifBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },

  heroCard:    { backgroundColor: NAVY, borderRadius: 24, padding: 22, marginTop: 16, marginBottom: 20 },
  heroTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heroIconRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: GOLD + '55', alignItems: 'center', justifyContent: 'center' },
  heroBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff12', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  heroBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  heroTitle:   { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 2 },
  heroSub:     { fontSize: 11, color: '#94a3b8', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10 },
  heroDivider: { width: 36, height: 2, backgroundColor: GOLD, borderRadius: 1, marginBottom: 14 },

  addrRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  addrDot:      { width: 7, height: 7, borderRadius: 4 },
  addrText:     { flex: 1, fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' },
  networkBadge: { backgroundColor: '#ffffff12', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  networkText:  { fontSize: 10, color: '#64748b', fontWeight: '700' },

  balanceLabel:  { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceValue:  { fontSize: 34, fontWeight: '900', color: '#fff', marginTop: 2, marginBottom: 4, letterSpacing: -1 },

  ethRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  ethText:  { fontSize: 11, color: '#64748b' },

  heroStatsStrip:   { flexDirection: 'row', borderWidth: 1, borderColor: '#ffffff10', borderRadius: 14, backgroundColor: '#0d2d52', marginBottom: 16, overflow: 'hidden' },
  heroStatsDivider: { width: 1, backgroundColor: '#ffffff10', marginVertical: 10 },
  heroStatPill:     { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  heroStatValue:    { fontSize: 13, fontWeight: '800', color: '#fff' },
  heroStatLabel:    { fontSize: 9, color: '#64748b', fontWeight: '600' },

  heroCta:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  heroCtaText: { fontSize: 13, fontWeight: '700', color: NAVY },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: NAVY },
  seeAll:        { fontSize: 13, color: GOLD, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard:  { width: '47.5%', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, gap: 6 },
  statIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '900', color: NAVY },
  statLabel: { fontSize: 11, color: '#9ca3af', lineHeight: 15 },

  actionsRow:  { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionBtn:   { flex: 1, alignItems: 'center', gap: 7 },
  actionIcon:  { width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },

  listingCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, marginBottom: 10 },
  listingThumb:    { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  listingThumbImg: { width: 52, height: 52, borderRadius: 12 },
  listingInfo:  { flex: 1, gap: 2 },
  listingType:  { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.8 },
  listingTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  listingDesc:  { fontSize: 11, color: '#9ca3af' },
  listingRight: { alignItems: 'flex-end' },
  listingPrice: { fontSize: 14, fontWeight: '900', color: NAVY },
  listingUsdc:  { fontSize: 10, color: '#9ca3af', fontWeight: '600' },

  emptyRecent:     { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyRecentText: { fontSize: 13, color: '#9ca3af' },

  chainBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: NAVY, borderRadius: 16, padding: 16, marginTop: 8, marginBottom: 8 },
  chainTitle:  { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  chainDesc:   { fontSize: 12, color: '#94a3b8', lineHeight: 18 },
});
