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
import { colors, platformShadow, radius } from '../theme';

const CUTOUT_PADDING = 8;
const DIM_OPACITY = 0.45;

function rectStyle(r: SpotlightRect) {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}

export function TourSpotlight({ onDimPress }: { onDimPress: () => void }) {
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
            <Pressable key={i} accessible={false} focusable={false} onPress={onDimPress} style={[styles.dim, rectStyle(r)]} />
          ))}
          <Animated.View pointerEvents="none" style={[styles.halo, rectStyle(frames.cutout), { opacity: pulse }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: colors.ink, opacity: DIM_OPACITY },
  halo: {
    position: 'absolute',
    borderRadius: radius.lg,
    borderWidth: 2.5,
    borderColor: colors.accent,
    ...platformShadow(colors.accent, 0.5, 10, { width: 0, height: 0 }, 0),
  },
});
