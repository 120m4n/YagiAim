// LinkCard.swift L82–90 — sparkline del SNR↑: Swift Charts `LineMark` con el eje X oculto y el eje Y por defecto, alto 56.
// R-12 (escala automática de Swift Charts) está pendiente de medición en iOS: el dominio usa números "bonitos" (1-2-5·10^k)
// sin forzar el cero y el eje va a la derecha con rejilla fina, como en las capturas 05_02/05_03.
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { formatFixed } from '../../core/formatC';
import { useColors } from '../../ui/colors';
import { fonts } from '../../ui/typography';

export const SPARK_HEIGHT = 56;
const AXIS_W = 34;

/** Dominio y marcas del eje Y. */
export function niceScale(min: number, max: number, targetTicks = 3): { lo: number; hi: number; step: number; ticks: number[] } {
  const span = max - min || Math.max(Math.abs(max), 1);
  const raw = span / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(v);
  return { lo, hi, step, ticks };
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const p = useColors();
  const [w, setW] = useState(0);
  if (values.length < 2) return null;
  const sc = niceScale(Math.min(...values), Math.max(...values));
  const plotW = Math.max(w - AXIS_W, 1);
  const y = (v: number) => 4 + (SPARK_HEIGHT - 8) * (1 - (v - sc.lo) / (sc.hi - sc.lo || 1));
  const x = (i: number) => (plotW * i) / (values.length - 1);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${formatFixed(x(i), 2)},${formatFixed(y(v), 2)}`).join(' ');
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: SPARK_HEIGHT }} accessibilityLabel="Gráfica del SNR de subida">
      {w > 0 ? (
        <Svg width={w} height={SPARK_HEIGHT}>
          {sc.ticks.map((t) => (
            <Line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={p.separator} strokeWidth={0.5} />
          ))}
          <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {sc.ticks.map((t) => (
            <SvgText key={`l${t}`} x={plotW + 4} y={y(t) + 4} fontSize={11} fontFamily={fonts.regular} fill={p.secondaryLabel}>{formatFixed(t, 0)}</SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
