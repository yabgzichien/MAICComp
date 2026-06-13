import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';

/**
 * "Pip" the coin-sprout mascot, ported pixel-for-pixel from the approved
 * redesign (a golden coin with a friendly face and two leaves). Used on the
 * borrower screens (dashboard, credit profile, Ask-Pip strips). Pass `float`
 * for a gentle idle bob (matches the green <Pip> mascot's idiom).
 */
export function CoinMascot({ size = 52, float = false }: { size?: number; float?: boolean }) {
  const ty = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!float) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ty, { toValue: -4, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float, ty]);

  return (
    <Animated.View style={{ transform: [{ translateY: ty }] }}>
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      {/* Left leaf */}
      <Path d="M20 16 C20 11,13 8,11 12.5 C9 17,15 19,20 16Z" fill="#1c7a4e" />
      {/* Right leaf */}
      <Path d="M36 16 C36 11,43 8,45 12.5 C47 17,41 19,36 16Z" fill="#2aab68" />
      {/* Stem */}
      <Line x1={28} y1={13.5} x2={28} y2={20} stroke="#185e3e" strokeWidth={2.5} strokeLinecap="round" />
      {/* Coin drop shadow */}
      <Ellipse cx={28.5} cy={46} rx={12} ry={2.3} fill="rgba(8,28,14,0.15)" />
      {/* Coin body */}
      <Circle cx={28} cy={35.5} r={15.5} fill="#F5B42A" />
      {/* Inner bevel ring */}
      <Circle cx={28} cy={35.5} r={12.5} fill="#FAC438" />
      <Circle cx={28} cy={35.5} r={12.5} fill="none" stroke="#D99E18" strokeWidth={1.2} />
      {/* Eyes */}
      <Ellipse cx={23.5} cy={34} rx={1.9} ry={2.2} fill="#7A4800" />
      <Ellipse cx={32.5} cy={34} rx={1.9} ry={2.2} fill="#7A4800" />
      {/* Eye shine */}
      <Circle cx={24.3} cy={33} r={0.75} fill="white" opacity={0.82} />
      <Circle cx={33.3} cy={33} r={0.75} fill="white" opacity={0.82} />
      {/* Smile */}
      <Path d="M23.5 38.5 Q28 42.2 32.5 38.5" stroke="#7A4800" strokeWidth={1.9} strokeLinecap="round" fill="none" />
      {/* Blush */}
      <Ellipse cx={19.5} cy={37.5} rx={2.5} ry={1.6} fill="#F07828" opacity={0.3} />
      <Ellipse cx={36.5} cy={37.5} rx={2.5} ry={1.6} fill="#F07828" opacity={0.3} />
      {/* Highlight */}
      <Ellipse cx={21} cy={29} rx={4} ry={2.3} fill="white" opacity={0.23} rotation={-26} originX={21} originY={29} />
    </Svg>
    </Animated.View>
  );
}

/**
 * Faceless official emblem variant (white-on-dark) for the passport header.
 */
export function PipEmblem({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      <Path d="M15.5 12.5C15.5 8,9.5 5.5,7.8 9C6 12.5,10.5 14,15.5 12.5Z" fill="rgba(255,255,255,0.42)" />
      <Path d="M22.5 12.5C22.5 8,28.5 5.5,30.2 9C32 12.5,27.5 14,22.5 12.5Z" fill="rgba(255,255,255,0.52)" />
      <Line x1={19} y1={9.5} x2={19} y2={15} stroke="rgba(255,255,255,0.48)" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={19} cy={25} r={12} fill="#F5B42A" />
      <Circle cx={19} cy={25} r={9.5} fill="#FAC438" />
      <Circle cx={19} cy={25} r={9.5} fill="none" stroke="#D99C10" strokeWidth={1} />
      <Path d="M14.5 25.5l3.5 3.5 6-7" stroke="#8B5A00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Ellipse cx={14} cy={20} rx={3.5} ry={2} fill="white" opacity={0.18} rotation={-30} originX={14} originY={20} />
    </Svg>
  );
}
