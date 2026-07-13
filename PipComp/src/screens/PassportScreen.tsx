// src/screens/PassportScreen.tsx
// Two-phase flow (Brief I): the consent ceremony first  nothing mints on mount 
// then the signed passport card. Regenerate routes back through the ceremony.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { PipEmblem } from '../components/CoinMascot';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FadeIn } from '../components/Motion';
import { Icon } from '../components/Icon';
import { Card, TopBar } from '../components/ui';
import { getOrCreateKeypair } from '../crypto/keys';
import { issuerSign } from '../crypto/issuer';
import { buildPassport, type CreditPassport } from '../lib/passport';
import { buildConsentReceipts, buildPassportDraft, monitoringScopeRow, tier0ScopeRows, tier1ScopeRows, tier2ScopeRows } from '../lib/consentScopes';
import { useCreditProfile } from '../state/useCreditProfile';
import { useAppData } from '../state/store';
import { DEFAULT_PRODUCTS } from '../lib/loans';
import { PassportCeremonyScreen } from './PassportCeremonyScreen';
import { colors, numFont, uiFont } from '../theme';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function PassportScreen({ onBack, onOpenKyc = () => {} }: { onBack: () => void; onOpenKyc?: () => void }) {
  const insets = useSafeAreaInsets();
  const { profile, score, dataConfidence, coverage, momentum, coachInput, incomeQuality, spendingProfile, obligations } = useCreditProfile();
  const { kyc, occupation, loanApplications, loanProducts } = useAppData();

  const [phase, setPhase] = useState<'consent' | 'minted'>('consent');
  const [includeIdentity, setIncludeIdentity] = useState(true);
  const [includeSpending, setIncludeSpending] = useState(true);
  const [includeMonitoring, setIncludeMonitoring] = useState(true);

  // Tier 3 monitoring (Brief S): offered whenever the borrower has an active loan, with the
  // grant's expiry drawn from that loan's own tenor. No active loan → no monitoring section,
  // the honest absence (mirrors momentum's own minimum-history floor pattern).
  const activeLoanTenorMonths = useMemo(() => {
    const active = loanApplications.find((a) => a.status === 'active');
    if (!active) return null;
    const products = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;
    const product = products.find((p) => p.id === active.productId);
    return product?.tenorMonths ?? null;
  }, [loanApplications, loanProducts]);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passport, setPassport] = useState<CreditPassport | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [issuerSignature, setIssuerSignature] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const sharedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current);
    };
  }, []);

  // The exact draft a confirm will sign  the ceremony's rows derive from it.
  const draftArgs = useMemo(
    () => ({
      profile,
      score,
      dataConfidence,
      coverage,
      momentum,
      amounts: coachInput.confidenceTxns.map((t) => t.amount),
      identity: kyc ? { fullName: kyc.fullName, nricMasked: kyc.nricMasked, provider: kyc.provider } : null,
      incomeQuality,
      obligations,
      spendingProfile,
      occupation: occupation
        ? { occupation: occupation.occupation, sector: occupation.sector, employmentType: occupation.employmentType, tenureMonths: occupation.tenureMonths }
        : null,
    }),
    [profile, score, dataConfidence, coverage, momentum, coachInput, kyc, incomeQuality, obligations, spendingProfile, occupation]
  );
  // Preview shows every attachable row (both grants on); the mint step honours the actual toggles.
  const previewDraft = useMemo(() => buildPassportDraft({ ...draftArgs, includeIdentity: true, includeSpending: true }), [draftArgs]);
  const tier0 = useMemo(() => tier0ScopeRows(previewDraft), [previewDraft]);
  const tier1 = useMemo(() => tier1ScopeRows(previewDraft), [previewDraft]);
  const tier2 = useMemo(() => tier2ScopeRows(previewDraft), [previewDraft]);
  const tier3 = useMemo(
    () => (activeLoanTenorMonths != null ? monitoringScopeRow(activeLoanTenorMonths) : null),
    [activeLoanTenorMonths]
  );

  // Mint  only reachable through the ceremony's explicit confirm.
  const mint = useCallback(async () => {
    setMinting(true);
    setError(null);
    setShared(false);
    try {
      const keypair = await getOrCreateKeypair();
      const draft = buildPassportDraft({ ...draftArgs, includeIdentity, includeSpending });
      // Signed consent receipts (Brief I stretch + Brief P + Brief S): Tier 0 always, Tier 1 when
      // identity or occupation is shared, Tier 2 when the spending profile is shared, Tier 3 when
      // minting against an active loan with the monitoring toggle left on.
      const consent = buildConsentReceipts(
        draft,
        new Date(),
        includeMonitoring && activeLoanTenorMonths != null ? { tenorMonths: activeLoanTenorMonths } : undefined,
      );
      const result = await buildPassport(
        { ...draft, subject: keypair.publicKeyHex, consent },
        keypair.sign.bind(keypair),
        issuerSign,
      );
      setPassport(result.passport);
      setSignature(result.signature);
      setIssuerSignature(result.issuerSignature ?? null);
      setPhase('minted');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('secure store') || msg.toLowerCase().includes('platform')) {
        setError('Passport not available on this platform');
      } else {
        setError(msg);
      }
    } finally {
      setMinting(false);
    }
  }, [draftArgs, includeIdentity, includeSpending, includeMonitoring, activeLoanTenorMonths]);

  // Regenerate discards the minted result and routes back through the ceremony.
  const regenerate = useCallback(() => {
    setPassport(null);
    setSignature(null);
    setIssuerSignature(null);
    setPhase('consent');
  }, []);

  const pasteCode = useMemo(
    () =>
      passport && signature
        ? JSON.stringify({ passport, signature, ...(issuerSignature ? { issuerSignature } : {}) })
        : '',
    [passport, signature, issuerSignature]
  );
  const shortCode = pasteCode ? `${pasteCode.slice(0, 16)}…${pasteCode.slice(-4)}` : '';

  const handleShare = async () => {
    if (!pasteCode) return;
    try {
      await Share.share({ message: pasteCode });
      setShared(true);
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current);
      sharedTimerRef.current = setTimeout(() => setShared(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg && msg.toLowerCase().includes('error')) console.error('Share error:', msg);
    }
  };

  // eKYC gate.
  if (!kyc) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title="Credit Passport" onBack={onBack} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}>
          <Card style={styles.centerCard}>
            <Icon name="alert" size={30} color="#a05c00" />
            <Text style={styles.gateTitle}>Verify your identity first</Text>
            <Text style={styles.gateBody}>
              Your Credit Passport is what lenders verify to offer you financing, so it must be bound to your verified
              identity. This is a one-time check.
            </Text>
            <Pressable style={styles.gateBtn} onPress={onOpenKyc}>
              <Text style={styles.gateBtnText}>Verify identity</Text>
            </Pressable>
          </Card>
        </ScrollView>
      </View>
    );
  }

  // Consent ceremony  the only path to minting.
  if (phase !== 'minted' || !passport || !signature) {
    return (
      <PassportCeremonyScreen
        tier0={tier0}
        tier1={tier1}
        tier2={tier2}
        tier3={tier3}
        includeIdentity={includeIdentity}
        onToggleIdentity={setIncludeIdentity}
        includeSpending={includeSpending}
        onToggleSpending={setIncludeSpending}
        includeMonitoring={includeMonitoring}
        onToggleMonitoring={setIncludeMonitoring}
        onConfirm={mint}
        onBack={onBack}
        minting={minting}
        error={error}
      />
    );
  }

  const holder = passport.holder;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Credit Passport" onBack={onBack} />
      </View>
      <Text style={styles.subtitle}>Share your verified score with any lender</Text>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <FadeIn key={passport.issuedAt} style={styles.passportCard}>
          {/* Dark header strip */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.brandRow}>
                <PipEmblem size={34} />
                <View>
                  <Text style={styles.brand}>Pip Credit</Text>
                  <Text style={styles.brandSub}>Malaysia · Official</Text>
                </View>
              </View>
              <View style={styles.activeChip}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            </View>

            <View style={styles.holderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Holder</Text>
                <Text style={styles.holderName} numberOfLines={1}>{holder ? holder.name : 'Anonymous'}</Text>
                <Text style={styles.holderSub} numberOfLines={1}>
                  {holder ? `Verified · ${holder.provider}` : 'Identity not shared · aggregates only'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.fieldLabel}>Score</Text>
                <Text style={styles.scoreNum}>{Math.round(passport.score)}</Text>
                <View style={styles.scorePill}>
                  <Text style={styles.scorePillText}>{passport.band}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* QR body */}
          <View style={styles.qrBody}>
            <Text style={styles.scanHint}>Present to lender · Scan to verify</Text>
            <View style={styles.qrWrap}>
              <ErrorBoundary
                fallback={() => (
                  <View style={[styles.qrFallback, { width: 168, height: 168 }]}>
                    <Text style={styles.qrFallbackText}>QR unavailable</Text>
                    <Text style={styles.qrFallbackSub}>Use Share or the code below</Text>
                  </View>
                )}
              >
                <QRCode value={pasteCode} size={168} ecl="L" color={colors.passportDark} backgroundColor="#ffffff" />
              </ErrorBoundary>
            </View>

            <View style={styles.codeRow}>
              <View style={styles.codeField}>
                <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                  <Rect x={5} y={11} width={14} height={11} rx={2} stroke={colors.accent} strokeWidth={2} />
                  <Path d="M8 11V7a4 4 0 018 0v4" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
                </Svg>
                <Text style={styles.codeText} numberOfLines={1}>{shortCode}</Text>
              </View>
              <Pressable onPress={handleShare} style={[styles.copyBtn, shared && styles.copyBtnDone]}>
                <Text style={[styles.copyText, shared && styles.copyTextDone]}>{shared ? '✓ Shared' : 'Share'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Perforated divider */}
          <View style={styles.perfRow}>
            <View style={[styles.perfNotch, { left: -13, borderTopRightRadius: 13, borderBottomRightRadius: 13 }]} />
            <View style={styles.perfLine} />
            <View style={[styles.perfNotch, { right: -13, borderTopLeftRadius: 13, borderBottomLeftRadius: 13 }]} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.datesRow}>
              <View>
                <Text style={styles.dateLabel}>Issued</Text>
                <Text style={styles.dateValue}>{formatDate(passport.issuedAt)}</Text>
              </View>
              <View style={styles.dateDivider} />
              <View>
                <Text style={styles.dateLabel}>Valid until</Text>
                <Text style={styles.dateValue}>{formatDate(passport.validUntil)}</Text>
              </View>
              <View style={styles.dateDivider} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.dateLabel}>Confidence</Text>
                <Text style={[styles.dateValue, { color: colors.accent }]}>{Math.round(dataConfidence.confidence * 100)}%</Text>
              </View>
            </View>

            <View style={styles.signedBadge}>
              <Svg width={13} height={15} viewBox="0 0 14 16" fill="none">
                <Path d="M7 1L1.5 4v5.2C1.5 12.8 3.9 15.2 7 16c3.1-.8 5.5-3.2 5.5-6.8V4L7 1z" fill={colors.accentSoft} stroke={colors.accent} strokeWidth={1.2} strokeLinejoin="round" />
                <Path d="M4.5 8.5l2 2 3-3.5" stroke={colors.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.signedText}>Cryptographically signed</Text>
              <View style={styles.algoChip}><Text style={styles.algoText}>Ed25519</Text></View>
            </View>

            {Platform.OS === 'web' && (
              <Text style={styles.webKeyNote}>Demo key stored in this browser · use the app on a phone for a device-secured key.</Text>
            )}

            <Pressable onPress={regenerate} style={styles.regenBtn}>
              <Icon name="return" size={13} color={colors.ink3} />
              <Text style={styles.regenText}>Regenerate passport</Text>
            </Pressable>
          </View>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subtitle: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink3, textAlign: 'center', marginTop: 2, marginBottom: 4 },

  centerCard: { padding: 32, alignItems: 'center', gap: 14, marginTop: 20 },

  gateTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink, marginTop: 12, textAlign: 'center' },
  gateBody: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  gateBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.accent, marginTop: 18, alignSelf: 'stretch' },
  gateBtnText: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.onAccent },

  /* passport card */
  passportCard: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: '#0a1810',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  header: { backgroundColor: colors.passportDark, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { fontFamily: uiFont(800), fontSize: 11.5, color: 'rgba(255,255,255,0.92)', letterSpacing: 0.6, textTransform: 'uppercase' },
  brandSub: { fontFamily: uiFont(500), fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.7, textTransform: 'uppercase' },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.deltaUp },
  activeText: { fontFamily: uiFont(600), fontSize: 10, color: 'rgba(255,255,255,0.62)' },
  holderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 9, color: 'rgba(255,255,255,0.36)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  holderName: { fontFamily: uiFont(800), fontSize: 22, color: '#fff' },
  holderSub: { fontFamily: uiFont(500), fontSize: 10.5, color: 'rgba(255,255,255,0.38)', marginTop: 4 },
  scoreNum: { fontFamily: numFont(700), fontSize: 28, color: '#FAC438', lineHeight: 30 },
  scorePill: { marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  scorePillText: { fontFamily: uiFont(700), fontSize: 11, color: 'rgba(255,255,255,0.82)' },

  qrBody: { padding: 20, alignItems: 'center', backgroundColor: '#fff' },
  scanHint: { fontFamily: uiFont(500), fontSize: 10.5, color: colors.ink3, marginBottom: 14, letterSpacing: 0.4 },
  qrWrap: { borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  qrFallback: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12, borderRadius: 10, backgroundColor: colors.surface2 },
  qrFallbackText: { fontFamily: uiFont(600), fontSize: 12, color: colors.ink },
  qrFallbackSub: { fontFamily: uiFont(500), fontSize: 10.5, color: colors.ink3, textAlign: 'center' },
  codeRow: { flexDirection: 'row', gap: 8, marginTop: 18, alignSelf: 'stretch' },
  codeField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.line },
  codeText: { flex: 1, fontFamily: numFont(500), fontSize: 12, color: colors.ink2 },
  copyBtn: { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: colors.accent },
  copyBtnDone: { backgroundColor: colors.accentSoft },
  copyText: { fontFamily: uiFont(700), fontSize: 12.5, color: '#fff' },
  copyTextDone: { color: colors.accentInk },

  perfRow: { height: 26, justifyContent: 'center' },
  perfNotch: { position: 'absolute', width: 26, height: 26, backgroundColor: colors.bg },
  perfLine: { marginHorizontal: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(20,40,30,0.13)' },

  footer: { padding: 20, backgroundColor: colors.surface, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  dateLabel: { fontFamily: uiFont(600), fontSize: 9, color: colors.ink3, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  dateValue: { fontFamily: numFont(600), fontSize: 12.5, color: colors.ink },
  dateDivider: { width: 1, backgroundColor: colors.line },
  signedBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.accentTint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.accentSoft, marginBottom: 12 },
  signedText: { flex: 1, fontFamily: uiFont(600), fontSize: 11.5, color: colors.accentInk },
  algoChip: { backgroundColor: colors.surface2, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.line },
  algoText: { fontFamily: numFont(700), fontSize: 10, color: colors.ink3, letterSpacing: 0.3 },
  webKeyNote: { fontFamily: uiFont(500), fontSize: 10, color: colors.ink3, textAlign: 'center', marginBottom: 10, lineHeight: 14 },
  regenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  regenText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink3 },
});
