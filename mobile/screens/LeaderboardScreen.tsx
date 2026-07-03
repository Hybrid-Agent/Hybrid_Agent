import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api, type Agent } from '../lib/api';
import { useAppTheme, type Theme } from '../lib/theme';

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const theme  = useAppTheme();
  const styles = makeStyles(theme);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.agents();
      setAgents(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const top3 = agents.slice(0, 3);
  const rest  = agents.slice(3);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Text style={styles.headerSub}>Top agents by closed volume · USDC</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="wifi-outline" size={40} color="#d1d5db" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : agents.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={40} color="#d1d5db" />
          <Text style={styles.errorText}>No agents yet. Be the first!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Podium — top 3 */}
          {top3.length >= 2 && (
            <View style={styles.podium}>
              {[top3[1], top3[0], top3[2]].filter(Boolean).map((agent, idx) => {
                const heights = [80, 110, 70];
                const isFirst = agent === top3[0];
                return (
                  <View key={agent.id} style={styles.podiumItem}>
                    <Text style={styles.podiumName} numberOfLines={1}>
                      {agent.full_name.split(' ')[0]}
                    </Text>
                    <View style={[styles.podiumBar, { height: heights[idx], backgroundColor: isFirst ? theme.navy : theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6', borderColor: isFirst ? theme.gold : theme.border }]}>
                      <Text style={[styles.podiumRank, { color: isFirst ? theme.gold : theme.textSecondary }]}>
                        #{agents.indexOf(agent) + 1}
                      </Text>
                      <Text style={[styles.podiumDeals, { color: isFirst ? '#fff' : theme.text }]}>
                        {agent.sales_count}
                      </Text>
                      <Text style={[styles.podiumLabel, { color: isFirst ? '#94a3b8' : theme.textSecondary }]}>deals</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* All agents list */}
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Full Rankings</Text>
            {agents.map((agent, i) => (
              <View key={agent.id} style={[styles.agentRow, i < agents.length - 1 && styles.agentRowBorder]}>
                <View style={styles.rankCol}>
                  {MEDAL[i + 1]
                    ? <Text style={styles.medal}>{MEDAL[i + 1]}</Text>
                    : <Text style={styles.rankNum}>#{i + 1}</Text>}
                </View>
                <View style={[styles.avatar, { backgroundColor: i < 3 ? theme.navy : theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6' }]}>
                  {agent.avatar ? (
                    <Image source={{ uri: agent.avatar }} style={styles.avatarImg} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.avatarText, { color: i < 3 ? '#fff' : theme.text }]}>
                      {agent.full_name[0]}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={styles.agentName}>{agent.full_name}</Text>
                    {agent.kyc_status === 'verified' && (
                      <Ionicons name="shield-checkmark" size={13} color={theme.gold} />
                    )}
                  </View>
                  <Text style={styles.agentMeta}>
                    @{agent.user_name} · ⭐ {(agent.rating ?? 0).toFixed(1)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.volumeVal}>{agent.sales_count} deals</Text>
                  <Text style={styles.volumeLabel}>{agent.listing_count} listings</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={theme.gold} />
            <Text style={styles.infoText}>Rankings are based on on-chain settled deals. Updated in real-time from the blockchain.</Text>
          </View>

          <View style={{ height: insets.bottom + 16 }} />
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:       { flex: 1, backgroundColor: theme.background },
  header:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: theme.navy },
  headerSub:  { fontSize: 13, color: theme.textSecondary, marginTop: 2 },

  scroll:     { paddingHorizontal: 20, paddingTop: 16 },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:  { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
  retryBtn:   { paddingHorizontal: 20, paddingVertical: 9, backgroundColor: theme.navy, borderRadius: 12 },
  retryText:  { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 14 },

  podium:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 24 },
  podiumItem: { flex: 1, alignItems: 'center', gap: 6 },
  podiumName: { fontSize: 11, fontWeight: '700', color: theme.text, textAlign: 'center' },
  podiumBar:  { width: '100%', borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  podiumRank: { fontSize: 10, fontWeight: '700' },
  podiumDeals: { fontSize: 18, fontWeight: '900' },
  podiumLabel: { fontSize: 10 },

  listCard:   { backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 16 },
  listTitle:  { fontSize: 15, fontWeight: '700', color: theme.navy, marginBottom: 14 },

  agentRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  agentRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.border },
  rankCol:     { width: 28, alignItems: 'center' },
  medal:       { fontSize: 18 },
  rankNum:     { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  avatar:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:   { width: 38, height: 38, borderRadius: 19 },
  avatarText:  { fontSize: 14, fontWeight: '800' },
  agentName:   { fontSize: 14, fontWeight: '700', color: theme.text },
  agentMeta:   { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
  volumeVal:   { fontSize: 13, fontWeight: '800', color: theme.navy },
  volumeLabel: { fontSize: 11, color: theme.textSecondary, textAlign: 'right' },

  infoCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.gold + '10', borderRadius: 14, borderWidth: 1, borderColor: theme.gold + '30', padding: 14 },
  infoText:   { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
});
