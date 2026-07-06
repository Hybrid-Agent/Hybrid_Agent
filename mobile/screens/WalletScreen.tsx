import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet,
  StatusBar, TextInput, Animated, Platform, KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api, type WalletData } from '../lib/api';
import { getUsdcBalance, clearConfigCache } from '../lib/contracts';
import { storage } from '../lib/storage';
import { useAppTheme, type Theme } from '../lib/theme';

type Panel = 'none' | 'receive' | 'send';

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation();
  const theme  = useAppTheme();
  const styles = makeStyles(theme);

  const panelAnim   = useRef(new Animated.Value(0)).current;
  const sendToRef   = useRef<TextInput>(null);
  const sendAmtRef  = useRef<TextInput>(null);

  const [wallet, setWallet]               = useState<WalletData | null>(null);
  const [fetching, setFetching]           = useState(true);
  const [onChainBal, setOnChainBal]       = useState<string | null>(null);
  const [chainFetching, setChainFetching] = useState(false);

  const [panel, setPanel]       = useState<Panel>('none');
  const [copied, setCopied]     = useState(false);
  const [sendTo, setSendTo]     = useState('');
  const [sendAmt, setSendAmt]   = useState('');
  const [sending, setSending]   = useState(false);
  const [sendDone, setSendDone] = useState(false);
  const [sendErr, setSendErr]   = useState('');

  const fetchOnChain = useCallback(async (address: string) => {
    if (!address) return;
    setChainFetching(true);
    try {
      clearConfigCache(); // always use latest USDC address from backend
      const bal = await getUsdcBalance(address);
      setOnChainBal(parseFloat(bal).toFixed(2));
    } catch (e) {
      console.warn('[WalletScreen] on-chain balance failed:', e);
      setOnChainBal(null);
    } finally {
      setChainFetching(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setFetching(true);
    try {
      // Get wallet address from local storage immediately so on-chain fetch can start at once
      const cachedUser = await storage.getUser();
      const walletAddr: string = cachedUser?.wallet_address ?? '';

      // Fire both in parallel — on-chain balance does NOT depend on backend /wallet
      const [walletData] = await Promise.allSettled([
        api.wallet(),
        walletAddr ? fetchOnChain(walletAddr) : Promise.resolve(),
      ]);

      if (walletData.status === 'fulfilled') {
        setWallet(walletData.value);
        // If we didn't have an address from cache, fetch on-chain now using backend address
        if (!walletAddr && walletData.value?.address) {
          fetchOnChain(walletData.value.address);
        }
      }
    } catch (e) {
      console.warn('[WalletScreen] loadAll error:', e);
    } finally {
      setFetching(false);
    }
  }, [fetchOnChain]);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [loadAll]));

  const openPanel = (p: Panel) => {
    setPanel(p);
    setSendDone(false);
    setSendErr('');
    Animated.spring(panelAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  };
  const closePanel = () => {
    Animated.timing(panelAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setPanel('none'));
  };
  const togglePanel = (p: Panel) => {
    if (panel === p) { closePanel(); return; }
    if (panel !== 'none') { setPanel(p); return; }
    openPanel(p);
  };

  const copyAddress = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    setSendErr('');
    if (!sendTo.startsWith('0x') || sendTo.length < 20) { setSendErr('Enter a valid wallet address.'); return; }
    const amt = Number(sendAmt);
    if (!sendAmt || isNaN(amt) || amt <= 0) { setSendErr('Enter a valid amount.'); return; }
    setSending(true);
    try {
      await api.withdraw(sendTo);
      setSendDone(true);
    } catch (e: any) {
      setSendErr(e.message ?? 'Withdrawal failed.');
    } finally {
      setSending(false);
    }
  };

  const fmt = (addr: string) => `${addr.slice(0, 6)}···${addr.slice(-4)}`;

  const address    = wallet?.address ?? '';
  // Prefer on-chain balance (real USDC), fall back to backend-calculated earnings
  const displayBal = onChainBal !== null ? onChainBal : (wallet ? Number(wallet.balanceUsdc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const usdcBal    = displayBal;
  const ethBal     = wallet ? Number(wallet.balanceBase).toFixed(4) : '—';
  const lowGas     = wallet ? Number(wallet.balanceBase) < 0.015 : false;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
          <Ionicons name="arrow-back" size={20} color={theme.navy} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Wallet</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={loadAll}
          disabled={fetching || chainFetching}
        >
          <Ionicons
            name="refresh-outline"
            size={20}
            color={(fetching || chainFetching) ? '#9ca3af' : theme.navy}
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {fetching ? (
            <View style={[styles.balanceCard, { alignItems: 'center', paddingVertical: 48 }]}>
              <ActivityIndicator color={theme.gold} size="large" />
            </View>
          ) : (
            <View style={styles.balanceCard}>
              {lowGas && (
                <View style={styles.gasWarning}>
                  <Ionicons name="warning-outline" size={13} color="#fbbf24" />
                  <Text style={styles.gasWarningText}>Low ETH for gas — top up to transact</Text>
                </View>
              )}

              <Text style={styles.balanceLabel}>USDC Balance</Text>
              {chainFetching ? (
                <ActivityIndicator color={theme.gold} size="large" style={{ marginVertical: 10 }} />
              ) : (
                <Text style={styles.balanceAmount}>{usdcBal}</Text>
              )}
              <Text style={styles.balanceUnit}>USDC</Text>
              {onChainBal === null && !chainFetching && (
                <Text style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Showing estimated earnings (RPC unavailable)</Text>
              )}
              <TouchableOpacity
                onPress={() => fetchOnChain(wallet?.address ?? '')}
                disabled={chainFetching}
                style={[styles.refreshBtn, chainFetching && { opacity: 0.5 }]}
              >
                <Ionicons name="refresh-outline" size={14} color="#fff" />
                <Text style={styles.refreshBtnText}>
                  {chainFetching ? 'Refreshing…' : 'Refresh Balance'}
                </Text>
              </TouchableOpacity>

              <View style={styles.ethRow}>
                <Ionicons name={"diamond-outline" as any} size={14} color="#94a3b8" />
                <Text style={styles.ethBal}>{ethBal} ETH</Text>
              </View>

              {address ? (
                <View style={styles.addressStrip}>
                  <View style={styles.addressPill}>
                    <Ionicons name="wallet-outline" size={13} color={theme.gold} />
                    <Text style={styles.addressText}>{fmt(address)}</Text>
                  </View>
                  <TouchableOpacity style={styles.copyBtn} onPress={copyAddress}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? theme.green : '#94a3b8'} />
                    <Text style={[styles.copyText, copied && { color: theme.green }]}>{copied ? 'Copied!' : 'Copy'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Breakdown */}
              {wallet?.breakdown && (
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Commission</Text>
                    <Text style={styles.breakdownVal}>{Number(wallet.breakdown.commissionUsdc).toFixed(2)} USDC</Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Sale proceeds</Text>
                    <Text style={styles.breakdownVal}>{Number(wallet.breakdown.proceedsUsdc).toFixed(2)} USDC</Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Deals closed</Text>
                    <Text style={styles.breakdownVal}>{wallet.completedDeals}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <ActionBtn icon="arrow-down-outline" label="Receive" active={panel === 'receive'} onPress={() => togglePanel('receive')} />
            <ActionBtn icon="arrow-up-outline"   label="Send"    active={panel === 'send'}    onPress={() => togglePanel('send')} />
            <ActionBtn icon="card-outline"        label="Buy USDC" onPress={() => {}} badge="Soon" />
            <ActionBtn icon="time-outline"         label="History"  onPress={() => {}} />
          </View>

          {/* Panels */}
          {panel !== 'none' && (
            <Animated.View style={[styles.panel, { opacity: panelAnim, transform: [{ translateY: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>{panel === 'receive' ? 'Receive USDC' : 'Send USDC'}</Text>
                <TouchableOpacity onPress={closePanel}>
                  <Ionicons name="close-circle-outline" size={22} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {panel === 'receive' && (
                <View style={styles.receiveContent}>
                  <View style={styles.qrBox}>
                    <QRPlaceholder theme={theme} />
                    <Text style={styles.qrLabel}>Scan to send USDC to this wallet</Text>
                  </View>
                  <Text style={styles.receiveAddrLabel}>Your wallet address</Text>
                  <View style={styles.receiveAddrBox}>
                    <Text style={styles.receiveAddr} selectable>{address}</Text>
                  </View>
                  <TouchableOpacity style={styles.copyFullBtn} onPress={copyAddress}>
                    <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={17} color={copied ? theme.green : theme.navy} />
                    <Text style={[styles.copyFullText, copied && { color: theme.green }]}>
                      {copied ? 'Address copied!' : 'Copy address'}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.receiveNote}>
                    <Ionicons name="information-circle-outline" size={14} color={theme.gold} />
                    <Text style={styles.receiveNoteText}>Only send USDC (Base / Ethereum) to this address.</Text>
                  </View>
                </View>
              )}

              {panel === 'send' && (
                <View>
                  {sendDone ? (
                    <View style={styles.sendSuccess}>
                      <Ionicons name="checkmark-circle" size={52} color={theme.green} />
                      <Text style={styles.sendSuccessTitle}>Withdrawal requested!</Text>
                      <Text style={styles.sendSuccessDesc}>Your funds will be sent to the destination address.</Text>
                      <TouchableOpacity style={styles.btnPrimary} onPress={() => { setSendDone(false); setSendTo(''); setSendAmt(''); closePanel(); }}>
                        <Text style={styles.btnText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <View style={styles.sendField}>
                        <Text style={styles.sendLabel}>Recipient address</Text>
                        <Pressable style={styles.sendInputWrap} onPress={() => sendToRef.current?.focus()}>
                          <Ionicons name="wallet-outline" size={16} color={theme.gold} style={{ marginRight: 8 }} />
                          <TextInput
                            ref={sendToRef}
                            style={[styles.sendInput, { flex: 1 }]}
                            placeholder="0x…"
                            placeholderTextColor="#9ca3af"
                            value={sendTo}
                            onChangeText={setSendTo}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        </Pressable>
                      </View>

                      <View style={styles.sendField}>
                        <Text style={styles.sendLabel}>Amount (USDC)</Text>
                        <Pressable style={styles.sendInputWrap} onPress={() => sendAmtRef.current?.focus()}>
                          <Text style={styles.usdcPrefix}>$</Text>
                          <TextInput
                            ref={sendAmtRef}
                            style={[styles.sendInput, { flex: 1, fontSize: 20, fontWeight: '800', color: theme.navy }]}
                            placeholder="0.00"
                            placeholderTextColor="#d1d5db"
                            keyboardType="numeric"
                            value={sendAmt}
                            onChangeText={setSendAmt}
                          />
                          <Text style={styles.usdcSuffix}>USDC</Text>
                        </Pressable>
                        <Text style={styles.sendAvail}>Available: {usdcBal} USDC</Text>
                      </View>

                      {sendErr ? (
                        <View style={styles.errBox}>
                          <Ionicons name="alert-circle-outline" size={14} color={theme.errorText} />
                          <Text style={styles.errText}>{sendErr}</Text>
                        </View>
                      ) : null}

                      <TouchableOpacity style={styles.btnPrimary} onPress={handleSend} disabled={sending} activeOpacity={0.85}>
                        {sending
                          ? <ActivityIndicator color="#fff" />
                          : <>
                              <Ionicons name="paper-plane-outline" size={16} color="#fff" style={{ marginRight: 7 }} />
                              <Text style={styles.btnText}>Withdraw USDC</Text>
                            </>}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </Animated.View>
          )}

          <View style={styles.securityNote}>
            <Ionicons name="lock-closed-outline" size={15} color={theme.gold} />
            <Text style={styles.securityText}>
              Your private key is AES-256-GCM encrypted at rest. HybridAgent cannot access your funds without your action.
            </Text>
          </View>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function QRPlaceholder({ theme }: { theme: Theme }) {
  const qrStyles = makeQrStyles(theme);
  const cell = (filled: boolean) => (
    <View style={[qrStyles.cell, filled && qrStyles.cellFilled]} />
  );
  const rows = [
    [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,1,0,1,0,0,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,0,1,0,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
  ];
  return (
    <View style={qrStyles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={qrStyles.row}>
          {row.map((v, ci) => cell(v === 1))}
        </View>
      ))}
    </View>
  );
}
const makeQrStyles = (theme: Theme) => StyleSheet.create({
  grid: { padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  row:  { flexDirection: 'row' },
  cell: { width: 10, height: 10, backgroundColor: 'transparent' },
  cellFilled: { backgroundColor: theme.navy },
});

function ActionBtn({ icon, label, onPress, active, badge }: { icon: string; label: string; onPress: () => void; active?: boolean; badge?: string }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actionIcon, active && styles.actionIconActive]}>
        <Ionicons name={icon as any} size={21} color={active ? '#fff' : theme.navy} />
        {badge && (
          <View style={styles.actionBadge}>
            <Text style={styles.actionBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.actionLabel, active && { color: theme.navy, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: theme.background },

  topNav:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn:    { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  topTitle:   { fontSize: 17, fontWeight: '800', color: theme.navy },

  scroll:     { paddingBottom: 20 },

  balanceCard: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28, alignItems: 'center' },
  gasWarning:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fbbf2420', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
  gasWarningText: { fontSize: 12, color: '#fbbf24', fontWeight: '500' },
  balanceLabel: { fontSize: 12, color: theme.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  balanceAmount: { fontSize: 52, fontWeight: '900', color: theme.navy, letterSpacing: -1, lineHeight: 60 },
  balanceUnit:   { fontSize: 16, color: theme.textSecondary, fontWeight: '600', marginBottom: 12 },
  ethRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  ethBal:        { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
  addressStrip:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, width: '100%', marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  addressPill:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  addressText:   { fontSize: 14, color: theme.text, fontFamily: 'monospace' },
  copyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText:      { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },

  breakdownRow:     { flexDirection: 'row', width: '100%', backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  breakdownItem:    { flex: 1, alignItems: 'center', gap: 3 },
  breakdownLabel:   { fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  breakdownVal:     { fontSize: 13, fontWeight: '700', color: theme.navy },
  breakdownDivider: { width: 1, backgroundColor: theme.border, alignSelf: 'stretch', marginHorizontal: 4 },

  actions:    { flexDirection: 'row', backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20, gap: 8, borderTopWidth: 1, borderTopColor: theme.border },
  actionBtn:  { flex: 1, alignItems: 'center', gap: 7 },
  actionIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  actionIconActive: { backgroundColor: theme.navy },
  actionBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: theme.gold, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  actionBadgeText: { fontSize: 8, fontWeight: '800', color: theme.background === '#121212' ? '#121212' : '#fff' },
  actionLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '500', textAlign: 'center' },

  panel:       { marginHorizontal: 16, marginTop: 4, backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  panelTitle:  { fontSize: 16, fontWeight: '800', color: theme.navy },

  receiveContent:  { alignItems: 'center' },
  qrBox:           { alignItems: 'center', marginBottom: 16, gap: 8 },
  qrLabel:         { fontSize: 12, color: theme.textSecondary, textAlign: 'center' },
  receiveAddrLabel: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: theme.text, marginBottom: 6 },
  receiveAddrBox:  { width: '100%', backgroundColor: theme.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  receiveAddr:     { fontSize: 13, color: theme.text, fontFamily: 'monospace', lineHeight: 20 },
  copyFullBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10 },
  copyFullText:    { fontSize: 14, fontWeight: '600', color: theme.navy },
  receiveNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: theme.gold + '10', borderRadius: 10, padding: 10, marginTop: 4, width: '100%' },
  receiveNoteText: { fontSize: 12, color: theme.badgePendingText, flex: 1, lineHeight: 18 },

  sendField:    { marginBottom: 14 },
  sendLabel:    { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 },
  sendInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.inputBg, paddingHorizontal: 12 },
  sendInput:    { paddingVertical: 12, fontSize: 15, color: theme.text },
  usdcPrefix:   { fontSize: 18, fontWeight: '800', color: theme.textSecondary, marginRight: 4 },
  usdcSuffix:   { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginLeft: 4 },
  sendAvail:    { fontSize: 11, color: theme.textSecondary, marginTop: 4, marginLeft: 2 },
  errBox:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10, marginBottom: 12 },
  errText:      { fontSize: 13, color: theme.errorText, flex: 1 },
  sendSuccess:  { alignItems: 'center', gap: 10, paddingVertical: 8 },
  sendSuccessTitle: { fontSize: 22, fontWeight: '900', color: theme.navy },
  sendSuccessDesc:  { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

  btnPrimary:  { backgroundColor: theme.navy, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText:     { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 15 },

  securityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border },
  securityText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 18 },

  refreshBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.navy, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12 },
  refreshBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
