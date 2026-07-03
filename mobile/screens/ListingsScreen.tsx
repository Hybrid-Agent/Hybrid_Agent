import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  FlatList, StyleSheet, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ListingsStackParamList, TabParamList, RootStackParamList } from '../navigation/types';
import { api, type Listing } from '../lib/api';
import { useAppTheme, type Theme } from '../lib/theme';

type ListingsNav = CompositeNavigationProp<
  NativeStackNavigationProp<ListingsStackParamList>,
  CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;



type Filter = 'all' | 'property' | 'vehicle';

export default function ListingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<ListingsNav>();
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const [listings, setListings] = useState<Listing[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch]   = useState('');
  const searchRef             = useRef<TextInput>(null);
  const [filter, setFilter]   = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      setFetching(true);
      setFetchError('');
      const data = await api.listings();
      setListings(data);
    } catch (e: any) {
      setFetchError(e.message ?? 'Failed to load listings.');
    } finally {
      setFetching(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    return listings.filter(l => {
      const matchFilter = filter === 'all' || l.asset_type === filter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        l.title.toLowerCase().includes(q) ||
        (l.description ?? '').toLowerCase().includes(q) ||
        (l.agent_name ?? '').toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [listings, search, filter]);

  const renderItem = ({ item }: { item: Listing }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => nav.navigate('ListingDetail', { id: item.id })}
      activeOpacity={0.88}
    >
      <View style={[styles.thumb, { backgroundColor: item.asset_type === 'property' ? '#e8f0fe' : '#fef3c7' }]}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <Ionicons
            name={item.asset_type === 'property' ? 'business-outline' : 'car-outline'}
            size={30}
            color={item.asset_type === 'property' ? (theme.navy === '#0c2340' ? theme.navy : '#fff') : theme.gold}
          />
        )}
        <View style={[styles.badge, item.status === 'pending' && styles.badgePending]}>
          <Text style={[styles.badgeText, item.status === 'pending' && styles.badgeTextPending]}>{item.status === 'pending' ? 'Pending' : 'Open'}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.cardType}>{item.asset_type.toUpperCase()}</Text>
          <Text style={styles.cardPrice}>
            ${Number(item.price_usdc).toLocaleString()} <Text style={styles.usdcLabel}>USDC</Text>
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.agentRow}>
          <View style={styles.agentDot}>
            <Text style={styles.agentInitial}>{(item.agent_name ?? '?')[0]}</Text>
          </View>
          <Text style={styles.agentName}>{item.agent_name ?? 'Unknown agent'}</Text>
          {item.agent_kyc === 'verified' && (
            <Ionicons name="shield-checkmark" size={13} color={theme.gold} style={{ marginLeft: 4 }} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Listings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => nav.navigate('CreateListing')}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Pressable style={styles.searchWrap} onPress={() => searchRef.current?.focus()}>
        <Ionicons name="search-outline" size={17} color="#9ca3af" style={{ marginRight: 8 }} />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Search listings…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={17} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </Pressable>

      <View style={styles.tabs}>
        {(['all', 'property', 'vehicle'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.tab, filter === f && styles.tabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
              {f === 'all' ? 'All' : f === 'property' ? 'Property' : 'Vehicles'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {fetching ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.navy} />
        </View>
      ) : fetchError ? (
        <View style={styles.center}>
          <Ionicons name="wifi-outline" size={40} color="#d1d5db" />
          <Text style={styles.errorText}>{fetchError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.resultRow}>
            <Text style={styles.resultCount}>{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</Text>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={40} color={theme.emptyIcon} />
                <Text style={styles.emptyText}>No listings found</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: theme.background },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: theme.navy },
  addBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.navy, alignItems: 'center', justifyContent: 'center' },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12, backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: theme.text },

  tabs:        { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  tab:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  tabActive:   { backgroundColor: theme.navy, borderColor: theme.navy },
  tabText:     { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  tabTextActive: { color: theme.background === '#121212' ? '#121212' : '#fff' },

  resultRow:   { paddingHorizontal: 20, marginBottom: 8 },
  resultCount: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },

  list:        { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },

  card:        { backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  thumb:       { height: 140, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg:    { width: '100%', height: '100%' },
  badge:       { position: 'absolute', top: 10, right: 10, backgroundColor: theme.badgeSuccessBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgePending: { backgroundColor: theme.badgePendingBg },
  badgeText:   { fontSize: 11, fontWeight: '700', color: theme.successText },
  badgeTextPending: { color: theme.badgePendingText },
  cardBody:    { padding: 14 },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardType:    { fontSize: 10, fontWeight: '700', color: theme.gold, letterSpacing: 1 },
  cardPrice:   { fontSize: 16, fontWeight: '800', color: theme.navy },
  usdcLabel:   { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4, lineHeight: 22 },
  cardDesc:    { fontSize: 12, color: theme.textSecondary, marginBottom: 8 },
  agentRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agentDot:    { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.navy, alignItems: 'center', justifyContent: 'center' },
  agentInitial: { fontSize: 10, fontWeight: '800', color: theme.background === '#121212' ? '#121212' : '#fff' },
  agentName:   { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:   { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
  retryBtn:    { paddingHorizontal: 20, paddingVertical: 9, backgroundColor: theme.navy, borderRadius: 12 },
  retryText:   { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 14 },

  empty:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:   { fontSize: 15, color: theme.textSecondary },
});
