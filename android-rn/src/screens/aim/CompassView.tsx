// CompassView.swift — rosa de los vientos que gira con el teléfono (Skia). El triángulo fijo arriba es la dirección del
// boom de la Yagi; la aguja naranja es el repetidor. Animación easeOut de 0.15 s sobre el valor numérico, INCLUIDA la vuelta
// larga al cruzar el norte (C-7: se traspasa el comportamiento de iOS).
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Group, Path, Skia, Text as SkText, useFont } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { formatFixed } from '../../core/formatC';
import { isAligned, signedDelta } from '../../core/geo';
import { useColors } from '../../ui/colors';
import { useServices } from '../../state/providers';

const MS = 150;
const RAD = Math.PI / 180;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro exige require() para los recursos
const MONO = require('../../../assets/fonts/JetBrainsMono_400Regular.ttf');

export interface CompassViewProps {
  heading: number | undefined; // rumbo actual del teléfono (verdadero)
  target: number | undefined; // azimut al repetidor
  tolerance?: number; // ° para considerar "alineado"
  onAlignedChange?: (aligned: boolean) => void;
  /** Lado en dp; por defecto, el ancho disponible (cuadrado). */
  size?: number;
}

/** Letras N/E/S/O como trazos propios con terminales redondeados (PM-26): caja de ancho `w` y alto `h`. */
function letterPath(letter: string, w: number, h: number) {
  const p = Skia.Path.Make();
  switch (letter) {
    case 'N': p.moveTo(0, h); p.lineTo(0, 0); p.lineTo(w, h); p.lineTo(w, 0); break;
    case 'E': p.moveTo(w, 0); p.lineTo(0, 0); p.lineTo(0, h); p.lineTo(w, h); p.moveTo(0, h / 2); p.lineTo(0.8 * w, h / 2); break;
    case 'S':
      p.moveTo(w, 0.2 * h); p.cubicTo(w, 0.05 * h, 0.75 * w, 0, 0.5 * w, 0); p.cubicTo(0.2 * w, 0, 0, 0.1 * h, 0, 0.28 * h);
      p.cubicTo(0, 0.5 * h, w, 0.5 * h, w, 0.75 * h); p.cubicTo(w, 0.92 * h, 0.8 * w, h, 0.5 * w, h); p.cubicTo(0.2 * w, h, 0, 0.92 * h, 0, 0.8 * h);
      break;
    default: p.addOval(Skia.XYWHRect(0, 0, w, h)); // O
  }
  return p;
}

export function CompassView({ heading, target, tolerance = 3, onAlignedChange, size: fixed }: CompassViewProps) {
  const colors = useColors();
  const { haptics } = useServices();
  const [width, setWidth] = useState(fixed ?? 0);
  const size = fixed ?? width;
  const [aligned, setAligned] = useState(false);

  const delta = heading !== undefined && target !== undefined ? signedDelta(target, heading) : undefined;

  useEffect(() => {
    const now = isAligned(delta, tolerance, aligned);
    if (now !== aligned) setAligned(now);
  }, [delta, tolerance, aligned]);

  useEffect(() => {
    onAlignedChange?.(aligned);
    if (aligned) haptics.startAligned();
    else haptics.stop();
  }, [aligned]);

  // Animación numérica (sin tomar el camino corto): 359° → 1° da casi una vuelta completa, como en SwiftUI.
  const rot = useSharedValue(heading ?? 0);
  const needle = useSharedValue(delta ?? 0);
  useEffect(() => {
    rot.value = withTiming(heading ?? 0, { duration: MS, easing: Easing.out(Easing.quad) });
  }, [heading, rot]);
  useEffect(() => {
    needle.value = withTiming(delta ?? 0, { duration: MS, easing: Easing.out(Easing.quad) });
  }, [delta, needle]);

  const c = size / 2;
  const dialTransform = useDerivedValue(() => [{ rotate: -rot.value * RAD }]);
  const needleTransform = useDerivedValue(() => [{ rotate: needle.value * RAD }]);

  const numFont = useFont(MONO, Math.max(size * 0.035, 1));
  const half = Math.max(tolerance, 1);

  const geometry = useMemo(() => {
    const ticks = Skia.Path.Make();
    const major = Skia.Path.Make();
    for (let i = 0; i < 72; i++) {
      const isMajor = i % 9 === 0;
      const isMid = i % 3 === 0;
      const h = isMajor ? size * 0.06 : isMid ? size * 0.04 : size * 0.025;
      const r = size * 0.44; // el centro del rectángulo está a 0.44·s del centro
      const a = i * 5 * RAD;
      const x0 = c + Math.sin(a) * (r - h / 2);
      const y0 = c - Math.cos(a) * (r - h / 2);
      const x1 = c + Math.sin(a) * (r + h / 2);
      const y1 = c - Math.cos(a) * (r + h / 2);
      (isMajor ? major : ticks).moveTo(x0, y0);
      (isMajor ? major : ticks).lineTo(x1, y1);
    }
    const letters = ['N', 'E', 'S', 'O'].map((l, i) => {
      const h = size * 0.07 * 0.72;
      const w = h * 0.7;
      return { l, i, path: letterPath(l, w, h), w, h };
    });
    // Aguja: (midX,minY) (maxX,maxY) (midX,maxY−0.6w) (minX,maxY) en una caja de 0.07s × 0.42s centrada 0.21s por encima del centro.
    const nw = size * 0.07;
    const nh = size * 0.42;
    const top = c - size * 0.42;
    const needlePath = Skia.Path.Make();
    needlePath.moveTo(c, top); needlePath.lineTo(c + nw / 2, top + nh); needlePath.lineTo(c, top + nh - nw * 0.6); needlePath.lineTo(c - nw / 2, top + nh); needlePath.close();
    // Triángulo fijo (apunta hacia abajo), centrado a 0.49s por encima del centro.
    const tw = size * 0.06;
    const th = size * 0.05;
    const ty = c - size * 0.49 - th / 2;
    const tri = Skia.Path.Make();
    tri.moveTo(c, ty + th); tri.lineTo(c - tw / 2, ty); tri.lineTo(c + tw / 2, ty); tri.close();
    return { ticks, major, letters, needlePath, tri };
  }, [size, c]);

  const beam = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(c, c);
    p.arcToOval(Skia.XYWHRect(c - size / 2, c - size / 2, size, size), -90 - half, half * 2, false);
    p.close();
    return p;
  }, [c, size, half]);

  const activeColor = aligned ? colors.green : colors.target;
  const secondary = colors.secondaryLabel;
  const numbers = [30, 60, 120, 150, 210, 240, 300, 330];

  const label =
    delta === undefined || target === undefined
      ? 'Sin datos de brújula'
      : aligned
        ? `Alineado con el repetidor, azimut ${Math.trunc(target)} grados`
        : `Gira ${formatFixed(Math.abs(delta), 0)} grados a la ${delta > 0 ? 'derecha' : 'izquierda'}`;

  return (
    <View
      style={{ width: fixed ?? '100%', aspectRatio: 1 }}
      onLayout={(e) => fixed === undefined && setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={label}
    >
      {size > 0 ? (
        <Canvas style={{ width: size, height: size }}>
          <Group transform={dialTransform} origin={{ x: c, y: c }}>
            <Path path={Skia.Path.Make().addCircle(c, c, size / 2)} style="stroke" strokeWidth={1.5} color={secondary} opacity={0.4} />
            <Path path={geometry.ticks} style="stroke" strokeWidth={1} color={secondary} opacity={0.55} />
            <Path path={geometry.major} style="stroke" strokeWidth={2} color={secondary} />
            {geometry.letters.map(({ l, i, path, w, h }) => (
              <Group key={l} transform={[{ rotate: i * 90 * RAD }]} origin={{ x: c, y: c }}>
                <Group transform={[{ translateX: c - w / 2 }, { translateY: c - size * 0.33 - h / 2 }]}>
                  <Path path={path} style="stroke" strokeWidth={size * 0.0135} strokeCap="round" strokeJoin="round" color={l === 'N' ? colors.red : colors.label} />
                </Group>
              </Group>
            ))}
            {numFont
              ? numbers.map((d) => {
                  const w = numFont.measureText(String(d)).width;
                  return (
                    <Group key={d} transform={[{ rotate: d * RAD }]} origin={{ x: c, y: c }}>
                      <SkText x={c - w / 2} y={c - size * 0.34 + size * 0.0125} text={String(d)} font={numFont} color={secondary} />
                    </Group>
                  );
                })
              : null}
          </Group>
          {/* Haz de la Yagi (±tolerancia): fijo, apunta al frente del teléfono */}
          <Path path={beam} color={aligned ? colors.green : secondary} opacity={0.18} />
          {delta !== undefined ? (
            <Group transform={needleTransform} origin={{ x: c, y: c }}>
              <Path path={geometry.needlePath} color={activeColor} />
            </Group>
          ) : null}
          <Path path={geometry.tri} color={aligned ? colors.green : colors.label} />
          <Path path={Skia.Path.Make().addCircle(c, c, size * 0.02)} color={colors.label} />
        </Canvas>
      ) : null}
    </View>
  );
}
