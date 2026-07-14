import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/hanken-grotesk';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, type NavTab } from './src/components/BottomNav';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Pip } from './src/components/Pip';
import { TourCard, TourResumeChip } from './src/components/TourCard';
import { BORROWER_TOUR_STEPS, clampTourStep } from './src/lib/tourSteps';
import { AddFlow } from './src/screens/AddFlow';
import { AllTransactionsScreen } from './src/screens/AllTransactionsScreen';
import { BreakdownScreen } from './src/screens/BreakdownScreen';
import { CategoriesScreen } from './src/screens/CategoriesScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CreditScreen } from './src/screens/CreditScreen';
import { LoansScreen } from './src/screens/LoansScreen';
import { LenderScreen } from './src/screens/LenderScreen';
import { AttackGalleryScreen } from './src/screens/AttackGalleryScreen';
import { PassportScreen } from './src/screens/PassportScreen';
import { PassportCoachScreen } from './src/screens/PassportCoachScreen';
import { KycScreen } from './src/screens/KycScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { NetWorthScreen } from './src/screens/NetWorthScreen';
import { RecapScreen } from './src/screens/RecapScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AccentProvider } from './src/state/accent';
import { AppDataProvider, useAppData } from './src/state/store';
import { useNow } from './src/state/useNow';
import { colors, platformShadow, uiFont } from './src/theme';

type Screen = 'home' | 'add' | 'settings' | 'categories' | 'transactions' | 'breakdown' | 'budget' | 'recap' | 'networth' | 'credit' | 'loans' | 'passport' | 'coach' | 'lender' | 'attacks' | 'kyc' | 'calendar';

/**
 * Web-only: a global :focus-visible outline so keyboard users get a visible focus indicator
 * on every Pressable/TextInput  RN-web renders these as real DOM elements but doesn't ship
 * any focus styling itself, and the browser's own default is easy to lose track of amid the
 * app's custom-styled surfaces. Injected once via a <style> tag rather than per-component,
 * since RN has no global stylesheet. No-op on native (there's no focus ring to add).
 */
function useWebFocusRing() {
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `:focus-visible { outline: 2px solid ${colors.accent} !important; outline-offset: 2px !important; }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

export default function App() {
  useWebFocusRing();
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  return (
    <PhoneFrame>
      <SafeAreaProvider>
        <AppDataProvider>
          <AccentProvider>
            <ErrorBoundary>
              <Root fontsLoaded={fontsLoaded} />
            </ErrorBoundary>
          </AccentProvider>
        </AppDataProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </PhoneFrame>
  );
}

/**
 * On web, render the app inside a centred iPhone-17-Pro-Max-sized window (440 × 956 pt) so the
 * exported web build looks like a phone instead of stretching to the browser. No-op on native.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={webStyles.backdrop}>
      <View style={webStyles.phone}>
        <View style={[webStyles.statusBar, { pointerEvents: 'none' }]}>
          <View style={webStyles.statusRow}>
            <StatusClock />
            <View style={webStyles.rightIcons}>
              {/* cellular signal */}
              <View style={webStyles.signal}>
                {[4, 6, 8, 11].map((h) => (
                  <View key={h} style={[webStyles.bar, { height: h }]} />
                ))}
              </View>
              {/* wifi */}
              <Svg width={17} height={12} viewBox="0 0 16 12">
                <Path
                  d="M8 9.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM8 5.2c1.7 0 3.3.66 4.5 1.85l-1.35 1.5A4.6 4.6 0 0 0 8 8.2c-1.2 0-2.3.45-3.15 1.35L3.5 7.05A6.4 6.4 0 0 1 8 5.2zM8 1.2c2.8 0 5.4 1.1 7.3 3l-1.35 1.5A8.4 8.4 0 0 0 8 3.2 8.4 8.4 0 0 0 2.05 5.7L.7 4.2A10.3 10.3 0 0 1 8 1.2z"
                  fill="#000"
                />
              </Svg>
              {/* battery */}
              <Svg width={27} height={13} viewBox="0 0 27 13">
                <Rect x="0.6" y="0.6" width="22" height="11.8" rx="3" fill="none" stroke="#000" strokeOpacity={0.35} />
                <Rect x="2" y="2" width="17" height="9" rx="1.5" fill="#000" />
                <Rect x="24" y="4" width="2.2" height="5" rx="1" fill="#000" fillOpacity={0.4} />
              </Svg>
            </View>
          </View>
          <View style={webStyles.island} />
        </View>
        <View style={styles.fill}>{children}</View>
      </View>
    </View>
  );
}

/** Live status-bar clock for the web phone-frame (24h H:MM, ticks each minute). */
function StatusClock() {
  const now = useNow(30_000);
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  return <Text style={webStyles.clock}>{`${hh}:${mm}`}</Text>;
}

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready, onboardingComplete, tourActive, tourStepIndex, setTourStep, pauseTour, exitTour, startTour } = useAppData();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('home');
  const [txnFilter, setTxnFilter] = useState<string | null>(null);
  const [addInitial, setAddInitial] = useState<'attach' | 'import'>('attach');
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>(undefined);
  // Where to land after eKYC (Brief-level UI/UX P2.8): verifying from the Loans gate must
  // return to Loans, not always to the Passport ceremony  whichever screen opened KYC wins.
  const [kycReturnTo, setKycReturnTo] = useState<Screen>('passport');
  const openKyc = (from: Screen) => {
    setKycReturnTo(from);
    setScreen('kyc');
  };

  // Judge guided tour (2026-07-12 spec). `tourDrivenRef` distinguishes a screen change the
  // tour itself made (advancing to the next step) from one the judge made by tapping the
  // real app  the latter pauses the tour rather than snapping the screen back, so the tour
  // never fights the user for control.
  const [tourPaused, setTourPaused] = useState(false);
  const tourDrivenRef = useRef(false);
  const currentTourStep = tourActive ? BORROWER_TOUR_STEPS[clampTourStep(tourStepIndex, BORROWER_TOUR_STEPS.length)] : null;

  useEffect(() => {
    if (!tourActive || !currentTourStep) return;
    tourDrivenRef.current = true;
    setScreen(currentTourStep.screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStepIndex]);

  useEffect(() => {
    if (!tourActive) return;
    if (tourDrivenRef.current) {
      tourDrivenRef.current = false;
      return;
    }
    setTourPaused(true);
    void pauseTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const tourNext = () => {
    if (!currentTourStep) return;
    const next = tourStepIndex + 1;
    if (next >= BORROWER_TOUR_STEPS.length) {
      void exitTour();
      setTourPaused(false);
      return;
    }
    void setTourStep(next);
  };
  const tourBack = () => void setTourStep(Math.max(0, tourStepIndex - 1));
  const tourExit = () => {
    void exitTour();
    setTourPaused(false);
  };
  const tourResume = () => {
    setTourPaused(false);
    void startTour();
  };
  /** Deep-link off the current step's optional action (UI/UX P3.18: surface the Attack
   *  Gallery from the tour, not only Settings). Ends the tour and jumps straight there. */
  const tourAction = () => {
    if (!currentTourStep?.actionScreen) return;
    void exitTour();
    setTourPaused(false);
    setScreen(currentTourStep.actionScreen as Screen);
  };

  // Persistent bottom nav appears only on the four primary destinations.
  const navTab: NavTab | null =
    screen === 'home' ? 'home'
    : screen === 'transactions' ? 'activity'
    : screen === 'loans' ? 'loan'
    : screen === 'settings' ? 'profile'
    : null;
  const goTab = (t: NavTab) => {
    if (t === 'home') setScreen('home');
    else if (t === 'activity') {
      setTxnFilter(null);
      setScreen('transactions');
    } else if (t === 'loan') setScreen('loans');
    else setScreen('settings');
  };

  if (!fontsLoaded || !ready) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Pip size={96} expr="idle" float />
      </View>
    );
  }

  // One-time setup before the main app.
  if (!onboardingComplete) {
    return (
      <View style={styles.fill}>
        <OnboardingScreen />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
      {screen === 'home' && (
        <DashboardScreen
          onScan={() => {
            setAddInitial('attach');
            setScreen('add');
          }}
          onOpenSettings={() => setScreen('settings')}
          onOpenCategories={() => setScreen('categories')}
          onOpenAll={() => {
            setTxnFilter(null);
            setScreen('transactions');
          }}
          onOpenBreakdown={() => setScreen('breakdown')}
          onOpenBudget={() => setScreen('budget')}
          onOpenRecap={() => setScreen('recap')}
          onOpenNetWorth={() => setScreen('networth')}
          onOpenCredit={() => setScreen('credit')}
          onOpenPassport={() => setScreen('passport')}
          onOpenCoach={() => setScreen('coach')}
        />
      )}
      {screen === 'add' && (
        <AddFlow
          initialPhase={addInitial}
          onClose={() => setScreen('home')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          onBack={() => setScreen('home')}
          onMigrate={() => {
            setAddInitial('import');
            setScreen('add');
          }}
          onOpenLender={() => setScreen('lender')}
          onOpenAttacks={() => setScreen('attacks')}
        />
      )}
      {screen === 'attacks' && <AttackGalleryScreen onBack={() => setScreen('settings')} />}
      {screen === 'categories' && <CategoriesScreen onBack={() => setScreen('home')} />}
      {screen === 'transactions' && (
        <AllTransactionsScreen
          filterCategoryId={txnFilter}
          onClearFilter={() => setTxnFilter(null)}
          onBack={() => {
            setTxnFilter(null);
            setScreen('home');
          }}
        />
      )}
      {screen === 'budget' && <BudgetScreen onBack={() => setScreen('home')} onOpenRecap={() => setScreen('recap')} />}
      {screen === 'recap' && (
        <RecapScreen
          onBack={() => setScreen('home')}
          onOpenCalendar={(month) => {
            setCalendarMonth(month);
            setScreen('calendar');
          }}
        />
      )}
      {screen === 'calendar' && (
        <CalendarScreen
          onBack={() => setScreen('recap')}
          initialMonth={calendarMonth}
        />
      )}
      {screen === 'networth' && <NetWorthScreen onBack={() => setScreen('home')} onOpenSettings={() => setScreen('settings')} />}
      {screen === 'credit' && (
        <CreditScreen
          onBack={() => setScreen('home')}
          onOpenLoans={() => setScreen('loans')}
          onOpenPassport={() => setScreen('passport')}
          onOpenCoach={() => setScreen('coach')}
        />
      )}
      {screen === 'loans' && (
        <LoansScreen
          onBack={() => setScreen('credit')}
          onOpenKyc={() => openKyc('loans')}
          onOpenPassport={() => setScreen('passport')}
        />
      )}
      {screen === 'passport' && (
        <PassportScreen onBack={() => setScreen('credit')} onOpenKyc={() => openKyc('passport')} />
      )}
      {screen === 'coach' && (
        <PassportCoachScreen
          onBack={() => setScreen('credit')}
          onStart={(lever) =>
            setScreen(lever === 'coverage' ? 'add' : lever === 'track' ? 'loans' : 'budget')
          }
        />
      )}
      {screen === 'kyc' && <KycScreen onBack={() => setScreen(kycReturnTo)} />}
      {screen === 'lender' && <LenderScreen onBack={() => setScreen('home')} />}
      {screen === 'breakdown' && (
        <BreakdownScreen
          onBack={() => setScreen('home')}
          onOpenCategory={(id) => {
            setTxnFilter(id);
            setScreen('transactions');
          }}
        />
      )}
      </View>
      {navTab && <BottomNav active={navTab} onNavigate={goTab} />}
      {tourActive && currentTourStep && (
        <TourCard
          step={currentTourStep}
          index={tourStepIndex}
          total={BORROWER_TOUR_STEPS.length}
          bottomInset={navTab ? 0 : insets.bottom}
          onNext={tourNext}
          onBack={tourBack}
          onExit={tourExit}
          onAction={tourAction}
        />
      )}
      {tourPaused && !tourActive && <TourResumeChip bottomInset={navTab ? 0 : insets.bottom} onResume={tourResume} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
});

// Web-only: a centred iPhone-17-Pro-Max-sized window so the web build looks like a phone.
const webStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    minHeight: '100vh' as unknown as number,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d2d8d2',
    padding: 16,
  },
  phone: {
    width: 440,
    height: 956,
    maxHeight: '100vh' as unknown as number,
    maxWidth: '100%' as unknown as number,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    ...platformShadow('#000000', 0.18, 40, { width: 0, height: 18 }, 0),
  },
  statusBar: {
    height: 50,
    justifyContent: 'center',
    backgroundColor: colors.bg,
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
  },
  clock: {
    fontFamily: uiFont(700),
    fontSize: 16,
    color: '#000',
    letterSpacing: 0.3,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: '#000',
  },
  island: {
    position: 'absolute',
    top: 11,
    left: '50%',
    marginLeft: -63, // half of width (126) to centre
    width: 126,
    height: 35,
    borderRadius: 999,
    backgroundColor: '#000',
  },
});
