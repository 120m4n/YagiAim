import { Children, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useColors } from '../colors';
import { Icon } from '../icons/Icon';
import { fonts, textStyle } from '../typography';
import { Txt } from './Txt';

const CELL_RADIUS = 26;
const H_INSET = 16;

/** `List`/`Form` agrupada: fondo de hoja, secciones con celdas redondeadas. */
export function GroupedList({ children, contentStyle }: { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const p = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.sheet }} contentContainerStyle={[{ paddingHorizontal: H_INSET, paddingBottom: 32, gap: 20 }, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Sección con encabezado gris en mayúsculas-sentencia y pie `.footnote` gris. */
export function Section({ header, footer, children, plain }: { header?: string; footer?: string; children: ReactNode; plain?: boolean }) {
  const p = useColors();
  const rows = Children.toArray(children);
  return (
    <View>
      {header ? <Txt variant="footnote" color="secondaryLabel" style={{ marginLeft: 16, marginBottom: 6, textTransform: 'uppercase' }}>{header}</Txt> : null}
      {plain ? (
        children
      ) : (
        <View style={{ backgroundColor: p.cell, borderRadius: CELL_RADIUS, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <View key={i}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: p.separator, marginLeft: 16 }} /> : null}
              {r}
            </View>
          ))}
        </View>
      )}
      {footer ? <Txt variant="footnote" color="secondaryLabel" style={{ marginHorizontal: 16, marginTop: 8 }}>{footer}</Txt> : null}
    </View>
  );
}

/** Fila de celda: contenido a la izquierda, accesorio a la derecha; con `onPress` es un botón. */
export function Row({ children, trailing, onPress, minHeight = 44, accessibilityLabel }: { children: ReactNode; trailing?: ReactNode; onPress?: () => void; minHeight?: number; accessibilityLabel?: string }) {
  const body = (
    <View style={{ minHeight, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>{children}</View>
      {trailing}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} android_ripple={null} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{body}</Pressable>
  ) : (
    body
  );
}

/** `LabeledContent(title, value:)`. */
export function LabeledRow({ title, value }: { title: string; value: string }) {
  return (
    <Row trailing={<Txt color="secondaryLabel">{value}</Txt>}>
      <Txt>{title}</Txt>
    </Row>
  );
}

export function Chevron() {
  const p = useColors();
  return <Icon name="chevron.right" size={16} color={p.tertiaryLabel} weight={2.4} />;
}

/** `.searchable(prompt:)`. */
export function SearchBar({ value, onChangeText, prompt }: { value: string; onChangeText: (t: string) => void; prompt: string }) {
  const p = useColors();
  return (
    <View style={{ marginHorizontal: H_INSET, marginBottom: 8, height: 44, borderRadius: 22, backgroundColor: p.cell, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
      <Icon name="magnifyingglass" size={18} color={p.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={prompt}
        placeholderTextColor={p.secondaryLabel}
        autoCorrect={false}
        accessibilityLabel={prompt}
        style={{ flex: 1, color: p.label, padding: 0, ...textStyle('body') }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Borrar texto" hitSlop={8}>
          <Icon name="xmark.circle.fill" size={18} color={p.secondaryLabel} cutout={p.cell} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** `ContentUnavailableView(title, systemImage:, description:)`. */
export function ContentUnavailable({ icon, title, description }: { icon: string; title: string; description: string }) {
  const p = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 32 }}>
      <Icon name={icon} size={48} color={p.secondaryLabel} weight={1.6} />
      <Txt variant="title2" bold style={{ textAlign: 'center' }}>{title}</Txt>
      <Txt variant="callout" color="secondaryLabel" style={{ textAlign: 'center' }}>{description}</Txt>
    </View>
  );
}

/** Campo de texto de formulario (celda con `TextField`). */
export function Field(props: { value: string; onChangeText: (t: string) => void; placeholder: string } & Partial<React.ComponentProps<typeof TextInput>>) {
  const p = useColors();
  const { value, onChangeText, placeholder, ...rest } = props;
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={p.secondaryLabel}
      accessibilityLabel={placeholder}
      {...rest}
      style={{ minHeight: 44, paddingHorizontal: 16, color: p.label, fontFamily: fonts.regular, fontSize: 17, letterSpacing: -0.41 }}
    />
  );
}

export interface SwipeAction { label: string; icon: string; color: string; onPress: () => void }

/** `.swipeActions`: borrar (fin, deslizamiento completo) y editar (inicio). Umbral de deslizamiento completo: > la mitad del ancho (PM-16). */
export function SwipeRow({ children, leading, trailing }: { children: ReactNode; leading?: SwipeAction; trailing?: SwipeAction }) {
  const p = useColors();
  const x = useSharedValue(0);
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const ACTION_W = 84;
  const fire = (a?: SwipeAction) => a?.onPress();
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const lo = trailing ? -wRef.current : 0;
      const hi = leading ? ACTION_W : 0;
      x.value = Math.min(hi, Math.max(lo, e.translationX));
    })
    .onEnd(() => {
      if (trailing && x.value < -wRef.current / 2) {
        x.value = withTiming(-wRef.current, { duration: 160 }, () => runOnJS(fire)(trailing));
      } else if (trailing && x.value < -ACTION_W / 2) {
        x.value = withTiming(-ACTION_W);
      } else if (leading && x.value > ACTION_W / 2) {
        x.value = withTiming(ACTION_W);
      } else {
        x.value = withTiming(0);
      }
    });
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const close = () => {
    x.value = withTiming(0);
  };
  const Action = ({ a, side }: { a: SwipeAction; side: 'left' | 'right' }) => (
    <Pressable
      onPress={() => {
        close();
        a.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a.label}
      style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0, width: Math.max(ACTION_W, 0), backgroundColor: a.color, alignItems: 'center', justifyContent: 'center', gap: 2 }}
    >
      <Icon name={a.icon} size={20} color="#FFFFFF" />
      <Txt variant="caption" color="#FFFFFF">{a.label}</Txt>
    </Pressable>
  );
  return (
    <View
      style={{ overflow: 'hidden' }}
      onLayout={(e) => {
        wRef.current = e.nativeEvent.layout.width;
        setW(e.nativeEvent.layout.width);
      }}
    >
      {w > 0 && leading ? <Action a={leading} side="left" /> : null}
      {w > 0 && trailing ? <Action a={trailing} side="right" /> : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: p.cell }, row]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
