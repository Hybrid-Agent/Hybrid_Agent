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
import { api } from '../lib/api';
import { storage } from '../lib/storage';

const NAVY  = '#0c2340';
const GOLD  = '#c9912a';
const GREEN = '#22c55e';

type Notif = {
  id: string;
  type: 'purchase_request' | 'deal_approved' | 'deal_funded';
  title: string;
  body: string;
  listingId?: string;
  time: string;
  read: boolean;
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}···${a.slice(-4)}`;
}
function fmtUsdc(n: string | number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [notifs,  setNotifs]  = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = await storage.getUser();
      if (user?.user_type) setUserType(user.user_type);

      // Pull incoming purchase requests as notifications (agents only)
      if (user?.user_type === 'agent') {
        const reqs = await api.incomingRequests().catch(() => []);
        const built: Notif[] = reqs.map((r: any) => ({
          id: r.id,
          type: r.status === 'funded' ? 'deal_funded'
              : r.deal_id            ? 'deal_approved'
              : 'purchase_request',
          title: r.status === 'funded'  ? 'Escrow funded!'
               : r.deal_id             ? 'Deal created'
               : 'New purchase request',
          body: r.status === 'funded'
              ? `${r.buyer_name ?? 'A buyer'} funded escrow for "${r.listing_title ?? 'your listing'}".`
              : r.deal_id
              ? `Deal #${r.deal_id} created for "${r.listing_title ?? 'your listing'}".`
              : `${r.buyer_name ?? 'A buyer'} wants to buy "${r.listing_title ?? 'your listing'}".`,
          listingId: String(r.listing_id),
          time: r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
          read: r.status !== 'requested',
        }));
        setNotifs(built);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unread = notifs.filter(n => !n.read).length;

  const iconForType = (t: Notif['type']) => {
    if (t === 'deal_funded')   return { name: 'checkmark-circle',  color: GREEN };
    if (t === 'deal_approved') return { name: 'lock-closed',        color: GOLD };
    return                            { name: 'cart-outline',        color: NAVY };
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={NAVY} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unread > 0 && (
              <Text style={styles.headerSub}>{unread} unread</Text>
            )}
          </View>
        </View>
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

          {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
          <View style={styles.section}>

            {notifs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="notifications-off-outline" size={36} color="#d1d5db" />
                <Text style={styles.emptyTitle}>All caught up</Text>
                <Text style={styles.emptySub}>
                  {userType === 'agent'
                    ? 'Purchase requests from buyers will appear here.'
                    : 'Activity on your listings will appear here.'}
                </Text>
              </View>
            ) : (
              <View style={styles.notifList}>
                {notifs.map((n, i) => {
                  const ico = iconForType(n.type);
                  return (
                    <TouchableOpacity
                      key={n.id}
                      style={[
                        styles.notifRow,
                        i < notifs.length - 1 && styles.notifRowBorder,
                        !n.read && styles.notifRowUnread,
                      ]}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (n.listingId) nav.navigate('Main');
                      }}
                    >
                      <View style={[styles.notifIcon, { backgroundColor: ico.color + '18' }]}>
                        <Ionicons name={ico.name as any} size={18} color={ico.color} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={styles.notifTitleRow}>
                          <Text style={styles.notifTitle}>{n.title}</Text>
                          {!n.read && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                        {n.time ? <Text style={styles.notifTime}>{n.time}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={15} color="#d1d5db" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
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
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn:     { marginRight: 12, paddingVertical: 4, paddingRight: 8 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 12, color: GOLD, marginTop: 2, fontWeight: '600' },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Notifications
  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', padding: 32, gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: NAVY, marginTop: 4 },
  emptySub:   { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19 },

  notifList: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  notifRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  notifRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  notifRowUnread:  { backgroundColor: '#f9fafb' },
  notifIcon:       { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  notifTitle:      { fontSize: 14, fontWeight: '700', color: '#111827' },
  unreadDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD },
  notifBody:       { fontSize: 12, color: '#4b5563', lineHeight: 17 },
  notifTime:       { fontSize: 11, color: '#9ca3af' },

});
