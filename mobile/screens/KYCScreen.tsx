import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet,
  StatusBar, TextInput, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { useAppTheme, type Theme } from '../lib/theme';

type KYCState = 'start' | 'personal' | 'document' | 'selfie' | 'review' | 'pending' | 'verified';
type DocType  = 'Passport' | 'National ID' | "Driver's Licence";

const DOC_TYPES: DocType[] = ['Passport', 'National ID', "Driver's Licence"];
const NATIONALITIES = ['Nigerian', 'Ghanaian', 'Kenyan', 'South African', 'British', 'American', 'Other'];

const STEP_LABELS = ['Personal', 'Document', 'Selfie', 'Review'];

// ── What KYC unlocks ─────────────────────────────────────────────────────────
const UNLOCKS = [
  { icon: 'storefront-outline',  text: 'Buy and sell listings' },
  { icon: 'lock-open-outline',   text: 'Fund and release escrow' },
  { icon: 'briefcase-outline',   text: 'Earn agent commissions on-chain' },
  { icon: 'trophy-outline',      text: 'Appear on the leaderboard' },
];

export default function KYCScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation();
  const theme  = useAppTheme();
  const styles = makeStyles(theme);

  const [state, setState] = useState<KYCState>('start');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Personal
  const [fullName, setFullName]     = useState('');
  const [dob, setDob]               = useState('');
  const [nationality, setNationality] = useState('');
  const [country, setCountry]       = useState('');

  // Document
  const [docType, setDocType]   = useState<DocType | null>(null);
  const [docFront, setDocFront] = useState<string | null>(null);
  const [docBack, setDocBack]   = useState<string | null>(null);

  // Selfie
  const [selfie, setSelfie] = useState<string | null>(null);

  const stepIndex = (['personal', 'document', 'selfie', 'review'] as KYCState[]).indexOf(state);

  const validate = (): boolean => {
    setError('');
    if (state === 'personal') {
      if (!fullName || !dob || !nationality || !country) { setError('Fill in all fields.'); return false; }
      const dobRx = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dobRx.test(dob)) { setError('Date of birth must be DD/MM/YYYY.'); return false; }
    }
    if (state === 'document') {
      if (!docType) { setError('Select a document type.'); return false; }
      if (!docFront) { setError('Upload the front of your document.'); return false; }
      if (docType !== 'Passport' && !docBack) { setError('Upload the back of your document.'); return false; }
    }
    if (state === 'selfie') {
      if (!selfie) { setError('Take or upload a selfie.'); return false; }
    }
    return true;
  };

  const next = () => {
    if (!validate()) return;
    const flow: KYCState[] = ['personal', 'document', 'selfie', 'review'];
    const idx = flow.indexOf(state as any);
    if (idx < flow.length - 1) { setState(flow[idx + 1]); return; }
    handleSubmit();
  };

  const back = () => {
    const flow: KYCState[] = ['personal', 'document', 'selfie', 'review'];
    const idx = flow.indexOf(state as any);
    if (idx > 0) { setState(flow[idx - 1]); } else { setState('start'); }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.kycVerify();
      // refresh cached user so Profile shows verified status
      const { user } = await api.me();
      await storage.setUser(user);
      setState('pending');
    } catch (e: any) {
      setError(e.message ?? 'KYC submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const pickImage = async (onPick: (uri: string) => void, camera = false) => {
    const picker = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const permFn  = camera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permFn();
    if (status !== 'granted') { setError('Permission required to access camera/photos.'); return; }
    const result = await picker({ quality: 0.8, allowsEditing: true, aspect: camera ? [1, 1] : [4, 3] });
    if (!result.canceled) onPick(result.assets[0].uri);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => state === 'start' || state === 'pending' || state === 'verified' ? nav.goBack() : back()}
        >
          <Ionicons name={state === 'start' || state === 'pending' || state === 'verified' ? 'close' : 'arrow-back'} size={20} color={theme.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Identity Verification</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Progress (only during flow) */}
      {stepIndex >= 0 && (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((stepIndex + 1) / 4) * 100}%` }]} />
          </View>
          <View style={styles.stepRow}>
            {STEP_LABELS.map((l, i) => (
              <Text key={l} style={[styles.stepLbl, i === stepIndex && styles.stepLblActive, i < stepIndex && styles.stepLblDone]}>
                {i < stepIndex ? '✓ ' : ''}{l}
              </Text>
            ))}
          </View>
        </>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ──────────────────── START ──────────────────── */}
          {state === 'start' && (
            <View>
              {/* Tier card */}
              <View style={styles.tierCard}>
                <View style={styles.tierRow}>
                  <TierBadge tier={1} active label="Account created" done theme={theme} />
                  <View style={styles.tierLine} />
                  <TierBadge tier={2} label="KYC Verified" active={false} theme={theme} />
                </View>
                <Text style={styles.tierHint}>You are currently at Tier 1. Complete Tier 2 to transact.</Text>
              </View>

              {/* What you unlock */}
              <Text style={styles.sectionTitle}>What Tier 2 unlocks</Text>
              <View style={styles.unlockCard}>
                {UNLOCKS.map(u => (
                  <View key={u.text} style={styles.unlockRow}>
                    <View style={styles.unlockIcon}>
                      <Ionicons name={u.icon as any} size={18} color={theme.gold} />
                    </View>
                    <Text style={styles.unlockText}>{u.text}</Text>
                  </View>
                ))}
              </View>

              {/* What you need */}
              <Text style={styles.sectionTitle}>What you'll need</Text>
              <View style={styles.needCard}>
                {[
                  { icon: 'document-text-outline', text: "Government-issued ID (passport, national ID, or driver's licence)" },
                  { icon: 'camera-outline',         text: 'A selfie — taken live or from your camera roll' },
                  { icon: 'time-outline',           text: '5 minutes — usually approved within 24 hours' },
                ].map(n => (
                  <View key={n.text} style={styles.needRow}>
                    <Ionicons name={n.icon as any} size={16} color={theme.navy} style={{ marginTop: 1 }} />
                    <Text style={styles.needText}>{n.text}</Text>
                  </View>
                ))}
              </View>

              {/* Privacy note */}
              <View style={styles.privacyBox}>
                <Ionicons name="shield-outline" size={15} color={theme.gold} />
                <Text style={styles.privacyText}>
                  Your documents are encrypted in transit and stored securely. HybridAgent uses them only to verify your identity and comply with AML regulations.
                </Text>
              </View>

              <TouchableOpacity style={styles.btnPrimary} onPress={() => setState('personal')} activeOpacity={0.85}>
                <Text style={styles.btnText}>Start Verification</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 7 }} />
              </TouchableOpacity>
            </View>
          )}

          {/* ──────────────────── PERSONAL ──────────────────── */}
          {state === 'personal' && (
            <View>
              <Text style={styles.stepTitle}>Personal Information</Text>
              <Text style={styles.stepSub}>Enter your details exactly as they appear on your ID.</Text>

              <KYCField label="Full Legal Name" icon="person-outline" value={fullName} onChange={setFullName} placeholder="Jane Adeyemi" theme={theme} />
              <KYCField label="Date of Birth" icon="calendar-outline" value={dob} onChange={setDob} placeholder="DD/MM/YYYY" keyboard="numeric" theme={theme} />

              <Text style={styles.fieldLabel}>Nationality</Text>
              <View style={styles.chipRow}>
                {NATIONALITIES.map(n => (
                  <TouchableOpacity key={n} style={[styles.chip, nationality === n && styles.chipActive]} onPress={() => setNationality(n)}>
                    <Text style={[styles.chipText, nationality === n && styles.chipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <KYCField label="Country of Residence" icon="location-outline" value={country} onChange={setCountry} placeholder="Nigeria" theme={theme} />
            </View>
          )}

          {/* ──────────────────── DOCUMENT ──────────────────── */}
          {state === 'document' && (
            <View>
              <Text style={styles.stepTitle}>Identity Document</Text>
              <Text style={styles.stepSub}>Upload clear photos of your government-issued ID.</Text>

              {/* Doc type selector */}
              <Text style={styles.fieldLabel}>Document Type</Text>
              <View style={styles.docTypeRow}>
                {DOC_TYPES.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.docTypeCard, docType === d && styles.docTypeCardActive]}
                    onPress={() => { setDocType(d); setDocBack(null); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={d === 'Passport' ? 'book-outline' : d === 'National ID' ? 'card-outline' : 'car-outline'}
                      size={22}
                      color={docType === d ? theme.gold : theme.emptyIcon}
                    />
                    <Text style={[styles.docTypeText, docType === d && styles.docTypeTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Upload areas */}
              <PhotoUploadBox
                label={docType === 'Passport' ? 'Photo page' : 'Front'}
                hint="Clear, flat, no glare"
                uri={docFront}
                onPick={() => pickImage(setDocFront)}
                onRetake={() => setDocFront(null)}
                theme={theme}
              />

              {docType && docType !== 'Passport' && (
                <PhotoUploadBox
                  label="Back"
                  hint="Clear, flat, no glare"
                  uri={docBack}
                  onPick={() => pickImage(uri => setDocBack(uri))}
                  onRetake={() => setDocBack(null)}
                  theme={theme}
                />
              )}

              <View style={styles.docHint}>
                <Ionicons name="information-circle-outline" size={14} color={theme.gold} />
                <Text style={styles.docHintText}>All 4 corners must be visible. Text must be legible.</Text>
              </View>
            </View>
          )}

          {/* ──────────────────── SELFIE ──────────────────── */}
          {state === 'selfie' && (
            <View>
              <Text style={styles.stepTitle}>Take a Selfie</Text>
              <Text style={styles.stepSub}>We'll compare this to your ID photo to confirm it's you.</Text>

              {selfie ? (
                <View style={styles.selfiePreview}>
                  <Image source={{ uri: selfie }} style={styles.selfieImg} />
                  <TouchableOpacity style={styles.selfieRetake} onPress={() => setSelfie(null)}>
                    <Ionicons name="refresh-outline" size={16} color={theme.navy} />
                    <Text style={styles.selfieRetakeText}>Retake</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <TouchableOpacity style={styles.selfieBox} onPress={() => pickImage(setSelfie, true)} activeOpacity={0.8}>
                    <View style={styles.selfieRing}>
                      <Ionicons name="camera-outline" size={36} color={theme.navy} />
                    </View>
                    <Text style={styles.selfieBoxTitle}>Take selfie with camera</Text>
                    <Text style={styles.selfieBoxSub}>Best result — uses your front camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.selfieAlt} onPress={() => pickImage(setSelfie, false)}>
                    <Ionicons name="images-outline" size={16} color={theme.navy} />
                    <Text style={styles.selfieAltText}>Upload from camera roll instead</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.selfieGuide}>
                {['Face centred and fully visible', 'Good lighting — no shadows', 'No glasses or hat', 'Neutral expression'].map(tip => (
                  <View key={tip} style={styles.selfieGuideLine}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={theme.green} />
                    <Text style={styles.selfieGuideText}>{tip}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ──────────────────── REVIEW ──────────────────── */}
          {state === 'review' && (
            <View>
              <Text style={styles.stepTitle}>Review & Submit</Text>
              <Text style={styles.stepSub}>Check everything looks correct before submitting.</Text>

              <View style={styles.reviewCard}>
                <ReviewRow label="Full Name"   value={fullName} theme={theme} />
                <ReviewRow label="Date of Birth" value={dob} theme={theme} />
                <ReviewRow label="Nationality" value={nationality} theme={theme} />
                <ReviewRow label="Country"     value={country} theme={theme} />
                <ReviewRow label="Document"    value={docType ?? '—'} theme={theme} />
                <ReviewRow label="Front photo" value={docFront ? '✓ Uploaded' : '—'} ok={!!docFront} theme={theme} />
                {docType !== 'Passport' && (
                  <ReviewRow label="Back photo"  value={docBack ? '✓ Uploaded' : '—'} ok={!!docBack} theme={theme} />
                )}
                <ReviewRow label="Selfie"      value={selfie ? '✓ Uploaded' : '—'} ok={!!selfie} last theme={theme} />
              </View>

              <View style={styles.consentBox}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.gold} />
                <Text style={styles.consentText}>
                  By submitting, you confirm that all information is accurate and consent to HybridAgent processing your data for identity verification under our Privacy Policy.
                </Text>
              </View>
            </View>
          )}

          {/* ──────────────────── PENDING ──────────────────── */}
          {state === 'pending' && (
            <View style={styles.centreState}>
              <View style={styles.pendingRing}>
                <Ionicons name="time-outline" size={44} color={theme.gold} />
              </View>
              <Text style={styles.centreTitle}>Verification submitted</Text>
              <Text style={styles.centreSub}>
                Your documents are being reviewed. This usually takes less than 24 hours. We'll notify you when it's done.
              </Text>

              <View style={styles.pendingSteps}>
                {[
                  { label: 'Documents received',      done: true },
                  { label: 'Identity check in progress', done: false },
                  { label: 'Tier 2 unlocked',          done: false },
                ].map(s => (
                  <View key={s.label} style={styles.pendingStep}>
                    <View style={[styles.pendingDot, s.done && styles.pendingDotDone]}>
                      {s.done && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <Text style={[styles.pendingLabel, s.done && styles.pendingLabelDone]}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* Simulate verified for demo */}
              <TouchableOpacity style={styles.btnGhost} onPress={() => setState('verified')}>
                <Text style={styles.btnGhostText}>Simulate approval (demo)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ──────────────────── VERIFIED ──────────────────── */}
          {state === 'verified' && (
            <View style={styles.centreState}>
              <View style={styles.verifiedRing}>
                <Ionicons name="shield-checkmark" size={48} color={theme.green} />
              </View>
              <Text style={styles.centreTitle}>Verified ✓</Text>
              <Text style={styles.centreSub}>You are now a Tier 2 verified user. All marketplace features are unlocked.</Text>

              <View style={styles.verifiedCard}>
                {UNLOCKS.map(u => (
                  <View key={u.text} style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.green} />
                    <Text style={styles.verifiedText}>{u.text}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.btnPrimary} onPress={() => nav.goBack()} activeOpacity={0.85}>
                <Text style={styles.btnText}>Back to Profile</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error */}
          {error && state !== 'pending' && state !== 'verified' && (
            <View style={styles.errBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
              <Text style={styles.errText}>{error}</Text>
            </View>
          )}

          {/* CTA */}
          {state !== 'start' && state !== 'pending' && state !== 'verified' && (
            <TouchableOpacity style={styles.btnPrimary} onPress={next} disabled={submitting} activeOpacity={0.85}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={styles.btnText}>{state === 'review' ? 'Submit for Review' : 'Continue'}</Text>
                    <Ionicons name={state === 'review' ? 'checkmark' : 'arrow-forward'} size={16} color="#fff" style={{ marginLeft: 7 }} />
                  </>}
            </TouchableOpacity>
          )}

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TierBadge({ tier, label, done, active, theme }: { tier: number; label: string; done?: boolean; active: boolean, theme: Theme }) {
  const tierStyles = makeTierStyles(theme);
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={[tierStyles.dot, active && tierStyles.dotActive, done && tierStyles.dotDone]}>
        {done
          ? <Ionicons name="checkmark" size={14} color="#fff" />
          : <Text style={tierStyles.num}>{tier}</Text>}
      </View>
      <Text style={[tierStyles.label, done && tierStyles.labelDone]}>{label}</Text>
    </View>
  );
}
const makeTierStyles = (theme: Theme) => StyleSheet.create({
  dot:       { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.border },
  dotActive: { borderColor: theme.navy },
  dotDone:   { backgroundColor: theme.green, borderColor: theme.green },
  num:       { fontSize: 14, fontWeight: '800', color: theme.textSecondary },
  label:     { fontSize: 11, color: theme.textSecondary, textAlign: 'center', fontWeight: '600' },
  labelDone: { color: theme.green },
});

function KYCField({ label, icon, value, onChange, placeholder, keyboard, theme }: {
  label: string; icon: string; value: string; onChange: (t: string) => void; placeholder?: string; keyboard?: any; theme: Theme;
}) {
  const inputRef = useRef<TextInput>(null);
  const styles = makeStyles(theme);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.inputWrap} onPress={() => inputRef.current?.focus()}>
        <Ionicons name={icon as any} size={16} color={theme.gold} style={{ marginRight: 8 }} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { flex: 1 }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          keyboardType={keyboard}
          value={value}
          onChangeText={onChange}
          autoCapitalize="words"
        />
      </Pressable>
    </View>
  );
}

function PhotoUploadBox({ label, hint, uri, onPick, onRetake, theme }: {
  label: string; hint: string; uri: string | null; onPick: () => void; onRetake: () => void; theme: Theme;
}) {
  const styles = makeStyles(theme);
  const photoStyles = makePhotoStyles(theme);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {uri ? (
        <View style={photoStyles.preview}>
          <Image source={{ uri }} style={photoStyles.img} resizeMode="cover" />
          <TouchableOpacity style={photoStyles.retakeBtn} onPress={onRetake}>
            <Ionicons name="refresh-outline" size={14} color={theme.navy} />
            <Text style={photoStyles.retakeText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={photoStyles.uploadBox} onPress={onPick} activeOpacity={0.8}>
          <Ionicons name="cloud-upload-outline" size={28} color={theme.emptyIcon} />
          <Text style={photoStyles.uploadLabel}>Tap to upload {label.toLowerCase()}</Text>
          <Text style={photoStyles.uploadHint}>{hint}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const makePhotoStyles = (theme: Theme) => StyleSheet.create({
  uploadBox:    { height: 140, borderRadius: 14, borderWidth: 2, borderColor: theme.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f9fafb', gap: 6 },
  uploadLabel:  { fontSize: 13, fontWeight: '600', color: theme.text },
  uploadHint:   { fontSize: 11, color: theme.textSecondary },
  preview:      { borderRadius: 14, overflow: 'hidden', backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6' },
  img:          { width: '100%', height: 160 },
  retakeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f9fafb' },
  retakeText:   { fontSize: 13, color: theme.navy, fontWeight: '600' },
});

function ReviewRow({ label, value, ok, last, theme }: { label: string; value: string; ok?: boolean; last?: boolean, theme: Theme }) {
  const styles = makeStyles(theme);
  return (
    <View style={[styles.reviewRow, !last && styles.reviewRowBorder]}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, ok === true && { color: theme.green }, ok === false && { color: theme.errorText }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (theme: Theme) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: theme.navy },

  progressTrack: { height: 3, backgroundColor: theme.border },
  progressFill:  { height: 3, backgroundColor: theme.gold },
  stepRow:       { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  stepLbl:       { fontSize: 11, color: theme.border, fontWeight: '600' },
  stepLblActive: { color: theme.navy },
  stepLblDone:   { color: theme.gold },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Start screen
  tierCard:  { backgroundColor: theme.card, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 20, marginBottom: 20 },
  tierRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 12 },
  tierLine:  { flex: 1, height: 2, backgroundColor: theme.border, marginHorizontal: 8, maxWidth: 60 },
  tierHint:  { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 18 },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.navy, marginBottom: 10 },

  unlockCard: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 20 },
  unlockRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.border },
  unlockIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.gold + '12', alignItems: 'center', justifyContent: 'center' },
  unlockText: { fontSize: 14, color: theme.text, fontWeight: '500' },

  needCard: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 20, gap: 12 },
  needRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  needText: { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 19 },

  privacyBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: theme.gold + '10', borderRadius: 14, borderWidth: 1, borderColor: theme.gold + '30', padding: 13, marginBottom: 20 },
  privacyText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 },

  // Form steps
  stepTitle: { fontSize: 22, fontWeight: '800', color: theme.navy, marginBottom: 6 },
  stepSub:   { fontSize: 14, color: theme.textSecondary, marginBottom: 22, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12 },
  input:      { paddingVertical: 12, fontSize: 15, color: theme.text },

  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:     { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.border },
  chipActive: { backgroundColor: theme.navy, borderColor: theme.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  chipTextActive: { color: theme.background === '#121212' ? '#121212' : '#fff' },

  // Document
  docTypeRow:      { flexDirection: 'row', gap: 8, marginBottom: 18 },
  docTypeCard:     { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 7, borderRadius: 14, borderWidth: 2, borderColor: theme.border, backgroundColor: theme.card },
  docTypeCardActive: { borderColor: theme.gold, backgroundColor: theme.gold + '08' },
  docTypeText:     { fontSize: 11, fontWeight: '700', color: theme.emptyIcon, textAlign: 'center' },
  docTypeTextActive: { color: theme.navy },
  docHint:         { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: theme.gold + '10', borderRadius: 10, marginTop: 4, marginBottom: 28 },
  docHintText:     { fontSize: 12, color: theme.background === '#121212' ? theme.gold : '#92400e', flex: 1 },

  // Selfie
  selfieBox:       { borderRadius: 18, borderWidth: 2, borderColor: theme.border, borderStyle: 'dashed', paddingVertical: 40, alignItems: 'center', backgroundColor: theme.card, marginBottom: 14, gap: 10 },
  selfieRing:      { width: 76, height: 76, borderRadius: 38, backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6', borderWidth: 2, borderColor: theme.navy + '25', alignItems: 'center', justifyContent: 'center' },
  selfieBoxTitle:  { fontSize: 15, fontWeight: '700', color: theme.navy },
  selfieBoxSub:    { fontSize: 12, color: theme.emptyIcon },
  selfieAlt:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, marginBottom: 16 },
  selfieAltText:   { fontSize: 14, color: theme.navy, fontWeight: '600' },
  selfiePreview:   { borderRadius: 14, overflow: 'hidden', marginBottom: 14 },
  selfieImg:       { width: '100%', height: 260 },
  selfieRetake:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, backgroundColor: theme.background === '#121212' ? '#1e1e1e' : '#f9fafb' },
  selfieRetakeText: { fontSize: 13, color: theme.navy, fontWeight: '600' },
  selfieGuide:     { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 10, marginBottom: 28 },
  selfieGuideLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selfieGuideText: { fontSize: 13, color: theme.text },

  // Review
  reviewCard:   { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 16 },
  reviewRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.background },
  reviewLabel:  { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },
  reviewValue:  { fontSize: 13, color: theme.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  consentBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: theme.navy + '08', borderRadius: 14, borderWidth: 1, borderColor: theme.navy + '15', padding: 13, marginBottom: 20 },
  consentText:  { flex: 1, fontSize: 12, color: theme.text, lineHeight: 18 },

  // Centre states (pending / verified)
  centreState:   { alignItems: 'center', paddingTop: 20, gap: 12 },
  pendingRing:   { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: theme.gold + '55', backgroundColor: theme.gold + '10', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  verifiedRing:  { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: theme.green + '55', backgroundColor: theme.green + '10', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  centreTitle:   { fontSize: 24, fontWeight: '900', color: theme.navy, textAlign: 'center' },
  centreSub:     { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },

  pendingSteps:   { width: '100%', backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 14, marginTop: 8 },
  pendingStep:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingDot:     { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6', borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  pendingDotDone: { backgroundColor: theme.green, borderColor: theme.green },
  pendingLabel:   { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
  pendingLabelDone: { color: theme.text, fontWeight: '600' },

  verifiedCard:  { width: '100%', backgroundColor: theme.badgeSuccessBg, borderRadius: 16, borderWidth: 1, borderColor: theme.green + '30', padding: 16, gap: 12 },
  verifiedRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifiedText:  { fontSize: 14, color: theme.successText, fontWeight: '500' },

  // Shared buttons
  btnPrimary:  { backgroundColor: theme.navy, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, width: '100%' },
  btnText:     { color: theme.background === '#121212' ? '#121212' : '#fff', fontWeight: '700', fontSize: 16 },
  btnGhost:    { paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },

  errBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.background === '#121212' ? '#7f1d1d' : '#fef2f2', borderWidth: 1, borderColor: theme.errorText + '50', borderRadius: 10, padding: 12, marginBottom: 16 },
  errText: { color: theme.errorText, fontSize: 13, flex: 1 },
});
