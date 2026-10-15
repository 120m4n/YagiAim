// PermissionBanner.swift — aviso cuando el permiso de ubicación está denegado o restringido.
import { View } from 'react-native';
import { ProminentButton } from '../ui/ios/Buttons';
import { Label, Txt } from '../ui/ios/Txt';
import { navy94 } from '../ui/theme';
import { openAppSettings } from '../platform/settings';
import { useLocation } from '../state/providers';

export function LocationDeniedBanner() {
  const auth = useLocation((s) => s.authorization);
  if (auth !== 'denied' && auth !== 'restricted') return null;
  return (
    <View style={{ alignItems: 'center', gap: 6, padding: 10, marginHorizontal: 16, borderRadius: 14, backgroundColor: navy94, borderWidth: 1, borderColor: 'rgba(255,158,26,0.7)' }}>
      <Label icon="location.slash" variant="footnote" bold color="#FFFFFF" iconSize={16}>Sin permiso de ubicación</Label>
      <Txt variant="caption" color="#FFFFFF" style={{ textAlign: 'center' }}>Sin GPS no se puede calcular el azimut al repetidor.</Txt>
      <ProminentButton title="Abrir Ajustes" size="small" onPress={() => void openAppSettings()} />
    </View>
  );
}
