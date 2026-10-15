// Barra de navegación en línea: título centrado; elementos en cápsulas de vidrio (iOS 26).
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../colors';
import { GlassCapsule } from './Material';
import { Pressable } from 'react-native';
import { Icon } from '../icons/Icon';
import { Txt } from './Txt';

export const NAV_HEIGHT = 56;

export function NavBar({ title, left, right, background, withInset = true }: { title: string; left?: ReactNode; right?: ReactNode; background?: string; withInset?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: withInset ? insets.top : 0, backgroundColor: background, zIndex: 2 }}>
      <View style={{ height: NAV_HEIGHT, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-start', gap: 8 }}>{left}</View>
        <Txt variant="headline" numberOfLines={1} style={{ maxWidth: '50%', textAlign: 'center' }} accessibilityRole="header">{title}</Txt>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>{right}</View>
      </View>
    </View>
  );
}

/** Botón de texto en cápsula ("Listo", "Cancelar", "Guardar"). */
export function NavTextButton({ title, onPress, disabled, bold }: { title: string; onPress: () => void; disabled?: boolean; bold?: boolean }) {
  const p = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      <GlassCapsule style={{ paddingHorizontal: 16 }}>
        <Txt variant="body" semibold={bold} color={p.label}>{title}</Txt>
      </GlassCapsule>
    </Pressable>
  );
}

export interface NavIcon { icon: string; label: string; onPress: () => void }

/** Íconos agrupados en una sola cápsula (info + lista a la derecha) o solos (estilo de mapa a la izquierda). */
export function NavIconGroup({ items, color }: { items: NavIcon[]; color?: string }) {
  const p = useColors();
  return (
    <GlassCapsule>
      {items.map((it) => (
        <Pressable key={it.icon} onPress={it.onPress} accessibilityRole="button" accessibilityLabel={it.label} style={({ pressed }) => ({ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Icon name={it.icon} size={22} color={color ?? p.label} />
        </Pressable>
      ))}
    </GlassCapsule>
  );
}
