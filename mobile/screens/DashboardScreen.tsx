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
import { useAppTheme, type Theme } from '../lib/theme';



type DashNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const getPlatformStats = (theme: Theme) => [
  { icon: 'cube-outline',            value: '—',    label: 'Active listings',  color: theme.navy },
  { icon: 'checkmark-done-outline',  value: 'USDC', label: 'Settled payments', color: theme.gold },
  { icon: 'people-outline',          value: '—',    label: 'Verified agents',  color: theme.navy },
  { icon: 'shield-checkmark-outline',value: '100%', label: 'On-chain escrow',  color: theme.gold },
];

const getQuickActions = (theme: Theme) => [
  { icon: 'add-circle-outline', label: 'New Listing', color: theme.navy },
  { icon: 'search-outline',      label: 'Browse',      color: theme.navy },
  { icon: 'trophy-outline',      label: 'Leaderboard', color: theme.navy },
  { icon: 'person-outline',      label: 'Profile',     color: theme.navy },
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
  const theme  = useAppTheme();
  const styles = makeStyles(theme);

  const [user, setUser]         = useState<AuthUser | null>(null);
  const [recent, setRecent]     = useState<Listing[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [wallet, setWallet]     = useState<WalletData | null>(null);

  const PLATFORM_STATS = getPlatformStats(theme);
  const QUICK_ACTIONS = getQuickActions(theme);

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
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting()} 👋</Text>
          <Text style={styles.greetingName}>{displayName}</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={() => nav.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={20} color={theme.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero / Wallet card */}
        <View style={styles.heroCard}>
          {/* Top row: brand + live badge */}
          <View style={styles.heroTop}>
            <View style={styles.heroIconRing}>
              <Ionicons name="business-outline" size={22} color={theme.gold} />
            </View>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>Live · Blockchain</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>
            <Text style={{ color: theme.gold }}>HYBRID</Text>AGENT
          </Text>
          <Text style={styles.heroSub}>Property · Vehicles · USDC</Text>
          <View style={styles.heroDivider} />

          {/* Wallet address row */}
          <View style={styles.addrRow}>
            <View style={[styles.addrDot, { backgroundColor: walletAddr ? theme.green : theme.emptyIcon }]} />
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
              <Ionicons name="briefcase-outline" size={13} color={theme.gold} />
              <Text style={styles.heroStatValue}>${fmtUsdc(wallet?.breakdown?.commissionUsdc ?? '0')}</Text>
              <Text style={styles.heroStatLabel}>Commissions</Text>
            </View>
            <View style={styles.heroStatsDivider} />
            <View style={styles.heroStatPill}>
              <Ionicons name="home-outline" size={13} color={theme.gold} />
              <Text style={styles.heroStatValue}>${fmtUsdc(wallet?.breakdown?.proceedsUsdc ?? '0')}</Text>
              <Text style={styles.heroStatLabel}>Proceeds</Text>
            </View>
            <View style={styles.heroStatsDivider} />
            <View style={styles.heroStatPill}>
              <Ionicons name="checkmark-done-outline" size={13} color={theme.gold} />
              <Text style={styles.heroStatValue}>{wallet?.completedDeals ?? 0}</Text>
              <Text style={styles.heroStatLabel}>Deals</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.heroCta} onPress={() => (nav as any).navigate('ListingsTab', { screen: 'ListingsFeed' })}>
            <Text style={styles.heroCtaText}>Browse Listings</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.navy} style={{ marginLeft: 6 }} />
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
                if (a.label === 'Browse') (nav as any).navigate('ListingsTab', { screen: 'ListingsFeed' });
                if (a.label === 'Leaderboard') nav.navigate('Leaderboard');
                if (a.label === 'Profile') nav.navigate('Profile');
              }}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon as any} size={20} color={theme.navy} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent listings */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => (nav as any).navigate('ListingsTab', { screen: 'ListingsFeed' })}>
          <Text style={styles.sectionTitle}>Recent Listings</Text>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>

        {recent.length === 0 ? (
          <View style={styles.emptyRecent}>
            <Ionicons name="cube-outline" size={28} color="#d1d5db" />
            <Text style={styles.emptyRecentText}>No listings yet</Text>
          </View>
        ) : recent.map(listing => (
          <TouchableOpacity 
            key={listing.id} 
            style={styles.listingCard}
            activeOpacity={0.88}
            onPress={() => (nav as any).navigate('ListingsTab', { screen: 'ListingDetail', params: { id: listing.id } })}
          >
            <View style={[styles.listingThumb, { backgroundColor: listing.asset_type === 'property' ? (theme.navy === '#0c2340' ? '#e8f0fe' : theme.navyCard) : (theme.gold + '22') }]}>
              {listing.image ? (
                <Image source={{ uri: listing.image }} style={styles.listingThumbImg} resizeMode="cover" />
              ) : (
                <Ionicons
                  name={listing.asset_type === 'property' ? 'business-outline' : 'car-outline'}
                  size={24}
                  color={listing.asset_type === 'property' ? (theme.navy === '#0c2340' ? theme.navy : '#fff') : theme.gold}
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
          </TouchableOpacity>
        ))}

        {/* On-chain banner */}
        <View style={styles.chainBanner}>
          <Ionicons name="lock-closed-outline" size={20} color={theme.gold} />
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

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:    { flex: 1, backgroundColor: theme.background },
  scroll:  { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },

  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  greeting:    { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
  greetingName: { fontSize: 18, fontWeight: '800', color: theme.text },
  notifBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' },

  heroCard:    { 
    backgroundColor: theme.background === '#121212' ? 'rgba(255, 255, 255, 0.05)' : theme.navyCard, 
    borderRadius: 24, padding: 22, marginTop: 16, marginBottom: 20,
    borderWidth: 1, borderColor: theme.background === '#121212' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  heroTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heroIconRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: theme.gold + '55', alignItems: 'center', justifyContent: 'center' },
  heroBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff12', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.green },
  heroBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  heroTitle:   { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 2 },
  heroSub:     { fontSize: 11, color: '#94a3b8', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10 },
  heroDivider: { width: 36, height: 2, backgroundColor: theme.gold, borderRadius: 1, marginBottom: 14 },

  addrRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  addrDot:      { width: 7, height: 7, borderRadius: 4 },
  addrText:     { flex: 1, fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' },
  networkBadge: { backgroundColor: '#ffffff12', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  networkText:  { fontSize: 10, color: '#64748b', fontWeight: '700' },

  balanceLabel:  { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceValue:  { fontSize: 34, fontWeight: '900', color: '#fff', marginTop: 2, marginBottom: 4, letterSpacing: -1 },

  ethRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  ethText:  { fontSize: 11, color: '#64748b' },

  heroStatsStrip:   { flexDirection: 'row', borderWidth: 1, borderColor: '#ffffff10', borderRadius: 14, backgroundColor: theme.background === '#121212' ? '#121212' : '#121212', marginBottom: 16, overflow: 'hidden' },
  heroStatsDivider: { width: 1, backgroundColor: '#ffffff10', marginVertical: 10 },
  heroStatPill:     { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  heroStatValue:    { fontSize: 13, fontWeight: '800', color: '#fff' },
  heroStatLabel:    { fontSize: 9, color: '#64748b', fontWeight: '600' },

  heroCta:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: theme.gold, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  heroCtaText: { fontSize: 13, fontWeight: '700', color: theme.background === '#121212' ? '#121212' : theme.navy },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: theme.text },
  seeAll:        { fontSize: 13, color: theme.gold, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard:  { width: '47.5%', backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 6 },
  statIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '900', color: theme.text },
  statLabel: { fontSize: 11, color: theme.textSecondary, lineHeight: 15 },

  actionsRow:  { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionBtn:   { flex: 1, alignItems: 'center', gap: 7 },
  actionIcon:  { width: 52, height: 52, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '600', color: theme.text, textAlign: 'center' },

  listingCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 12, marginBottom: 10 },
  listingThumb:    { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  listingThumbImg: { width: 52, height: 52, borderRadius: 12 },
  listingInfo:  { flex: 1, gap: 2 },
  listingType:  { fontSize: 10, fontWeight: '700', color: theme.gold, letterSpacing: 0.8 },
  listingTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  listingDesc:  { fontSize: 11, color: theme.textSecondary },
  listingRight: { alignItems: 'flex-end' },
  listingPrice: { fontSize: 14, fontWeight: '900', color: theme.text },
  listingUsdc:  { fontSize: 10, color: theme.textSecondary, fontWeight: '600' },

  emptyRecent:     { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyRecentText: { fontSize: 13, color: theme.emptyIcon },

  chainBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: theme.navyCard, borderRadius: 16, padding: 16, marginTop: 8, marginBottom: 8 },
  chainTitle:  { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  chainDesc:   { fontSize: 12, color: '#94a3b8', lineHeight: 18 },
});
