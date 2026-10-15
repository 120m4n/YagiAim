// TrackingButton.swift — botón propio de seguimiento de ubicación. Ciclo (como Apple Maps): sin seguir → seguir → seguir
// con rumbo → seguir. Al arrastrar el mapa el motor vuelve a «sin seguir» y el estado lo refleja (PM-03).
import { Pressable } from 'react-native';
import { Icon } from '../../ui/icons/Icon';
import { navy94, Theme } from '../../ui/theme';

export type TrackingMode = 'none' | 'follow' | 'followWithHeading';

export const nextTrackingMode = (m: TrackingMode): TrackingMode => (m === 'none' ? 'follow' : m === 'follow' ? 'followWithHeading' : 'follow');

const ICON: Record<TrackingMode, string> = { none: 'location', follow: 'location.fill', followWithHeading: 'location.north.line.fill' };
const LABEL: Record<TrackingMode, string> = {
  none: 'Seguir mi ubicación',
  follow: 'Siguiendo mi ubicación. Tocar para seguir con rumbo',
  followWithHeading: 'Siguiendo con rumbo. Tocar para dejar de girar el mapa',
};

export function TrackingButton({ mode, onChange }: { mode: TrackingMode; onChange: (m: TrackingMode) => void }) {
  const off = mode === 'none';
  return (
    <Pressable
      onPress={() => onChange(nextTrackingMode(mode))}
      accessibilityRole="button"
      accessibilityLabel={LABEL[mode]}
      style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: navy94, alignItems: 'center', justifyContent: 'center', borderWidth: off ? 1 : 1.5, borderColor: off ? 'rgba(46,140,255,0.35)' : 'rgba(46,140,255,0.9)' }}
    >
      <Icon name={ICON[mode]} size={18} color={off ? '#FFFFFF' : Theme.accent} weight={2.4} />
    </Pressable>
  );
}

