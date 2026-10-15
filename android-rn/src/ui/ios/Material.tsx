// FR-064 / PM-27 — materiales y "Liquid Glass": colores sólidos medidos en las capturas más el borde de brillo.
// El desenfoque real solo tendría sentido sobre el mapa, pero una SurfaceView de GL no se puede capturar para desenfocar:
// sobre el mapa se usa un sólido translúcido (divergencia registrada en bench-log.md).
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../colors';

export function Material({ radius = 14, style, children, translucent = false }: { radius?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode; translucent?: boolean }) {
  const p = useColors();
  return (
    <View style={[{ backgroundColor: translucent ? `${p.material}E6` : p.material, borderRadius: radius }, style]}>{children}</View>
  );
}

/** Cápsula de vidrio de la barra de iOS 26. */
export function GlassCapsule({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const p = useColors();
  return (
    <View
      style={[
        { height: 44, minWidth: 44, borderRadius: 22, backgroundColor: p.glass, borderWidth: 1, borderColor: p.glassBorder, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 4 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
