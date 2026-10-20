// MapView.swift — mapa MapLibre RN: OSM o satélite, marcadores tipo globo, línea de apuntamiento, filtro de gestos.
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker, type PressEvent, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import type { Coordinate } from '../../core/geo';
import { regionFromBounds, regionToBounds, type Region } from '../../core/mapRegion';
import { repeaterCoordinate, type Repeater } from '../../core/repeater';
import { Icon } from '../../ui/icons/Icon';
import { Theme } from '../../ui/theme';
import { styleFor } from './mapStyles';
import type { TrackingMode } from './TrackingButton';

export interface MapViewProps {
  repeaters: Repeater[];
  selectedID: string | undefined;
  me: Coordinate | undefined;
  satellite: boolean;
  initialRegion: Region | undefined;
  tracking: TrackingMode;
  onTrackingChange: (m: TrackingMode) => void;
  onSelect: (id: string) => void;
  onTap: (c: Coordinate) => void;
  onRegionChange: (r: Region) => void;
}

/** Ventana de doble toque de Android: un toque simple solo cuenta si no llega otro (equivale a `tap.require(toFail: doubleTap)`). */
const DOUBLE_TAP_MS = 300;
/** Margen en que un toque del mapa se descarta tras un toque en un pin (el del mapa puede llegar antes o después). */
const PIN_TAP_MS = 500;

/** Marcador tipo globo con el glifo de antena: naranja (`target`) si está seleccionado, azul (`accent`) si no. */
function Pin({ selected }: { selected: boolean }) {
  const c = selected ? Theme.target : Theme.accent;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' }}>
        <Icon name="antenna.radiowaves.left.and.right" size={20} color="#FFFFFF" />
      </View>
      <View style={{ width: 0, height: 0, marginTop: -2, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: c }} />
    </View>
  );
}

export function RepeaterMap(p: MapViewProps) {
  const tap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(tap.current), []);
  // Un toque en un pin también llega al mapa (en cualquier orden): ese toque no es un alta.
  const pinAt = useRef(0);
  const onPinPress = (id: string) => {
    pinAt.current = Date.now();
    clearTimeout(tap.current);
    tap.current = undefined;
    p.onSelect(id);
  };
  const initial = useMemo(() => (p.initialRegion ? { bounds: regionToBounds(p.initialRegion) } : undefined), []);

  const target = p.repeaters.find((r) => r.id === p.selectedID);
  const line = useMemo(
    () =>
      p.me && target
        ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[p.me.longitude, p.me.latitude], [target.longitude, target.latitude]] } }
        : { type: 'FeatureCollection' as const, features: [] },
    [p.me?.latitude, p.me?.longitude, target?.latitude, target?.longitude],
  );

  const onPress = (e: NativeSyntheticEvent<PressEvent>) => {
    const [lon, lat] = e.nativeEvent.lngLat;
    if (Date.now() - pinAt.current < PIN_TAP_MS) return;
    if (tap.current) {
      clearTimeout(tap.current); // segundo toque: es un doble toque (zoom), no un alta
      tap.current = undefined;
      return;
    }
    tap.current = setTimeout(() => {
      tap.current = undefined;
      p.onTap({ latitude: lat, longitude: lon });
    }, DOUBLE_TAP_MS);
  };

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={styleFor(p.satellite)}
      attribution={false}
      logo={false}
      compass
      compassHiddenFacingNorth
      compassPosition={{ top: 60, right: 12 }}
      scaleBar
      scaleBarPosition={{ top: 8, left: 8 }}
      touchPitch={false}
      onPress={onPress}
      onRegionDidChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => p.onRegionChange(regionFromBounds(e.nativeEvent.bounds))}
    >
      <Camera
        {...(initial ? { initialViewState: initial } : {})}
        maxZoom={19}
        {...(p.tracking === 'none' ? {} : { trackUserLocation: p.tracking === 'follow' ? ('default' as const) : ('heading' as const) })}
        onTrackUserLocationChange={(e) => {
          // Al arrastrar el mapa el motor sale del seguimiento: el botón vuelve a "sin seguir" (PM-03).
          if (e.nativeEvent.trackUserLocation === null && p.tracking !== 'none') p.onTrackingChange('none');
        }}
      />
      {/* Contorno blanco 95 % de 8 px con extremo redondeado + trazo naranja de 4 px discontinuo [12, 8] con extremo plano, por encima de las etiquetas */}
      <GeoJSONSource id="aim" data={line}>
        <Layer id="aim-casing" type="line" style={{ lineColor: 'rgba(255,255,255,0.95)', lineWidth: 8, lineCap: 'round', lineJoin: 'round' }} />
        <Layer id="aim-line" type="line" style={{ lineColor: Theme.target, lineWidth: 4, lineCap: 'butt', lineDasharray: [3, 2] }} />
      </GeoJSONSource>
      {p.repeaters.map((r) => {
        const c = repeaterCoordinate(r);
        return (
          <Marker key={r.id} id={r.id} lngLat={[c.longitude, c.latitude]} anchor="bottom" onPress={() => onPinPress(r.id)}>
            <Pin selected={r.id === p.selectedID} />
          </Marker>
        );
      })}
      {p.me ? (
        <Marker id="me" lngLat={[p.me.longitude, p.me.latitude]}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#0A84FF', borderWidth: 3, borderColor: '#FFFFFF' }} />
        </Marker>
      ) : null}
    </Map>
  );
}
