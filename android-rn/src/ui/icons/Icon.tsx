// FR-062 / PM-25 — íconos propios (glifos de Lucide) con el tamaño de caja y el color del símbolo de iOS.
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { glyphs, type GlyphNode } from './glyphs';

const TAGS = { path: Path, circle: Circle, line: Line, rect: Rect, polyline: Polyline, polygon: Polygon, ellipse: Ellipse } as const;

export type SymbolName = keyof typeof glyphs;

export interface IconProps {
  name: string;
  size?: number;
  color: string;
  /** Color para los recortes de los símbolos rellenos (fondo del contenedor). */
  cutout?: string;
  /** Grosor del trazo en el lienzo de 24 (regular 2; semibold 2.4). */
  weight?: number;
}

function renderNode(n: GlyphNode, key: string, extra: Record<string, string | number>) {
  const Tag = TAGS[n.tag] as React.ComponentType<Record<string, unknown>>;
  return <Tag key={key} {...n.attrs} {...extra} />;
}

export function Icon({ name, size = 17, color, cutout = 'transparent', weight = 2 }: IconProps) {
  const g = glyphs[name];
  if (!g) throw new Error(`Símbolo sin glifo: ${name}`);
  const stroke = { stroke: color, strokeWidth: weight, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {g.parts.flatMap((nodes, pi) =>
        nodes.map((n, ni) => {
          const k = `${pi}-${ni}`;
          if (g.mode === 'fill') return renderNode(n, k, { ...stroke, fill: color });
          if (g.mode === 'cutout') return renderNode(n, k, pi === 0 ? { ...stroke, fill: color } : { ...stroke, stroke: cutout, strokeWidth: weight + 0.4 });
          return renderNode(n, k, stroke);
        }),
      )}
    </Svg>
  );
}
