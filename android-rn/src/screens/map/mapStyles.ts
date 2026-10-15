// PM-01 / PM-02 — estilos del mapa.
//  - Estándar: teselas OSM ráster (mismas que iOS), maxzoom 19.
//  - Satélite: EOX Sentinel-2 cloudless 2016 (WMTS, capa `s2cloudless_3857`, TileMatrixSet `GoogleMapsCompatible`, CC BY 4.0;
//    el identificador y la plantilla salen de GetCapabilities) más vías y rótulos vectoriales de OpenFreeMap (OpenMapTiles).
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const SATELLITE_ATTRIBUTION = ['EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)', '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'];

export const standardStyle: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track', 'path'];
const label = (id: string, sourceLayer: string, size: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'symbol' as const,
  source: 'ofm',
  'source-layer': sourceLayer,
  layout: { 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': size, ...extra },
  paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.5 },
});

export const satelliteStyle = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    eox: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 18 },
    ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'eox' },
    { id: 'road-casing', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ROADS.slice(0, 7)]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 14, 5, 18, 14] } },
    { id: 'road', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ROADS.slice(0, 7)]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(255,255,255,0.85)', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 14, 3, 18, 10] } },
    label('road-name', 'transportation_name', 11, { 'symbol-placement': 'line' }),
    label('water-name', 'water_name', 12),
    label('place-label', 'place', 13, { 'text-size': ['match', ['get', 'class'], 'city', 16, 'town', 14, 'village', 12, 11] }),
  ],
} as unknown as StyleSpecification;

export const styleFor = (satellite: boolean): StyleSpecification => (satellite ? satelliteStyle : standardStyle);
