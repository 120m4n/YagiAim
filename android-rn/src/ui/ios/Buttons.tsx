import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../colors';
import { Icon } from '../icons/Icon';
import { Txt } from './Txt';

type Size = 'small' | 'regular' | 'large';
const HEIGHT: Record<Size, number> = { small: 28, regular: 36, large: 50 };
const PAD: Record<Size, number> = { small: 12, regular: 16, large: 24 };

interface ButtonProps {
  title: string;
  icon?: string;
  onPress?: () => void;
  disabled?: boolean;
  size?: Size;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

function Base({ title, icon, onPress, disabled, size = 'regular', style, fill, textColor, iconColor, accessibilityLabel, border }: ButtonProps & { fill: string; textColor: string; iconColor: string; border?: string }) {
  const variant = size === 'small' ? 'footnote' : size === 'large' ? 'headline' : 'headline';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [
        { height: HEIGHT[size], paddingHorizontal: PAD[size], borderRadius: HEIGHT[size] / 2, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, borderWidth: border ? 1 : 0, borderColor: border },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'small' ? 14 : 18} color={iconColor} /> : null}
      <Txt variant={variant} semibold color={textColor} numberOfLines={1}>{title}</Txt>
    </Pressable>
  );
}

/** `.buttonStyle(.borderedProminent)`: cápsula rellena de accent, texto blanco. */
export function ProminentButton(props: ButtonProps) {
  const p = useColors();
  return <Base {...props} fill={p.accent} textColor="#FFFFFF" iconColor="#FFFFFF" />;
}

/** `.buttonStyle(.bordered)`: cápsula con relleno tintado. */
export function BorderedButton(props: ButtonProps) {
  const p = useColors();
  return <Base {...props} fill={p.borderedFill} textColor={p.accent} iconColor={p.accent} />;
}

/** Botón de texto plano (accent) o destructivo (rojo). */
export function TextButton({ title, icon, onPress, destructive, disabled, variant = 'body', align }: { title: string; icon?: string; onPress?: () => void; destructive?: boolean; disabled?: boolean; variant?: 'body' | 'footnote'; align?: 'center' | 'left' }) {
  const p = useColors();
  const c = destructive ? p.red : p.accent;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: align === 'center' ? 'center' : 'flex-start' })}>
      {icon ? <Icon name={icon} size={variant === 'footnote' ? 14 : 18} color={c} /> : null}
      <Txt variant={variant} color={c}>{title}</Txt>
    </Pressable>
  );
}

/** Botón de ícono en una cápsula de vidrio (barra de navegación) — ver NavBar. */
export function IconTap({ icon, onPress, color, label, size = 20 }: { icon: string; onPress: () => void; color: string; label: string; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => ({ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <View>
        <Icon name={icon} size={size} color={color} />
      </View>
    </Pressable>
  );
}
