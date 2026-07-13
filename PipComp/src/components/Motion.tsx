import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

/**
 * Mount entrance: gentle fade + small upward rise. Kept short and low-offset so
 * it reads as "settling in", never as a slide-show. Native-driven (opacity +
 * transform only). Pass a changing `key` from the caller to replay it.
 */
export function FadeIn({
  children,
  style,
  delay = 0,
  duration = 340,
  offset = 10,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  delay?: number;
  duration?: number;
  offset?: number;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [v, delay, duration]);

  return (
    <Animated.View
      style={[
        style as ViewStyle,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Drive a number from 0 → target with an ease-out curve over `duration`ms on
 * mount. Returns the current value; lands exactly on `target`. Used for the
 * gauge sweep + score count-up. rAF-based so it works on web and native.
 *
 * Starts already at `target` (never 0) so the headline number is correct even
 * before the effect runs, and carries a setTimeout backstop that forces the
 * final value if rAF stalls (e.g. a backgrounded/hidden tab, where browsers
 * throttle requestAnimationFrame) instead of leaving the count-up stuck.
 */
export function useEased(target: number, duration = 950): number {
  const [val, setVal] = useState(target);
  useEffect(() => {
    let raf = 0;
    let settled = false;
    const start = Date.now();
    const settle = () => {
      settled = true;
      setVal(target);
    };
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else settle();
    };
    setVal(0);
    raf = requestAnimationFrame(tick);
    const fallback = setTimeout(() => {
      if (!settled) settle();
    }, duration + 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [target, duration]);
  return val;
}
