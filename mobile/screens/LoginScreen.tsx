import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, ScrollView, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { useAppTheme, type Theme } from '../lib/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(email.trim().toLowerCase(), password);
      await storage.setToken(token);
      await storage.setUser(user);
      nav.navigate('Main');
    } catch (e: any) {
      setError(e.message ?? 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
        <Ionicons name="arrow-back" size={22} color={theme.navy} />
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.iconRing}>
            <Ionicons name="lock-closed-outline" size={22} color={theme.gold} />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your HybridAgent account</Text>
        </View>

        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <Pressable style={styles.inputWrap} onPress={() => emailRef.current?.focus()}>
              <Ionicons name="mail-outline" size={17} color={theme.gold} style={styles.inputIcon} />
              <TextInput
                ref={emailRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="you@example.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <Pressable style={styles.inputWrap} onPress={() => passwordRef.current?.focus()}>
              <Ionicons name="lock-closed-outline" size={17} color={theme.gold} style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPw}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={theme.textSecondary} />
              </TouchableOpacity>
            </Pressable>
          </View>

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} activeOpacity={0.85} disabled={loading}>
            {loading
              ? <ActivityIndicator color={theme.background === '#121212' ? '#121212' : '#fff'} />
              : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => nav.navigate('Register')}>
            <Text style={styles.footerLink}>Register here</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:       { flex: 1, backgroundColor: theme.background },
  scroll:     { flexGrow: 1, paddingHorizontal: 20 },
  back:       { padding: 16, alignSelf: 'flex-start' },

  header:     { alignItems: 'center', marginTop: 8, marginBottom: 28 },
  iconRing:   { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: theme.gold + '55', backgroundColor: theme.gold + '10', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:      { fontSize: 26, fontWeight: '800', color: theme.navy, marginBottom: 6 },
  subtitle:   { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },

  card:       { backgroundColor: theme.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: theme.border, marginBottom: 20 },

  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.background === '#121212' ? '#7f1d1d' : '#fef2f2', borderWidth: 1, borderColor: theme.errorText + '50', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText:  { color: theme.errorText, fontSize: 13, flex: 1 },

  fieldGroup: { marginBottom: 18 },
  label:      { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f9fafb', paddingHorizontal: 12 },
  inputIcon:  { marginRight: 8 },
  input:      { paddingVertical: 13, fontSize: 15, color: theme.text },
  eyeBtn:     { padding: 4 },

  btnPrimary: { backgroundColor: theme.navy, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnText:    { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 16 },

  footer:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: theme.textSecondary, fontSize: 14 },
  footerLink: { color: theme.navy, fontWeight: '700', fontSize: 14 },
});
