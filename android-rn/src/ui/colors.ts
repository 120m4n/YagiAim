// ui-spec.md §1.2 — colores de sistema. Oscuro: medido en las capturas (sRGB); claro: paleta de sistema que publica Apple.
// Los tokens "medidos" se verifican en la calibración visual (T053/T060); donde no hay muestra, vale la captura.
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { Theme } from './theme';

export interface Palette {
  scheme: 'light' | 'dark';
  background: string; // systemBackground
  sheet: string; // fondo de hoja (systemGroupedBackground elevado)
  cell: string; // celda de lista / campo
  separator: string;
  material: string; // .thinMaterial sólido (PM-27)
  borderedFill: string; // .bordered + accent
  sliderTrack: string;
  switchOff: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  green: string;
  red: string;
  accent: string;
  target: string;
  navy: string;
  glass: string; // cápsulas de la barra (iOS 26): relleno sólido
  glassBorder: string; // borde de brillo
}

export const dark: Palette = {
  scheme: 'dark',
  background: '#000000',
  sheet: '#1C1C1E',
  cell: '#2C2C2E',
  separator: '#404043',
  material: '#1E1E1E',
  borderedFill: '#0C2340',
  sliderTrack: '#191919',
  switchOff: '#616161',
  label: '#FFFFFF',
  secondaryLabel: '#99999E',
  tertiaryLabel: '#5C5C60',
  green: '#30D158',
  red: '#FF453A',
  accent: Theme.accent,
  target: Theme.target,
  navy: Theme.navy,
  glass: 'rgba(60,60,64,0.72)',
  glassBorder: 'rgba(255,255,255,0.18)',
};

export const light: Palette = {
  scheme: 'light',
  background: '#FFFFFF',
  sheet: '#F2F2F7',
  cell: '#FFFFFF',
  separator: '#C6C6C8',
  material: '#EDEDED',
  borderedFill: '#E3EEFF',
  sliderTrack: '#E5E5EA',
  switchOff: '#E9E9EA',
  label: '#000000',
  secondaryLabel: '#8A8A8E',
  tertiaryLabel: '#C4C4C7',
  green: '#34C759',
  red: '#FF3B30',
  accent: Theme.accent,
  target: Theme.target,
  navy: Theme.navy,
  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(0,0,0,0.08)',
};

/** Fuerza un esquema en un subárbol (barra del mapa, panel y guía: siempre oscuros). */
export const SchemeContext = createContext<'light' | 'dark' | undefined>(undefined);

export function useColors(): Palette {
  const forced = useContext(SchemeContext);
  const system = useColorScheme();
  return (forced ?? system) === 'light' ? light : dark;
}
