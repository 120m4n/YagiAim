// ui-spec.md §1.1 — estilos de texto de iOS en tamaño "Large". Familias (PM-26): Inter para todo el texto;
// JetBrains Mono para los números de la brújula; N/E/S/O son trazos propios (CompassView).
// `letterSpacing`: tabla de tracking de Apple (HIG → Typography) por tamaño, a calibrar con T060.
import type { TextStyle } from 'react-native';

export type Variant =
  | 'largeTitle' | 'title' | 'title2' | 'title3' | 'headline' | 'body' | 'callout' | 'subheadline' | 'footnote' | 'caption' | 'caption2';

export const fonts = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
} as const;

const base: Record<Variant, { size: number; line: number; track: number; weight: 'regular' | 'semibold' }> = {
  largeTitle: { size: 34, line: 41, track: 0.37, weight: 'regular' },
  title: { size: 28, line: 34, track: 0.36, weight: 'regular' },
  title2: { size: 22, line: 28, track: 0.35, weight: 'regular' },
  title3: { size: 20, line: 25, track: 0.38, weight: 'regular' },
  headline: { size: 17, line: 22, track: -0.41, weight: 'semibold' },
  body: { size: 17, line: 22, track: -0.41, weight: 'regular' },
  callout: { size: 16, line: 21, track: -0.32, weight: 'regular' },
  subheadline: { size: 15, line: 20, track: -0.24, weight: 'regular' },
  footnote: { size: 13, line: 18, track: -0.08, weight: 'regular' },
  caption: { size: 12, line: 16, track: 0, weight: 'regular' },
  caption2: { size: 11, line: 13, track: 0.07, weight: 'regular' },
};

export interface TextOptions {
  bold?: boolean;
  semibold?: boolean;
  /** `monospacedDigit()` */
  tabular?: boolean;
}

export function textStyle(v: Variant, o: TextOptions = {}): TextStyle {
  const b = base[v];
  const family = o.bold ? fonts.bold : o.semibold || b.weight === 'semibold' ? fonts.semibold : fonts.regular;
  return {
    fontFamily: family,
    fontSize: b.size,
    lineHeight: b.line,
    letterSpacing: b.track,
    ...(o.tabular ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

/** `.system(size:, weight: .semibold)` de los íconos. */
export const iconSize = { tracking: 18, about: 44, onboarding: 64 } as const;
