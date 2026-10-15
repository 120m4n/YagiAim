import { Text, View, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useColors, type Palette } from '../colors';
import { Icon } from '../icons/Icon';
import { textStyle, type TextOptions, type Variant } from '../typography';

export type ColorToken = keyof Pick<Palette, 'label' | 'secondaryLabel' | 'tertiaryLabel' | 'green' | 'red' | 'accent' | 'target'> | (string & {});

export interface TxtProps extends TextProps, TextOptions {
  variant?: Variant;
  color?: ColorToken;
}

/** Texto con un estilo de iOS (ui-spec.md §1.1). `color` es un token de la paleta o un color literal. */
export function Txt({ variant = 'body', color = 'label', bold, semibold, tabular, style, ...rest }: TxtProps) {
  const p = useColors();
  const c = (p as unknown as Record<string, string>)[color] ?? color;
  return <Text {...rest} style={[textStyle(variant, { bold, semibold, tabular }), { color: c }, style]} />;
}

/**
 * `contentTransition(.numericText())`. El fundido por cambio de dígito se quitó (plan D): con el rumbo cambiando varias veces por
 * segundo hacía parpadear el texto. Cifras tabulares para que el ancho no oscile.
 */
export function NumericText(props: TxtProps) {
  return <Txt tabular {...props} />;
}

export interface LabelProps extends TxtProps {
  icon: string;
  /** Tamaño del ícono (por defecto el del texto). */
  iconSize?: number;
  iconColor?: ColorToken;
  /** Contenedor del ícono con recorte (para símbolos rellenos). */
  textStyleOverride?: StyleProp<TextStyle>;
}

/** `Label(text, systemImage:)`: ícono y texto con la separación de iOS. */
export function Label({ icon, iconSize, iconColor, children, variant = 'body', color = 'label', ...rest }: LabelProps) {
  const p = useColors();
  const tok = (c: ColorToken) => (p as unknown as Record<string, string>)[c] ?? c;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={iconSize ?? 18} color={tok(iconColor ?? color)} cutout={p.background} />
      <Txt variant={variant} color={color} {...rest}>{children}</Txt>
    </View>
  );
}
