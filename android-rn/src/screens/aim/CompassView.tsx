// CompassView.swift — rosa de los vientos que gira con el teléfono (Skia). El triángulo fijo arriba es la dirección del boom
// de la Yagi; la aguja naranja es el repetidor.
//
// Rendimiento (plan D): el rumbo NO entra por props. La brújula se suscribe a la tienda de ubicación y mueve valores
// compartidos de Reanimated, así que el rumbo (~20 Hz) no repinta ni React ni la pantalla que la contiene; solo cambia de
// estado React lo raro: alineado/no alineado, hay/no hay rumbo, tamaño.
// El ángulo del dial y el de la aguja se animan en continuo por el camino corto con `unwrapAngle` (= `Geo.unwrap` de iOS, C-7):
// 359° → 1° y 179° → −179° giran 2°, no casi una vuelta. Divergencias respecto a iOS (registradas en bench-log.md): interpolación
// lineal corta que continúa sin reiniciar la curva (iOS: easeOut 0.15 s) y la vibración de «alineado» espera 300 ms de permanencia.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Group, Path, Skia, Text as SkText, useFont } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { formatFixed } from '../../core/formatC';
import { isAligned, signedDelta, unwrapAngle } from '../../core/geo';
import { headingOf, type LocationState } from '../../state/locationStore';
import { useServices } from '../../state/providers';
import { useColors } from '../../ui/colors';

const FOLLOW_MS = 100; // algo mayor que el periodo de los eventos (50 ms): las interpolaciones se solapan y no hay arranques bruscos
const ALIGN_DWELL_MS = 300;
const LABEL_EVERY_MS = 1000;
const RAD = Math.PI / 180;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro exige require() para los recursos
const MONO = require('../../../assets/fonts/JetBrainsMono_400Regular.ttf');
const NUMBERS = [30, 60, 120, 150, 210, 240, 300, 330];

export interface CompassViewProps {
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

export function CompassView({ target, tolerance = 3, onAlignedChange, size: fixed }: CompassViewProps) {
  const colors = useColors();
  const { haptics, location } = useServices();
  const store = location.store;
  const [width, setWidth] = useState(fixed ?? 0);
  const size = fixed ?? width;
  const [aligned, setAligned] = useState(false);
  const [needleOn, setNeedleOn] = useState(false);
  const [label, setLabel] = useState('Sin datos de brújula');

  const start = headingOf(store.getState());
  const rot = useSharedValue(start ?? 0);
  const needle = useSharedValue(0);
  const contRot = useRef(start ?? 0);
  const contNeedle = useRef(0);
  const alignedRef = useRef(false);
  const labelAt = useRef(0);
  const inputs = useRef({ target, tolerance });
  inputs.current = { target, tolerance };

  // Un solo suscriptor: mueve los valores compartidos y solo toca el estado de React cuando cambia algo discreto.
  const apply = (s: LocationState) => {
    const h = headingOf(s);
    const { target: t, tolerance: tol } = inputs.current;
    if (h === undefined) {
      setNeedleOn(false);
      if (alignedRef.current) { alignedRef.current = false; setAligned(false); }
      setLabel('Sin datos de brújula');
      return;
    }
    contRot.current = unwrapAngle(contRot.current, h);
    rot.value = withTiming(contRot.current, { duration: FOLLOW_MS, easing: Easing.linear });
    if (t === undefined) {
      setNeedleOn(false);
      if (alignedRef.current) { alignedRef.current = false; setAligned(false); }
      setLabel('Sin datos de brújula');
      return;
    }
    const d = signedDelta(t, h);
    contNeedle.current = unwrapAngle(contNeedle.current, d);
    needle.value = withTiming(contNeedle.current, { duration: FOLLOW_MS, easing: Easing.linear });
    setNeedleOn(true);
    const now = isAligned(d, tol, alignedRef.current);
    if (now !== alignedRef.current) { alignedRef.current = now; setAligned(now); }
    const at = Date.now();
    if (at - labelAt.current >= LABEL_EVERY_MS || now !== aligned) {
      labelAt.current = at;
      setLabel(now ? `Alineado con el repetidor, azimut ${Math.trunc(t)} grados` : `Gira ${formatFixed(Math.abs(d), 0)} grados a la ${d > 0 ? 'derecha' : 'izquierda'}`);
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    applyRef.current(store.getState());
    return store.subscribe((s) => applyRef.current(s));
  }, [store]);
  useEffect(() => applyRef.current(store.getState()), [target, tolerance, store]);

  // Vibración: solo tras 300 ms de permanencia alineado; se corta al salir.
  useEffect(() => {
    onAlignedChange?.(aligned);
    if (!aligned) {
      haptics.stop();
      return;
    }
    const t = setTimeout(() => haptics.startAligned(), ALIGN_DWELL_MS);
    return () => clearTimeout(t);
  }, [aligned]);

  const c = size / 2;
  const dialTransform = useDerivedValue(() => [{ rotate: -rot.value * RAD }]);
  const needleTransform = useDerivedValue(() => [{ rotate: needle.value * RAD }]);
  const numFont = useFont(MONO, Math.max(size * 0.035, 1));
  const half = Math.max(tolerance, 1);

  // Todo lo estático se construye una sola vez por tamaño.
  const geometry = useMemo(() => {
    const ticks = Skia.Path.Make();
    const major = Skia.Path.Make();
    for (let i = 0; i < 72; i++) {
      const isMajor = i % 9 === 0;
      const isMid = i % 3 === 0;
      const h = isMajor ? size * 0.06 : isMid ? size * 0.04 : size * 0.025;
      const r = size * 0.44; // el centro del rectángulo está a 0.44·s del centro
      const a = i * 5 * RAD;
      const dst = isMajor ? major : ticks;
      dst.moveTo(c + Math.sin(a) * (r - h / 2), c - Math.cos(a) * (r - h / 2));
      dst.lineTo(c + Math.sin(a) * (r + h / 2), c - Math.cos(a) * (r + h / 2));
    }
    const letters = ['N', 'E', 'S', 'O'].map((l, i) => {
      const h = size * 0.07 * 0.72;
      const w = h * 0.7;
      return { l, i, path: letterPath(l, w, h), w, h };
    });
    const nw = size * 0.07;
    const nh = size * 0.42;
    const top = c - size * 0.42;
    const needlePath = Skia.Path.Make();
    needlePath.moveTo(c, top); needlePath.lineTo(c + nw / 2, top + nh); needlePath.lineTo(c, top + nh - nw * 0.6); needlePath.lineTo(c - nw / 2, top + nh); needlePath.close();
    const tw = size * 0.06;
    const th = size * 0.05;
    const ty = c - size * 0.49 - th / 2;
    const tri = Skia.Path.Make();
    tri.moveTo(c, ty + th); tri.lineTo(c - tw / 2, ty); tri.lineTo(c + tw / 2, ty); tri.close();
    return { ticks, major, letters, needlePath, tri, ring: Skia.Path.Make().addCircle(c, c, size / 2), dot: Skia.Path.Make().addCircle(c, c, size * 0.02) };
  }, [size, c]);

  const beam = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(c, c);
    p.arcToOval(Skia.XYWHRect(c - size / 2, c - size / 2, size, size), -90 - half, half * 2, false);
    p.close();
    return p;
  }, [c, size, half]);

  const numberWidths = useMemo(() => (numFont ? NUMBERS.map((d) => numFont.measureText(String(d)).width) : []), [numFont]);

  const activeColor = aligned ? colors.green : colors.target;
  const secondary = colors.secondaryLabel;

  return (
    <View style={{ width: fixed ?? '100%', aspectRatio: 1 }} onLayout={(e) => fixed === undefined && setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={label}>
      {size > 0 ? (
        <Canvas style={{ width: size, height: size }}>
          <Group transform={dialTransform} origin={{ x: c, y: c }}>
            <Path path={geometry.ring} style="stroke" strokeWidth={1.5} color={secondary} opacity={0.4} />
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
              ? NUMBERS.map((d, k) => (
                  <Group key={d} transform={[{ rotate: d * RAD }]} origin={{ x: c, y: c }}>
                    <SkText x={c - (numberWidths[k] ?? 0) / 2} y={c - size * 0.34 + size * 0.0125} text={String(d)} font={numFont} color={secondary} />
                  </Group>
                ))
              : null}
          </Group>
          {/* Haz de la Yagi (±tolerancia): fijo, apunta al frente del teléfono */}
          <Path path={beam} color={aligned ? colors.green : secondary} opacity={0.18} />
          {needleOn ? (
            <Group transform={needleTransform} origin={{ x: c, y: c }}>
              <Path path={geometry.needlePath} color={activeColor} />
            </Group>
          ) : null}
          <Path path={geometry.tri} color={aligned ? colors.green : colors.label} />
          <Path path={geometry.dot} color={colors.label} />
        </Canvas>
      ) : null}
    </View>
  );
}
