// Judge guided tour  dim + cutout spotlight overlay (Interactive Judge Tour spec,
// 2026-07-16). Four absolutely-positioned dim panes tile the app around the active
// anchor's measured rect; the cutout region has NO view at all, so the spotlit control
// stays natively tappable  that is what makes the "your turn" steps physically doable.
// Tapping the dim pauses the tour (same contract as stray navigation; the driver owns the
// semantics via onDimPress). The halo ring pulses gently unless the platform reports
// reduced motion. On web the app renders inside the centred PhoneFrame, so anchor rects
// (window coordinates) are converted into this overlay's own coordinate space by
// subtracting its measured offset  on native that offset is simply zero.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { spotlightFrames, type SpotlightRect } from '../lib/spotlight';
import { getTourAnchor, onTourAnchor, type AnchorReport } from '../lib/tourAnchorRect';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { platformShadow, radius } from '../theme';

const CUTOUT_PADDING = 8;
const DIM_OPACITY = 0.45;

function rectStyle(r: SpotlightRect) {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}

/** Web only. Does this gesture belong to a scroller that the spotlight is actually pointing at?
 *
 *  The scroll lock below is a blunt "the page does not move", which is what the judge asked for
 *  — but a cutout can frame something that scrolls in its own right (a horizontal picker, a long
 *  list), and killing that would break the very control the step is asking them to use. So a
 *  scrollable ancestor of the event's target is honoured when it overlaps the cutout, and
 *  everything else is held still. `rect` is in window coordinates, same space as
 *  `getBoundingClientRect`. */
function scrollsInsideCutout(target: EventTarget | null, rect: SpotlightRect): boolean {
  if (typeof document === 'undefined') return false;
  let el = target as HTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (scrollsY || scrollsX) {
      const r = el.getBoundingClientRect();
      return r.left < rect.x + rect.width && r.right > rect.x && r.top < rect.y + rect.height && r.bottom > rect.y;
    }
    el = el.parentElement;
  }
  return false;
}

export function TourSpotlight({ onDimPress }: { onDimPress: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [report, setReport] = useState<AnchorReport | null>(() => getTourAnchor());
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [frameOffset, setFrameOffset] = useState({ x: 0, y: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const rootRef = useRef<View>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => onTourAnchor(setReport), []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const useNative = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 900, useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: useNative }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);

  // Measure the overlay's own window offset/size whenever a new anchor reports (and once
  // on mount). Effect-driven rather than onLayout-driven: on RN-web the absoluteFill
  // overlay's onLayout proved unreliable at mount, while a post-commit measure always
  // resolves. The offset subtraction is what makes window-coordinate anchor rects line up
  // inside the web PhoneFrame (offset is zero on native).
  useEffect(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setFrameOffset({ x, y });
        setFrameSize({ width, height });
      }
    });
  }, [report]);

  const local = report && frameSize
    ? { x: report.rect.x - frameOffset.x, y: report.rect.y - frameOffset.y, width: report.rect.width, height: report.rect.height }
    : null;
  const frames = frameSize ? spotlightFrames(frameSize, local, CUTOUT_PADDING) : null;
  const locked = frames !== null;

  // While a section is spotlit, the app underneath does not scroll. Found live: after tapping
  // Next (or finishing a task), a flick of the wheel slid the highlighted control clean out of
  // the cutout, leaving a lit hole over empty background and the instruction pointing at
  // nothing. The cutout is anchored to a measured rect, so freezing the page is what keeps the
  // two together — the tour's own `scrollIntoView` still positions the target, because that is
  // programmatic and unaffected by these handlers.
  //
  // Web-only by feature detection, and only while there IS a cutout: a step with no anchor
  // (eKYC, the mint, the scan mission) spotlights nothing and must stay freely scrollable, since
  // its controls sit at the foot of a long form.
  const cutout = frames?.cutout ?? null;
  const cutoutWindow = cutout ? { x: cutout.x + frameOffset.x, y: cutout.y + frameOffset.y, width: cutout.width, height: cutout.height } : null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !cutoutWindow || typeof window === 'undefined') return;
    const block = (e: Event) => {
      if (scrollsInsideCutout(e.target, cutoutWindow) || !e.cancelable) return;
      e.preventDefault();
    };
    // Keyboard scrolling is the same bypass by another route  but never steal a key from a
    // field the judge is actually typing in (the KYC form).
    const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);
    const blockKey = (e: KeyboardEvent) => {
      const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (SCROLL_KEYS.has(e.key) && e.cancelable) e.preventDefault();
    };
    const opts = { passive: false, capture: true } as AddEventListenerOptions;
    window.addEventListener('wheel', block, opts);
    window.addEventListener('touchmove', block, opts);
    window.addEventListener('keydown', blockKey, { capture: true });
    return () => {
      window.removeEventListener('wheel', block, opts);
      window.removeEventListener('touchmove', block, opts);
      window.removeEventListener('keydown', blockKey, { capture: true } as AddEventListenerOptions);
    };
    // Rect identity changes on every anchor report; the values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoutWindow?.x, cutoutWindow?.y, cutoutWindow?.width, cutoutWindow?.height]);

  return (
    <View
      ref={rootRef}
      style={[StyleSheet.absoluteFill, { zIndex: 30 }]}
      pointerEvents={frames ? 'box-none' : 'none'}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {frames && (
        <>
          {[frames.top, frames.bottom, frames.left, frames.right].map((r, i) => (
            <Pressable key={i} accessible={false} focusable={false} onPress={onDimPress} style={[styles.dim, rectStyle(r), { backgroundColor: colorTheme.ink }]} />
          ))}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              rectStyle(frames.cutout),
              { opacity: pulse, borderColor: theme.accent, ...platformShadow(theme.accent, 0.5, 10, { width: 0, height: 0 }, 0) },
            ]}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', opacity: DIM_OPACITY },
  halo: {
    position: 'absolute',
    borderRadius: radius.lg,
    borderWidth: 2.5,
  },
});
