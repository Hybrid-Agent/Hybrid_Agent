import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Pressable,
  StyleSheet, StatusBar, Image, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { api } from '../lib/api';

const NAVY = '#0c2340';
const GOLD = '#c9912a';

type AssetType   = 'property' | 'vehicle';
type ListingRole = 'owner_direct' | 'agent_brokered';
type PropSubtype = 'Duplex' | 'Flat/Apartment' | 'Bungalow' | 'Land' | 'Commercial';

const PROP_TYPES: PropSubtype[] = ['Duplex', 'Flat/Apartment', 'Bungalow', 'Land', 'Commercial'];

const BASE_STEPS   = ['Type', 'Details', 'Photos', 'Role'];
const AGENT_STEPS  = ['Type', 'Details', 'Photos', 'Role', 'Owner'];

export default function CreateListingScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const descRef   = useRef<TextInput>(null);

  // Step 0 — Type
  const [assetType, setAssetType] = useState<AssetType | null>(null);

  // Step 1 — Details
  const [title, setTitle]       = useState('');
  const [price, setPrice]       = useState('');
  const [description, setDesc]  = useState('');
  const [propSubtype, setPropSubtype] = useState<PropSubtype | null>(null);
  const [bedrooms, setBedrooms]       = useState('');
  const [bathrooms, setBathrooms]     = useState('');
  const [make, setMake]   = useState('');
  const [year, setYear]   = useState('');
  const [mileage, setMileage] = useState('');

  // Step 2 — Photos
  const [photos, setPhotos] = useState<string[]>([]);

  // Step 3 — Role
  const [role, setRole]             = useState<ListingRole | null>(null);
  const [commission, setCommission] = useState('');

  // Step 4 — Owner (agent_brokered only)
  const [ownerName, setOwnerName]   = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [authDocs, setAuthDocs]     = useState<string[]>([]);

  // Post-submit pending state
  const [pendingApproval, setPendingApproval] = useState(false);

  const STEPS = role === 'agent_brokered' ? AGENT_STEPS : BASE_STEPS;
  const isLastStep = step === STEPS.length - 1;

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    setError('');
    if (step === 0) {
      if (!assetType) { setError('Select an asset type.'); return false; }
    }
    if (step === 1) {
      if (!title || !price || !description) { setError('Fill in all required fields.'); return false; }
      if (isNaN(Number(price.replace(/,/g, '')))) { setError('Price must be a number.'); return false; }
      if (assetType === 'property' && !propSubtype) { setError('Select a property type.'); return false; }
      if (assetType === 'vehicle' && (!make || !year)) { setError('Fill in make and year.'); return false; }
    }
    if (step === 3) {
      if (!role) { setError('Select a listing role.'); return false; }
      if (role === 'agent_brokered') {
        const bps = Number(commission);
        if (!commission || isNaN(bps) || bps <= 0 || bps > 30) { setError('Commission must be 1–30%.'); return false; }
      }
    }
    if (step === 4) {
      if (!ownerName.trim()) { setError("Enter the owner's full name."); return false; }
      if (!ownerEmail.trim()) { setError("Enter the owner's email address."); return false; }
      const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRx.test(ownerEmail)) { setError('Enter a valid email address.'); return false; }
      if (authDocs.length === 0) { setError('Upload at least one authorization document.'); return false; }
    }
    return true;
  };

  const next = () => {
    if (!validate()) return;
    if (!isLastStep) { setStep(s => s + 1); return; }
    submit();
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('assetType', assetType!);
      form.append('listingType', role!);
      form.append('title', title);
      form.append('description', description);
      form.append('priceUsdc', String(Number(price.replace(/,/g, ''))));

      if (role === 'agent_brokered') {
        // commission: UI shows percent (e.g. "5"), backend wants bps (500)
        form.append('commissionBps', String(Math.round(Number(commission) * 100)));
        form.append('ownerName', ownerName);
        form.append('ownerEmail', ownerEmail);
        
        // append all auth docs
        authDocs.forEach((uri) => {
          const name = uri.split('/').pop() ?? 'doc.pdf';
          const isPdf = uri.toLowerCase().endsWith('.pdf');
          const type = isPdf ? 'application/pdf' : name.endsWith('.png') ? 'image/png' : 'image/jpeg';
          form.append('authDocs', { uri, name, type } as any);
        });
      }

      if (photos.length > 0) {
        const uri = photos[0];
        const name = uri.split('/').pop() ?? 'photo.jpg';
        const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
        form.append('image', { uri, name, type } as any);
      }

      await api.createListing(form);

      if (role === 'agent_brokered') {
        setPendingApproval(true);
      } else {
        nav.goBack();
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to create listing.');
    } finally {
      setLoading(false);
    }
  };

  // ── Media pickers ───────────────────────────────────────────────────────────

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Camera roll permission required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 6 - photos.length,
    });
    if (!result.canceled) {
      setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 6));
    }
  };

  const pickDocs = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (!result.canceled) {
        setAuthDocs(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 5));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to pick document');
    }
  };

  const removePhoto = (i: number) => setPhotos(prev => prev.filter((_, idx) => idx !== i));
  const removeDoc   = (i: number) => setAuthDocs(prev => prev.filter((_, idx) => idx !== i));

  // ── Pending approval screen ─────────────────────────────────────────────────

  if (pendingApproval) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.header}>
          <View style={{ width: 38 }} />
          <Text style={styles.headerTitle}>Submitted</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, { alignItems: 'center', paddingTop: 40 }]}>
          {/* Icon */}
          <View style={styles.pendingRing}>
            <Ionicons name="mail-outline" size={44} color={GOLD} />
          </View>

          <Text style={styles.pendingTitle}>Waiting for owner approval</Text>
          <Text style={styles.pendingSub}>
            We've sent an approval email to{'\n'}
            <Text style={{ fontWeight: '700', color: NAVY }}>{ownerEmail}</Text>
          </Text>

          {/* Timeline */}
          <View style={styles.timelineCard}>
            {[
              { icon: 'checkmark-circle',      color: '#22c55e', label: 'Listing submitted',          done: true },
              { icon: 'mail-outline',           color: GOLD,      label: 'Approval email sent to owner', done: true },
              { icon: 'finger-print-outline',  color: '#9ca3af', label: 'Owner verifies & approves',  done: false },
              { icon: 'rocket-outline',        color: '#9ca3af', label: 'Listing goes live',           done: false },
            ].map((s, i, arr) => (
              <View key={s.label} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, { backgroundColor: s.done ? s.color : '#f3f4f6', borderColor: s.done ? s.color : '#e5e7eb' }]}>
                    <Ionicons name={s.icon as any} size={14} color={s.done ? '#fff' : '#d1d5db'} />
                  </View>
                  {i < arr.length - 1 && <View style={[styles.timelineLine, { backgroundColor: s.done ? GOLD + '40' : '#e5e7eb' }]} />}
                </View>
                <Text style={[styles.timelineLabel, s.done && { color: '#111827', fontWeight: '600' }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Info box */}
          <View style={styles.pendingInfoBox}>
            <Ionicons name="information-circle-outline" size={16} color={GOLD} />
            <Text style={styles.pendingInfoText}>
              The owner will receive an email with your name, the listing details, and an <Text style={{ fontWeight: '700' }}>Approve</Text> button. The listing only publishes after they click it. You'll be notified immediately.
            </Text>
          </View>

          {/* Owner recap */}
          <View style={styles.ownerRecap}>
            <View style={styles.ownerRecapRow}>
              <Text style={styles.ownerRecapLabel}>Owner</Text>
              <Text style={styles.ownerRecapValue}>{ownerName}</Text>
            </View>
            <View style={[styles.ownerRecapRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.ownerRecapLabel}>Email</Text>
              <Text style={styles.ownerRecapValue} numberOfLines={1}>{ownerEmail}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.btnPrimary, { width: '100%', marginTop: 8 }]} onPress={() => nav.goBack()} activeOpacity={0.85}>
            <Text style={styles.btnText}>Back to Dashboard</Text>
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Main flow ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => step > 0 ? setStep(s => s - 1) : nav.goBack()}
        >
          <Ionicons name={step > 0 ? 'arrow-back' : 'close'} size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Listing</Text>
        <Text style={styles.headerStep}>{step + 1} / {STEPS.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>

      {/* Step labels */}
      <View style={styles.stepLabels}>
        {STEPS.map((s, i) => (
          <Text key={s} style={[styles.stepLabel, i === step && styles.stepLabelActive, i < step && styles.stepLabelDone]}>
            {i < step ? '✓ ' : ''}{s}
          </Text>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── STEP 0: TYPE ── */}
          {step === 0 && (
            <View style={styles.typeStep}>
              <Text style={styles.stepTitle}>What are you selling?</Text>
              <Text style={styles.stepSub}>Choose the type of asset for this listing.</Text>

              <TouchableOpacity
                style={[styles.typeCard, assetType === 'property' && styles.typeCardActive]}
                onPress={() => setAssetType('property')}
                activeOpacity={0.85}
              >
                <View style={[styles.typeIcon, assetType === 'property' && styles.typeIconActive]}>
                  <Ionicons name="business-outline" size={32} color={assetType === 'property' ? GOLD : '#9ca3af'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeCardTitle, assetType === 'property' && { color: NAVY }]}>Property</Text>
                  <Text style={styles.typeCardDesc}>House, duplex, apartment, land, commercial</Text>
                </View>
                <View style={[styles.radioOuter, assetType === 'property' && styles.radioActive]}>
                  {assetType === 'property' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeCard, assetType === 'vehicle' && styles.typeCardActive]}
                onPress={() => setAssetType('vehicle')}
                activeOpacity={0.85}
              >
                <View style={[styles.typeIcon, assetType === 'vehicle' && styles.typeIconActive]}>
                  <Ionicons name="car-sport-outline" size={32} color={assetType === 'vehicle' ? GOLD : '#9ca3af'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeCardTitle, assetType === 'vehicle' && { color: NAVY }]}>Vehicle</Text>
                  <Text style={styles.typeCardDesc}>Car, SUV, truck, motorcycle</Text>
                </View>
                <View style={[styles.radioOuter, assetType === 'vehicle' && styles.radioActive]}>
                  {assetType === 'vehicle' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 1: DETAILS ── */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Listing details</Text>
              <Text style={styles.stepSub}>Add the key information buyers will see.</Text>

              <InputField label="Title *" icon="create-outline" value={title} onChange={setTitle} placeholder={assetType === 'property' ? '3 Bed Duplex, Lekki Phase 1' : '2021 Toyota Land Cruiser V8'} />
              <InputField label="Price (USDC) *" icon="logo-usd" value={price} onChange={setPrice} placeholder="120000" keyboard="numeric" />

              {assetType === 'property' && (
                <>
                  <Text style={styles.fieldLabel}>Property Type *</Text>
                  <View style={styles.chipRow}>
                    {PROP_TYPES.map(t => (
                      <TouchableOpacity key={t} style={[styles.chip, propSubtype === t && styles.chipActive]} onPress={() => setPropSubtype(t)}>
                        <Text style={[styles.chipText, propSubtype === t && styles.chipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.row2}>
                    <View style={{ flex: 1 }}>
                      <InputField label="Bedrooms" icon="bed-outline" value={bedrooms} onChange={setBedrooms} placeholder="3" keyboard="numeric" />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <InputField label="Bathrooms" icon="water-outline" value={bathrooms} onChange={setBathrooms} placeholder="3" keyboard="numeric" />
                    </View>
                  </View>
                </>
              )}

              {assetType === 'vehicle' && (
                <>
                  <InputField label="Make & Model *" icon="car-outline" value={make} onChange={setMake} placeholder="Toyota Land Cruiser" />
                  <View style={styles.row2}>
                    <View style={{ flex: 1 }}>
                      <InputField label="Year *" icon="calendar-outline" value={year} onChange={setYear} placeholder="2021" keyboard="numeric" />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <InputField label="Mileage" icon="speedometer-outline" value={mileage} onChange={setMileage} placeholder="32,000 km" />
                    </View>
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Description *</Text>
              <Pressable
                style={[styles.inputWrap, { alignItems: 'flex-start', paddingTop: 12, marginBottom: 28 }]}
                onPress={() => descRef.current?.focus()}
              >
                <TextInput
                  ref={descRef}
                  style={[styles.input, { minHeight: 100, textAlignVertical: 'top', flex: 1 }]}
                  placeholder="Describe the property or vehicle in detail…"
                  placeholderTextColor="#9ca3af"
                  value={description}
                  onChangeText={setDesc}
                  multiline
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
                />
              </Pressable>
            </View>
          )}

          {/* ── STEP 2: PHOTOS ── */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>Photos</Text>
              <Text style={styles.stepSub}>Add up to 6 photos. First image is the cover.</Text>

              <View style={styles.photoGrid}>
                {photos.map((uri, i) => (
                  <View key={uri} style={styles.photoSlot}>
                    <Image source={{ uri }} style={styles.photoImg} />
                    {i === 0 && (
                      <View style={styles.coverBadge}>
                        <Text style={styles.coverBadgeText}>Cover</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}>
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < 6 && (
                  <TouchableOpacity style={styles.addPhotoSlot} onPress={pickPhotos} activeOpacity={0.8}>
                    <Ionicons name="camera-outline" size={28} color="#9ca3af" />
                    <Text style={styles.addPhotoText}>{photos.length === 0 ? 'Add photos' : 'Add more'}</Text>
                    <Text style={styles.addPhotoCount}>{photos.length}/6</Text>
                  </TouchableOpacity>
                )}
              </View>

              {photos.length === 0 && (
                <View style={styles.noPhotoHint}>
                  <Ionicons name="information-circle-outline" size={15} color="#9ca3af" />
                  <Text style={styles.noPhotoText}>Listings with photos get 3× more views. You can skip and add later.</Text>
                </View>
              )}
            </View>
          )}

          {/* ── STEP 3: ROLE ── */}
          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>Your role</Text>
              <Text style={styles.stepSub}>Who is selling this asset?</Text>

              <TouchableOpacity
                style={[styles.roleCard, role === 'owner_direct' && styles.roleCardActive]}
                onPress={() => setRole('owner_direct')}
                activeOpacity={0.85}
              >
                <View style={[styles.roleIcon, role === 'owner_direct' && styles.roleIconActive]}>
                  <Ionicons name="home-outline" size={22} color={role === 'owner_direct' ? GOLD : '#9ca3af'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roleTitle, role === 'owner_direct' && { color: NAVY }]}>I'm the owner</Text>
                  <Text style={styles.roleDesc}>Selling directly — no commission. Full sale price goes to you.</Text>
                </View>
                <View style={[styles.radioOuter, role === 'owner_direct' && styles.radioActive]}>
                  {role === 'owner_direct' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'agent_brokered' && styles.roleCardActive]}
                onPress={() => setRole('agent_brokered')}
                activeOpacity={0.85}
              >
                <View style={[styles.roleIcon, role === 'agent_brokered' && styles.roleIconActive]}>
                  <Ionicons name="briefcase-outline" size={22} color={role === 'agent_brokered' ? GOLD : '#9ca3af'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roleTitle, role === 'agent_brokered' && { color: NAVY }]}>I'm the agent</Text>
                  <Text style={styles.roleDesc}>Brokering on behalf of the owner — you'll invite them by email to approve.</Text>
                </View>
                <View style={[styles.radioOuter, role === 'agent_brokered' && styles.radioActive]}>
                  {role === 'agent_brokered' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              {/* Commission input — agent_brokered only */}
              {role === 'agent_brokered' && (
                <View style={styles.commissionCard}>
                  <Text style={styles.commissionTitle}>Your commission</Text>
                  <Text style={styles.commissionDesc}>Max 30%. Locked in escrow — paid atomically when the deal settles.</Text>
                  <View style={styles.commissionRow}>
                    <CommissionInput value={commission} onChange={setCommission} />
                    <Text style={styles.percentLabel}>%</Text>
                  </View>
                  {commission !== '' && !isNaN(Number(commission)) && (
                    <View style={styles.commissionPreview}>
                      <Ionicons name="calculator-outline" size={14} color={GOLD} />
                      <Text style={styles.commissionPreviewText}>
                        On a ${Number(price.replace(/,/g, '') || 0).toLocaleString()} listing →{' '}
                        <Text style={{ fontWeight: '700', color: '#fff' }}>
                          ${(Number(price.replace(/,/g, '') || 0) * Number(commission) / 100).toLocaleString()} USDC
                        </Text>
                        {' '}commission
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Summary — owner_direct only (agent_brokered summary is in step 4) */}
              {role === 'owner_direct' && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Review before submitting</Text>
                  <SummaryRow label="Type"   value={assetType === 'property' ? `Property · ${propSubtype ?? ''}` : `Vehicle · ${make}`} />
                  <SummaryRow label="Title"  value={title} />
                  <SummaryRow label="Price"  value={`$${Number(price.replace(/,/g, '') || 0).toLocaleString()} USDC`} />
                  <SummaryRow label="Photos" value={`${photos.length} image${photos.length !== 1 ? 's' : ''}`} />
                  <SummaryRow label="Role"   value="Owner (direct — no commission)" last />
                </View>
              )}
            </View>
          )}

          {/* ── STEP 4: OWNER (agent_brokered only) ── */}
          {step === 4 && (
            <View>
              <Text style={styles.stepTitle}>Owner details</Text>
              <Text style={styles.stepSub}>
                We'll email the owner to approve this listing before it goes live.
              </Text>

              {/* Owner name + email */}
              <InputField label="Owner's Full Name *" icon="person-outline" value={ownerName} onChange={setOwnerName} placeholder="Jane Adeyemi" />
              <InputField label="Owner's Email *" icon="mail-outline" value={ownerEmail} onChange={setOwnerEmail} placeholder="owner@example.com" keyboard="email-address" />

              {/* Authorization documents */}
              <Text style={styles.fieldLabel}>Authorization Documents *</Text>
              <Text style={styles.fieldHint}>
                Upload your mandate letter, power of attorney, or any document showing the owner authorized you to list this asset. Photos of physical documents are fine.
              </Text>

              <View style={styles.photoGrid}>
                {authDocs.map((uri, i) => {
                  const isPdf = uri.toLowerCase().endsWith('.pdf');
                  return (
                  <View key={uri} style={styles.photoSlot}>
                    {isPdf ? (
                      <View style={[styles.photoImg, { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="document-text" size={32} color="#9ca3af" />
                      </View>
                    ) : (
                      <Image source={{ uri }} style={styles.photoImg} />
                    )}
                    <View style={styles.docBadge}>
                      <Ionicons name="document-text-outline" size={10} color="#fff" />
                      <Text style={styles.docBadgeText}>DOC {i + 1}</Text>
                    </View>
                    <TouchableOpacity style={styles.removePhoto} onPress={() => removeDoc(i)}>
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )})}
                {authDocs.length < 5 && (
                  <TouchableOpacity style={styles.addPhotoSlot} onPress={pickDocs} activeOpacity={0.8}>
                    <Ionicons name="document-outline" size={28} color="#9ca3af" />
                    <Text style={styles.addPhotoText}>{authDocs.length === 0 ? 'Upload doc' : 'Add more'}</Text>
                    <Text style={styles.addPhotoCount}>{authDocs.length}/5</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* How approval works */}
              <View style={styles.approvalCard}>
                <View style={styles.approvalCardHeader}>
                  <Ionicons name="mail-outline" size={18} color={GOLD} />
                  <Text style={styles.approvalCardTitle}>How owner approval works</Text>
                </View>
                {[
                  { icon: 'send-outline',          text: 'We email the owner at the address above' },
                  { icon: 'eye-outline',            text: 'They see your name, listing details, and uploaded documents' },
                  { icon: 'checkmark-circle-outline', text: 'They click Approve — listing goes live instantly' },
                  { icon: 'notifications-outline',  text: 'You get notified the moment they approve' },
                ].map(item => (
                  <View key={item.text} style={styles.approvalStep}>
                    <View style={styles.approvalStepDot}>
                      <Ionicons name={item.icon as any} size={13} color={GOLD} />
                    </View>
                    <Text style={styles.approvalStepText}>{item.text}</Text>
                  </View>
                ))}
              </View>

              {/* Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Review before submitting</Text>
                <SummaryRow label="Type"        value={assetType === 'property' ? `Property · ${propSubtype ?? ''}` : `Vehicle · ${make}`} />
                <SummaryRow label="Title"       value={title} />
                <SummaryRow label="Price"       value={`$${Number(price.replace(/,/g, '') || 0).toLocaleString()} USDC`} />
                <SummaryRow label="Photos"      value={`${photos.length} image${photos.length !== 1 ? 's' : ''}`} />
                <SummaryRow label="Commission"  value={`${commission}% (${Math.round(Number(commission) * 100)} bps)`} />
                <SummaryRow label="Owner"       value={ownerName || '—'} />
                <SummaryRow label="Owner email" value={ownerEmail || '—'} />
                <SummaryRow label="Auth docs"   value={`${authDocs.length} document${authDocs.length !== 1 ? 's' : ''}`} last />
              </View>
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* CTA */}
          <TouchableOpacity style={styles.btnPrimary} onPress={next} activeOpacity={0.85} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Text style={styles.btnText}>
                    {isLastStep
                      ? (role === 'agent_brokered' ? 'Submit & Invite Owner' : 'Publish Listing')
                      : 'Continue'}
                  </Text>
                  {!loading && (
                    <Ionicons
                      name={isLastStep ? (role === 'agent_brokered' ? 'send-outline' : 'checkmark') : 'arrow-forward'}
                      size={17}
                      color="#fff"
                      style={{ marginLeft: 7 }}
                    />
                  )}
                </>}
          </TouchableOpacity>

          {step === 2 && (
            <TouchableOpacity style={styles.btnSkip} onPress={() => setStep(3)}>
              <Text style={styles.btnSkipText}>Skip photos for now</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InputField({
  label, icon, value, onChange, placeholder, keyboard,
}: {
  label: string; icon: string; value: string;
  onChange: (t: string) => void; placeholder?: string; keyboard?: any;
}) {
  const inputRef = useRef<TextInput>(null);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.inputWrap} onPress={() => inputRef.current?.focus()}>
        <Ionicons name={icon as any} size={16} color={GOLD} style={{ marginRight: 8 }} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { flex: 1 }]}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          keyboardType={keyboard}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
        />
      </Pressable>
    </View>
  );
}

const CommissionInput = ({ value, onChange }: { value: string; onChange: (t: string) => void }) => {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable style={[styles.inputWrap, { flex: 1, backgroundColor: '#ffffff18', borderColor: '#ffffff22' }]} onPress={() => ref.current?.focus()}>
      <TextInput
        ref={ref}
        style={[styles.input, { flex: 1, fontSize: 22, fontWeight: '800', color: '#fff' }]}
        placeholder="5"
        placeholderTextColor="#ffffff44"
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
      />
    </Pressable>
  );
};

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, !last && styles.summaryRowBorder]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f9fafb' },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: '#fff' },
  closeBtn:    { width: 38, height: 38, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  headerStep:  { fontSize: 13, color: '#9ca3af', fontWeight: '600' },

  progressTrack: { height: 3, backgroundColor: '#e5e7eb' },
  progressFill:  { height: 3, backgroundColor: GOLD, borderRadius: 2 },

  stepLabels:      { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  stepLabel:       { fontSize: 11, color: '#d1d5db', fontWeight: '600' },
  stepLabelActive: { color: NAVY },
  stepLabelDone:   { color: GOLD },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  stepTitle: { fontSize: 22, fontWeight: '800', color: NAVY, marginBottom: 6 },
  stepSub:   { fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 20 },

  // Type step
  typeStep:      { gap: 14, marginBottom: 28 },
  typeCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: '#e5e7eb', padding: 18 },
  typeCardActive: { borderColor: GOLD, backgroundColor: GOLD + '06' },
  typeIcon:       { width: 60, height: 60, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  typeIconActive: { backgroundColor: GOLD + '18' },
  typeCardTitle:  { fontSize: 18, fontWeight: '800', color: '#374151', marginBottom: 4 },
  typeCardDesc:   { fontSize: 13, color: '#9ca3af', lineHeight: 18 },

  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: GOLD },
  radioInner:  { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD },

  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  fieldHint:  { fontSize: 12, color: '#9ca3af', lineHeight: 18, marginBottom: 12, marginTop: -2 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12 },
  input:      { paddingVertical: 12, fontSize: 15, color: '#111827' },

  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: NAVY, borderColor: NAVY },
  chipText:   { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#fff' },

  row2: { flexDirection: 'row' },

  // Photos / docs
  photoGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  photoSlot:    { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  photoImg:     { width: '100%', height: '100%' },
  coverBadge:   { position: 'absolute', bottom: 5, left: 5, backgroundColor: NAVY + 'cc', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  docBadge:     { position: 'absolute', bottom: 5, left: 5, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: GOLD + 'cc', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  docBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  removePhoto:  { position: 'absolute', top: 4, right: 4 },
  addPhotoSlot: { width: '31%', aspectRatio: 1, borderRadius: 12, borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 4 },
  addPhotoText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  addPhotoCount: { fontSize: 10, color: '#d1d5db' },
  noPhotoHint:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, marginBottom: 28 },
  noPhotoText:  { flex: 1, fontSize: 12, color: '#9ca3af', lineHeight: 18 },

  // Role
  roleCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#e5e7eb', padding: 16, marginBottom: 12 },
  roleCardActive: { borderColor: GOLD, backgroundColor: GOLD + '06' },
  roleIcon:       { width: 48, height: 48, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  roleIconActive: { backgroundColor: GOLD + '18' },
  roleTitle:      { fontSize: 16, fontWeight: '800', color: '#374151', marginBottom: 4 },
  roleDesc:       { fontSize: 12, color: '#9ca3af', lineHeight: 17 },

  commissionCard:    { backgroundColor: NAVY, borderRadius: 16, padding: 16, marginBottom: 20 },
  commissionTitle:   { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  commissionDesc:    { fontSize: 12, color: '#94a3b8', lineHeight: 18, marginBottom: 14 },
  commissionRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  percentLabel:      { fontSize: 28, fontWeight: '900', color: GOLD },
  commissionPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: '#ffffff12', borderRadius: 10, padding: 10 },
  commissionPreviewText: { fontSize: 12, color: '#94a3b8', flex: 1, lineHeight: 18 },

  // Approval info card (step 4)
  approvalCard:       { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, marginBottom: 20 },
  approvalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  approvalCardTitle:  { fontSize: 14, fontWeight: '700', color: NAVY },
  approvalStep:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  approvalStepDot:    { width: 28, height: 28, borderRadius: 14, backgroundColor: GOLD + '12', borderWidth: 1, borderColor: GOLD + '30', alignItems: 'center', justifyContent: 'center' },
  approvalStepText:   { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19, paddingTop: 4 },

  // Summary
  summaryCard:     { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, marginBottom: 20 },
  summaryTitle:    { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 12 },
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  summaryLabel:    { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  summaryValue:    { fontSize: 13, color: '#111827', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  // Error
  errorBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },

  // Buttons
  btnPrimary: { backgroundColor: NAVY, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSkip:    { alignItems: 'center', paddingVertical: 10 },
  btnSkipText: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },

  // Pending approval screen
  pendingRing:   { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: GOLD + '55', backgroundColor: GOLD + '10', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  pendingTitle:  { fontSize: 24, fontWeight: '900', color: NAVY, textAlign: 'center', marginBottom: 10 },
  pendingSub:    { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  timelineCard: { width: '100%', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', padding: 20, marginBottom: 20 },
  timelineRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineDot:  { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, minHeight: 20, marginTop: 4, marginBottom: 4 },
  timelineLabel: { flex: 1, fontSize: 14, color: '#9ca3af', paddingTop: 4, paddingBottom: 16, lineHeight: 20 },

  pendingInfoBox:  { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: GOLD + '10', borderRadius: 14, borderWidth: 1, borderColor: GOLD + '30', padding: 14, marginBottom: 20 },
  pendingInfoText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 20 },

  ownerRecap:      { width: '100%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 20 },
  ownerRecapRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  ownerRecapLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  ownerRecapValue: { fontSize: 13, color: '#111827', fontWeight: '700', maxWidth: '65%', textAlign: 'right' },
});
