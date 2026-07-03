import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api, type AuthUser } from '../lib/api';
import { storage } from '../lib/storage';
import { useAppTheme, type Theme } from '../lib/theme';

export default function PersonalDetailsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const [user, setUser] = useState<AuthUser | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    storage.getUser().then(cached => { if (active && cached) setUser(cached); });
    api.me().then(({ user: u }) => {
      if (active) {
        setUser(u);
        storage.setUser(u);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={theme.navy} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personal Details</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          
          <View style={styles.field}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} value={user?.full_name || ''} editable={false} />
              <Ionicons name="lock-closed-outline" size={14} color="#9ca3af" style={styles.icon} />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} value={user ? `@${user.user_name}` : ''} editable={false} />
              <Ionicons name="lock-closed-outline" size={14} color="#9ca3af" style={styles.icon} />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} value={user?.email || ''} editable={false} />
              <Ionicons name="lock-closed-outline" size={14} color="#9ca3af" style={styles.icon} />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} value={user?.phone_number || 'Not provided'} editable={false} />
              <Ionicons name="lock-closed-outline" size={14} color="#9ca3af" style={styles.icon} />
            </View>
          </View>
          
          <View style={styles.field}>
            <Text style={styles.label}>Account Role</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} value={user?.user_type ? user.user_type.toUpperCase() : ''} editable={false} />
              <Ionicons name="lock-closed-outline" size={14} color="#9ca3af" style={styles.icon} />
            </View>
          </View>

        </View>

        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color="#4b5563" />
          <Text style={styles.noteText}>
            Your personal details cannot be changed from the mobile app right now. Please contact support to update your profile.
          </Text>
        </View>
        
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: theme.card,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 12, paddingVertical: 4, paddingRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.navy },
  scroll: { padding: 20 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f9fafb',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.text,
    fontWeight: '500',
  },
  icon: { marginLeft: 8 },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f3f4f6',
    padding: 14,
    borderRadius: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  }
});
