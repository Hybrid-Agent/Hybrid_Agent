import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppTheme, type Theme } from '../lib/theme';

const { width: W, height: H } = Dimensions.get('window');



const stats = [
  { icon: 'lock-closed-outline' as const, value: '100%', label: 'On-chain' },
  { icon: 'trending-up-outline'  as const, value: 'USDC',  label: 'Stable payouts' },
  { icon: 'shield-checkmark-outline' as const, value: '0', label: 'Disputes' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const logoAnim    = useRef(new Animated.Value(0)).current;
  const logoSlide   = useRef(new Animated.Value(36)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;
  const statsAnim   = useRef(new Animated.Value(0)).current;
  const ctaAnim     = useRef(new Animated.Value(0)).current;
  const ctaSlide    = useRef(new Animated.Value(24)).current;
  const lineAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(logoAnim,  { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(logoSlide, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      Animated.timing(lineAnim,    { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(80),
      Animated.timing(taglineAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.delay(80),
      Animated.timing(statsAnim,   { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(ctaAnim,  { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(ctaSlide, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      {/* Subtle crosshair guide lines */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.vLine, { left: W / 2 }]} />
        <View style={[styles.hLine, { top: H / 2 }]} />
      </View>

      {/* Corner labels */}
      <View style={[styles.cornerTop, { paddingTop: insets.top + 12 }]} pointerEvents="none">
        <Text style={styles.cornerText}>HybridAgent</Text>
        <Text style={styles.cornerText}>© 2026</Text>
      </View>
      <View style={[styles.cornerBottom, { paddingBottom: insets.bottom + 8 }]} pointerEvents="none">
        <Text style={styles.cornerText}>Property</Text>
        <Text style={styles.cornerText}>Vehicles</Text>
      </View>

      {/* ── CENTRE ── */}
      <View style={styles.centre}>

        {/* Icon mark */}
        <Animated.View
          style={[styles.logoBlock, { opacity: logoAnim, transform: [{ translateY: logoSlide }] }]}
        >
          <View style={styles.iconRing}>
            <View style={styles.iconInner}>
              <Ionicons name="business-outline" size={26} color={theme.gold} />
            </View>
          </View>

          {/* Wordmark */}
          <Text style={styles.wordmark}>
            <Text style={{ color: theme.gold }}>HYBRID</Text>
            <Text style={{ color: theme.navy }}>AGENT</Text>
          </Text>

          {/* Category sub-label */}
          <Text style={styles.subLabel}>Property · Vehicles · USDC</Text>
        </Animated.View>

        {/* Gold divider line */}
        <Animated.View style={[styles.divider, { opacity: lineAnim }]} />

        {/* Tagline */}
        <Animated.View style={[styles.taglineBlock, { opacity: taglineAnim }]}>
          <Text style={styles.tagline}>
            The secure way for agents to receive commissions{' '}
            <Text style={{ color: theme.navy, fontWeight: '700' }}>locally</Text>
            {' '}&{' '}
            <Text style={{ color: theme.navy, fontWeight: '700' }}>internationally</Text>
            {' '}— guaranteed on-chain.
          </Text>
        </Animated.View>

        {/* Stats */}
        <Animated.View style={[styles.statsCard, { opacity: statsAnim }]}>
          {stats.map(({ icon, value, label }, i) => (
            <React.Fragment key={label}>
              <View style={styles.statItem}>
                <Ionicons name={icon} size={16} color={theme.gold} />
                <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
              {i < stats.length - 1 && <View style={styles.statDivider} />}
            </React.Fragment>
          ))}
        </Animated.View>

        {/* ── CTAs ── */}
        <Animated.View
          style={[styles.ctaBlock, { opacity: ctaAnim, transform: [{ translateY: ctaSlide }] }]}
        >
          <TouchableOpacity style={styles.btnPrimary} activeOpacity={0.85} onPress={() => nav.navigate('Register')}>
            <Text style={styles.btnPrimaryText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} activeOpacity={0.85} onPress={() => nav.navigate('Login')}>
            <Text style={styles.btnSecondaryText}>Sign In</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: theme.background },
  vLine:        { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: theme.border },
  hLine:        { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: theme.border },

  cornerTop:    { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  cornerBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  cornerText:   { fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: theme.textSecondary },

  centre:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

  logoBlock:    { alignItems: 'center', marginBottom: 24 },
  iconRing:     { width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, borderColor: theme.gold + '55', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconInner:    { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.gold + '15', alignItems: 'center', justifyContent: 'center' },
  wordmark:     { fontSize: 52, fontWeight: '900', letterSpacing: -1, lineHeight: 56 },
  subLabel:     { fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.textSecondary, marginTop: 8 },

  divider:      { width: 48, height: 2, backgroundColor: theme.gold, borderRadius: 1, marginBottom: 24 },

  taglineBlock: { marginBottom: 32, paddingHorizontal: 8 },
  tagline:      { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 24 },

  statsCard:    { flexDirection: 'row', width: '100%', borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 16, marginBottom: 8 },
  statItem:     { flex: 1, alignItems: 'center', gap: 4 },
  statValue:    { fontSize: 18, fontWeight: '800' },
  statLabel:    { fontSize: 10, color: theme.textSecondary, textAlign: 'center' },
  statDivider:  { width: 1, backgroundColor: theme.border, marginHorizontal: 8, alignSelf: 'stretch' },

  ctaBlock:     { width: '100%', marginTop: 28 },
  btnPrimary:   { backgroundColor: theme.navy, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  btnPrimaryText: { color: theme.background === '#121212' ? '#121212' : '#ffffff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
  btnSecondary:  { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card },
  btnSecondaryText: { color: theme.navy, fontWeight: '600', fontSize: 16 },
});
