import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, Image, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { api, type AuthUser } from '../lib/api';
import { storage } from '../lib/storage';

const NAVY = '#0c2340';
const GOLD = '#c9912a';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [user, setUser]             = useState<AuthUser | null>(null);
  const [listingCount, setListingCount] = useState(0);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;

    storage.getUser().then(cached => { if (active && cached) setUser(cached); });

    api.me().then(({ user: u }) => {
      if (!active) return;
      setUser(u);
      storage.setUser(u);
    }).catch(() => {});

    api.myListings().then(data => {
      if (active) setListingCount(data.length);
    }).catch(() => {});

    api.myPurchaseRequests().then((reqs: any[]) => {
      if (active) setPurchaseRequests(reqs);
    }).catch(() => {});

    return () => { active = false; };
  }, []));

  const handleLogout = async () => {
    await storage.clearAll();
    nav.reset({ index: 0, routes: [{ name: 'Cover' }] });
  };

  const handleChangeAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets.length) return;
      
      const uri = result.assets[0].uri;
      const name = uri.split('/').pop() ?? 'avatar.jpg';
      const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      const form = new FormData();
      form.append('avatar', { uri, name, type } as any);
      
      const { user: updated } = await api.updateAvatar(form);
      setUser(updated);
      storage.setUser(updated);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Could not update profile picture.');
    }
  };

  const isVerified = user?.kyc_status === 'verified';
  const initials   = (user?.full_name ?? user?.user_name ?? 'U')[0].toUpperCase();

  const MENU_SECTIONS = [
    {
      title: 'Account',
      items: [
        {
          icon: 'person-outline',
          label: 'Personal Details',
          sub: user ? `${user.full_name} · @${user.user_name}` : 'Name, email, phone',
          route: 'PersonalDetails',
        },
        {
          icon: 'shield-outline',
          label: 'KYC Verification',
          sub: isVerified ? 'Identity verified ✓' : 'Identity not verified',
          accent: !isVerified,
          route: 'KYC',
        },
        {
          icon: 'wallet-outline',
          label: 'Wallet',
          sub: user?.wallet_address
            ? `${user.wallet_address.slice(0, 6)}···${user.wallet_address.slice(-4)}`
            : 'View balance & transactions',
          route: 'Wallet',
        },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: 'list-outline',      label: 'My Listings', sub: `${listingCount} listing${listingCount !== 1 ? 's' : ''}` },
        { icon: 'briefcase-outline', label: 'My Deals',    sub: '0 completed' },
        { icon: 'star-outline',      label: 'Reviews',     sub: '0 reviews' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { icon: 'notifications-outline', label: 'Notifications', sub: 'Push alerts on', route: 'Notifications' },
        { icon: 'moon-outline',          label: 'Appearance',    sub: 'Light mode' },
        { icon: 'help-circle-outline',   label: 'Help & Support', sub: 'FAQ · Contact' },
      ],
    },
    {
      title: 'Demo',
      items: [
        { icon: 'cash-outline', label: 'Owner Payout Access', sub: 'Demo: off-platform owner withdrawal', route: 'OwnerWithdraw', accent: true },
      ],
    },
  ];

  const toFund = purchaseRequests.filter((r) => r.status === 'deal_created');
  const pending = purchaseRequests.filter((r) => r.status === 'requested');
  const hasPaymentActivity = toFund.length > 0 || pending.length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={20} color={NAVY} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImg} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.editAvatar} onPress={handleChangeAvatar}>
              <Ionicons name="camera-outline" size={13} color={NAVY} />
            </TouchableOpacity>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.full_name ?? 'Your Name'}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? 'you@example.com'}</Text>
            <View style={styles.kycRow}>
              <Ionicons
                name={isVerified ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                size={13}
                color={isVerified ? '#22c55e' : '#f59e0b'}
              />
              <Text style={[styles.kycText, isVerified && { color: '#22c55e' }]}>
                {isVerified ? 'KYC Verified' : 'KYC Pending — complete to transact'}
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{listingCount}</Text>
              <Text style={styles.statLabel}>Listings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>0</Text>
              <Text style={styles.statLabel}>Deals</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{user?.user_type ?? '—'}</Text>
              <Text style={styles.statLabel}>Role</Text>
            </View>
          </View>
        </View>

        {/* KYC prompt — only when not yet verified */}
        {!isVerified && (
          <TouchableOpacity style={styles.kycCard} activeOpacity={0.85} onPress={() => nav.navigate('KYC')}>
            <View style={styles.kycIcon}>
              <Ionicons name="shield-checkmark-outline" size={22} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kycCardTitle}>Complete KYC</Text>
              <Text style={styles.kycCardDesc}>Verify your identity to buy and sell on HybridAgent</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={GOLD} />
          </TouchableOpacity>
        )}

        {/* Payment Activity section */}
        {hasPaymentActivity && (
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Payment Activity</Text>
            <View style={styles.menuCard}>
              
              {toFund.map((r, idx) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.menuItem, (idx < toFund.length - 1 || pending.length > 0) && styles.menuItemBorder]}
                  activeOpacity={0.7}
                  onPress={() => (nav as any).navigate('ListingDetail', { id: r.listing_id })}
                >
                  <View style={[styles.menuIcon, { backgroundColor: '#ccfbf1' }]}>
                    <Ionicons name="shield-checkmark" size={18} color="#0f766e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: '#0f766e', textTransform: 'uppercase', fontSize: 11, fontWeight: '800' }]}>Fund escrow</Text>
                    <Text style={styles.menuLabel}>{r.listing_title}</Text>
                    <Text style={styles.menuSub}>Deal #{r.deal_id} · {Number(r.price_usdc).toLocaleString()} USDC ready</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}

              {pending.map((r, idx) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.menuItem, idx < pending.length - 1 && styles.menuItemBorder]}
                  activeOpacity={0.7}
                  onPress={() => (nav as any).navigate('ListingDetail', { id: r.listing_id })}
                >
                  <View style={styles.menuIcon}>
                    <Ionicons name="time-outline" size={18} color="#6b7280" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: '#6b7280', textTransform: 'uppercase', fontSize: 11, fontWeight: '800' }]}>Awaiting agent</Text>
                    <Text style={styles.menuLabel}>{r.listing_title}</Text>
                    <Text style={styles.menuSub}>{Number(r.price_usdc).toLocaleString()} USDC · escrow being prepared</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}

            </View>
          </View>
        )}

        {MENU_SECTIONS.map(section => (
          <View key={section.title} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, idx < section.items.length - 1 && styles.menuItemBorder]}
                  activeOpacity={0.7}
                  onPress={() => {
                    const r = (item as any).route;
                    if (r === 'OwnerWithdraw') nav.navigate('OwnerWithdraw', {});
                    else if (r) nav.navigate(r as any);
                  }}
                >
                  <View style={[styles.menuIcon, (item as any).accent && styles.menuIconAccent]}>
                    <Ionicons name={item.icon as any} size={18} color={(item as any).accent ? '#f59e0b' : NAVY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={[styles.menuSub, (item as any).accent && { color: '#f59e0b' }]}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f9fafb' },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: NAVY },
  settingsBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },

  scroll:  { paddingHorizontal: 20, paddingTop: 4 },

  profileCard: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', padding: 20, marginBottom: 16 },
  avatarWrap:  { position: 'relative', alignSelf: 'flex-start', marginBottom: 12 },
  avatar:      { width: 64, height: 64, borderRadius: 32, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:   { width: 64, height: 64, borderRadius: 32 },
  avatarText:  { fontSize: 24, fontWeight: '800', color: '#fff' },
  editAvatar:  { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#e5e7eb' },
  profileInfo: { marginBottom: 16 },
  profileName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 2 },
  profileEmail: { fontSize: 13, color: '#9ca3af', marginBottom: 6 },
  kycRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kycText:     { fontSize: 12, color: '#f59e0b', fontWeight: '500' },
  statRow:     { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  statItem:    { flex: 1, alignItems: 'center', gap: 2 },
  statVal:     { fontSize: 18, fontWeight: '900', color: NAVY, textTransform: 'capitalize' },
  statLabel:   { fontSize: 11, color: '#9ca3af' },
  statDivider: { width: 1, backgroundColor: '#e5e7eb', alignSelf: 'stretch', marginHorizontal: 8 },

  kycCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: NAVY, borderRadius: 16, padding: 16, marginBottom: 20 },
  kycIcon:    { width: 44, height: 44, borderRadius: 22, backgroundColor: GOLD + '20', alignItems: 'center', justifyContent: 'center' },
  kycCardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  kycCardDesc:  { fontSize: 12, color: '#94a3b8', lineHeight: 18 },

  menuSection:      { marginBottom: 20 },
  menuSectionTitle: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  menuCard:         { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  menuItem:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  menuItemBorder:   { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuIcon:         { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  menuIconAccent:   { backgroundColor: '#fef3c7' },
  menuLabel:        { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 1 },
  menuSub:          { fontSize: 12, color: '#9ca3af' },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#fee2e2' },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
});
