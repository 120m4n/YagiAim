// PM-18 / PM-20 — hojas, pantallas completas, diálogos de confirmación, alertas y menús. Modales nativos (el botón Atrás del
// sistema llama a `onRequestClose`) con animaciones propias; curvas y duraciones pendientes de medir en iOS (R-6).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SchemeContext, useColors } from '../colors';
import { Icon } from '../icons/Icon';
import { Txt } from './Txt';

const SHEET_EASING = Easing.bezier(0.32, 0.72, 0, 1); // curva estándar de UIKit; R-6 la confirmará
const IN_MS = 380;
const OUT_MS = 260;

/** Mantiene el modal montado mientras dura la animación de salida. */
function useMounted(visible: boolean, outMs: number): boolean {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), outMs);
    return () => clearTimeout(t);
  }, [visible, outMs]);
  return visible || mounted;
}

export interface SheetProps {
  visible: boolean;
  /** Cierre por gesto, toque fuera o botón Atrás (siempre sin guardar). */
  onClose: () => void;
  /** Cabecera (normalmente una `NavBar`); es también la zona de arrastre. */
  header?: ReactNode;
  children: ReactNode;
  /** Fuerza el esquema de color del contenido. */
  scheme?: 'light' | 'dark';
  /** Botón Atrás del sistema (PM-18); por defecto igual que `onClose`. */
  onBack?: () => void;
}

/** `.sheet`: hoja de página con esquinas superiores redondeadas; el contenido de abajo se oscurece. */
export function Sheet({ visible, onClose, header, children, scheme, onBack }: SheetProps) {
  const mounted = useMounted(visible, OUT_MS);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const p = useColors();
  const y = useSharedValue(height);
  useEffect(() => {
    y.value = withTiming(visible ? 0 : height, { duration: visible ? IN_MS : OUT_MS, easing: SHEET_EASING });
  }, [visible, height, y]);
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - Math.min(y.value / height, 1)) }));
  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(onClose)();
      else y.value = withTiming(0, { duration: 200 });
    });
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onBack ?? onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SchemeContext.Provider value={scheme ?? p.scheme}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, dim]} />
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessibilityLabel="Cerrar" />
          <Animated.View style={[{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 38, borderTopRightRadius: 38, backgroundColor: p.sheet, overflow: 'hidden' }, panel]}>
            <GestureDetector gesture={drag}>
              <View>{header}</View>
            </GestureDetector>
            <View style={{ flex: 1 }}>{children}</View>
          </Animated.View>
        </SchemeContext.Provider>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** `.fullScreenCover`: sin barra de hoja; entra desde abajo. `onRequestClose` ausente = el Atrás se ignora (guía). */
export function FullScreen({ visible, onRequestClose, children, scheme }: { visible: boolean; onRequestClose?: () => void; children: ReactNode; scheme?: 'light' | 'dark' }) {
  const mounted = useMounted(visible, OUT_MS);
  const { height } = useWindowDimensions();
  const p = useColors();
  const y = useSharedValue(height);
  useEffect(() => {
    y.value = withTiming(visible ? 0 : height, { duration: visible ? IN_MS : OUT_MS, easing: SHEET_EASING });
  }, [visible, height, y]);
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onRequestClose ?? (() => undefined)}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SchemeContext.Provider value={scheme ?? p.scheme}>
          <Animated.View style={[{ flex: 1, backgroundColor: scheme === 'dark' ? p.navy : p.background }, panel]}>{children}</Animated.View>
        </SchemeContext.Provider>
      </GestureHandlerRootView>
    </Modal>
  );
}

export interface DialogAction { label: string; destructive?: boolean; onPress: () => void }

/** `.confirmationDialog`: hoja de acciones inferior con título visible y "Cancelar" implícito. */
export function ConfirmationDialog({ visible, title, message, actions, onCancel }: { visible: boolean; title: string; message?: string; actions: DialogAction[]; onCancel: () => void }) {
  const mounted = useMounted(visible, 220);
  const p = useColors();
  const insets = useSafeAreaInsets();
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withTiming(visible ? 1 : 0, { duration: visible ? 280 : 200, easing: SHEET_EASING });
  }, [visible, k]);
  const card = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ translateY: (1 - k.value) * 40 }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 0.4 * k.value }));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <SchemeContext.Provider value={p.scheme}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, dim]} />
        <Pressable style={{ flex: 1 }} onPress={onCancel} accessibilityLabel="Cancelar" />
        <Animated.View style={[{ position: 'absolute', left: 8, right: 8, bottom: insets.bottom + 8, gap: 8 }, card]}>
          <View style={{ backgroundColor: p.sheet, borderRadius: 26, overflow: 'hidden' }}>
            <View style={{ padding: 16, gap: 4, alignItems: 'center' }}>
              <Txt variant="footnote" semibold color="secondaryLabel" style={{ textAlign: 'center' }}>{title}</Txt>
              {message ? <Txt variant="footnote" color="secondaryLabel" style={{ textAlign: 'center' }}>{message}</Txt> : null}
            </View>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" style={({ pressed }) => ({ height: 56, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: p.separator, opacity: pressed ? 0.6 : 1 })}>
                <Txt variant="title3" color={a.destructive ? 'red' : 'accent'}>{a.label}</Txt>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onCancel} accessibilityRole="button" style={({ pressed }) => ({ height: 56, borderRadius: 26, backgroundColor: p.sheet, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Txt variant="title3" semibold color="accent">Cancelar</Txt>
          </Pressable>
        </Animated.View>
      </SchemeContext.Provider>
    </Modal>
  );
}

/** `.alert(title, message)` con un botón "OK". */
export function Alert({ visible, title, message, onClose }: { visible: boolean; title: string; message: string; onClose: () => void }) {
  const mounted = useMounted(visible, 180);
  const p = useColors();
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [visible, k]);
  const card = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ scale: 1.06 - 0.06 * k.value }] }));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Animated.View style={[{ width: 270, borderRadius: 26, backgroundColor: p.sheet, overflow: 'hidden' }, card]}>
          <View style={{ padding: 20, gap: 4, alignItems: 'center' }}>
            <Txt variant="headline" style={{ textAlign: 'center' }}>{title}</Txt>
            <Txt variant="footnote" style={{ textAlign: 'center' }}>{message}</Txt>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: p.separator, opacity: pressed ? 0.6 : 1 })}>
            <Txt variant="headline" color="accent">OK</Txt>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface MenuItem { label: string; icon?: string; checked?: boolean; onPress: () => void; separatorBefore?: boolean }

/** `Menu` + `Picker`: menú anclado al botón "…", con check en la opción elegida (PM-16). */
export function Menu({ items, children }: { items: MenuItem[]; children: (open: () => void, ref: React.RefObject<View | null>) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const ref = useRef<View | null>(null);
  const p = useColors();
  const { width } = useWindowDimensions();
  const show = () =>
    ref.current?.measureInWindow((x, y, w, h) => {
      setPos({ x, y, w, h });
      setOpen(true);
    });
  const close = () => setOpen(false);
  return (
    <>
      {children(show, ref)}
      <Modal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={close}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Cerrar menú">
          <View style={{ position: 'absolute', top: pos.y + pos.h + 6, left: Math.max(8, Math.min(pos.x, width - 260 - 8)), width: 260, borderRadius: 22, backgroundColor: p.sheet, paddingVertical: 6, overflow: 'hidden', elevation: 8 }}>
            {items.map((it) => (
              <View key={it.label}>
                {it.separatorBefore ? <View style={{ height: 6, backgroundColor: p.cell, marginVertical: 4 }} /> : null}
                <Pressable
                  onPress={() => {
                    close();
                    it.onPress();
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ checked: it.checked }}
                  style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}
                >
                  <View style={{ width: 20 }}>{it.checked ? <Icon name="checkmark" size={18} color={p.label} weight={2.4} /> : null}</View>
                  <Txt style={{ flex: 1 }}>{it.label}</Txt>
                  {it.icon ? <Icon name={it.icon} size={18} color={p.label} /> : null}
                </Pressable>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
