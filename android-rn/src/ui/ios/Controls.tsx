import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useColors } from '../colors';

/** `Toggle` de iOS 26: pista ancha y perilla en cápsula; encendido = accent. */
export function Switch({ value, onValueChange, accessibilityLabel }: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel?: string }) {
  const p = useColors();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 2 + x.value * 24 }] }));
  return (
    <Pressable onPress={() => onValueChange(!value)} accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: value }}>
      <View style={{ width: 64, height: 28, borderRadius: 14, backgroundColor: value ? p.accent : p.switchOff, justifyContent: 'center' }}>
        <Animated.View style={[{ width: 36, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' }, knob]} />
      </View>
    </Pressable>
  );
}

/** `Slider(value:in:step:)`: perilla en cápsula, relleno accent. */
export function Slider({ value, min, max, step, onValueChange }: { value: number; min: number; max: number; step: number; onValueChange: (v: number) => void }) {
  const p = useColors();
  const [w, setW] = useState(0);
  const KNOB = 38;
  const span = Math.max(w - KNOB, 1);
  const pos = ((value - min) / (max - min)) * span;
  const commit = (px: number) => {
    const raw = min + (Math.min(Math.max(px, 0), span) / span) * (max - min);
    onValueChange(Math.min(max, Math.max(min, Math.round(raw / step) * step)));
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => runOnJS(commit)(e.x - KNOB / 2))
    .onUpdate((e) => runOnJS(commit)(e.x - KNOB / 2));
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 32, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityValue={{ min, max, now: value }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: p.sliderTrack }} />
        <View style={{ position: 'absolute', left: 0, width: pos + KNOB / 2, height: 6, borderRadius: 3, backgroundColor: p.accent }} />
        <View style={{ position: 'absolute', left: pos, width: KNOB, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' }} />
      </View>
    </GestureDetector>
  );
}

/** `ProgressView()`: indicador de actividad de iOS (12 radios que giran). */
export function ActivityIndicator({ size = 20, color }: { size?: number; color?: string }) {
  const p = useColors();
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1);
  }, [r]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const c = color ?? p.secondaryLabel;
  return (
    <Animated.View style={[{ width: size, height: size }, spin]} accessibilityRole="progressbar">
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: size / 2 - size * 0.045, top: 0, width: size * 0.09, height: size * 0.27, borderRadius: size * 0.045, backgroundColor: c, opacity: 0.2 + (0.8 * i) / 11, transformOrigin: `50% ${size / 2}px`, transform: [{ rotate: `${i * 30}deg` }] }} />
      ))}
    </Animated.View>
  );
}

/** `TabView(.page)`: puntos de paginación. */
export function PageControl({ count, index }: { count: number; index: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }} accessibilityLabel={`Página ${index + 1} de ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FFFFFF', opacity: i === index ? 1 : 0.3 }} />
      ))}
    </View>
  );
}
