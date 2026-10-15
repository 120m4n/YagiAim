// ContentView.swift — pantalla de entrada: barra superior, mapa, botón de seguimiento, atribución, panel inferior / cápsula,
// banners, hojas (editor, lista, acerca de), apuntamiento y guía a pantalla completa.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aimInfo, distanceText } from '../core/aimInfo';
import { formatFixed } from '../core/formatC';
import { cardinal, type Coordinate } from '../core/geo';
import { regionToArray, savedRegion, type Region } from '../core/mapRegion';
import { randomUuid } from '../core/uuid';
import { Keys } from '../platform/kv';
import { selectedOf } from '../state/repeaterStore';
import { useLocation, useOnline, useRepeaters, useServices } from '../state/providers';
import { SchemeContext } from '../ui/colors';
import { Icon } from '../ui/icons/Icon';
import { NavBar, NavIconGroup } from '../ui/ios/NavBar';
import { FullScreen } from '../ui/ios/Presentation';
import { Label, Txt } from '../ui/ios/Txt';
import { accent50, navy94, Theme } from '../ui/theme';
import { AboutScreen } from './AboutScreen';
import { AimScreen } from './AimScreen';
import { CompassView } from './aim/CompassView';
import { RepeaterMap } from './map/MapView';
import { OSM_ATTRIBUTION, SATELLITE_ATTRIBUTION } from './map/mapStyles';
import { TrackingButton, type TrackingMode } from './map/TrackingButton';
import { OnboardingScreen } from './OnboardingScreen';
import { LocationDeniedBanner } from './PermissionBanner';
import { RepeaterEditorScreen } from './RepeaterEditorScreen';
import { RepeaterListScreen } from './RepeaterListScreen';

export function MapScreen() {
  const { kv, repeaters: store, location } = useServices();
  const insets = useSafeAreaInsets();
  const repeaters = useRepeaters((s) => s.repeaters);
  const selectedID = useRepeaters((s) => s.selectedID);
  const selected = useRepeaters(selectedOf);
  const loc = useLocation((s) => s.location);
  const cached = useLocation((s) => s.isCachedLocation);
  const online = useOnline();

  const [initialRegion] = useState<Region | undefined>(() => savedRegion(kv.getNumberArray(Keys.mapCamera)));
  const [tracking, setTracking] = useState<TrackingMode>(initialRegion ? 'none' : 'follow');
  const [satellite, setSatellite] = useState(() => kv.getBool(Keys.mapSatellite, false));
  const [onboardingDone, setOnboardingDone] = useState(() => kv.getBool(Keys.onboardingDone, false));
  const [pending, setPending] = useState<Coordinate | undefined>();
  const [showList, setShowList] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAim, setShowAim] = useState(false);
  const [panelH, setPanelH] = useState(0);

  useEffect(() => {
    void location.start(); // .onAppear { loc.start() }
  }, [location]);

  const info = selected ? aimInfo(loc, selected, undefined) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: Theme.navy }}>
      {/* Barra superior: navy, esquema oscuro, título "MeshAzimuth" */}
      <SchemeContext.Provider value="dark">
        <NavBar
          title="MeshAzimuth"
          background={Theme.navy}
          left={<NavIconGroup items={[{ icon: satellite ? 'map' : 'globe.americas', label: satellite ? 'Mapa estándar' : 'Mapa satélite', onPress: () => { setSatellite(!satellite); kv.setBool(Keys.mapSatellite, !satellite); } }]} />}
          right={<NavIconGroup items={[{ icon: 'info.circle', label: 'Acerca de', onPress: () => setShowAbout(true) }, { icon: 'list.bullet', label: 'Repetidores', onPress: () => setShowList(true) }]} />}
        />
      </SchemeContext.Provider>

      <View style={{ flex: 1 }}>
        <RepeaterMap
          repeaters={repeaters}
          selectedID={selectedID}
          me={loc}
          satellite={satellite}
          initialRegion={initialRegion}
          tracking={tracking}
          onTrackingChange={setTracking}
          onSelect={(id) => { store.selectedID = id; }}
          onTap={setPending}
          onRegionChange={(r) => kv.setNumberArray(Keys.mapCamera, regionToArray(r))}
        />

        <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, right: 12 }}>
          <TrackingButton mode={tracking} onChange={setTracking} />
        </View>

        {/* Atribución exigida por cada fuente de teselas */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 6, bottom: 6 + insets.bottom + panelH, backgroundColor: 'rgba(30,30,30,0.85)', borderRadius: 4, padding: 4, maxWidth: '70%' }}>
          {(satellite ? SATELLITE_ATTRIBUTION : [OSM_ATTRIBUTION]).map((t) => (
            <Txt key={t} variant="caption2" color="#FFFFFF">{t}</Txt>
          ))}
        </View>

        <SchemeContext.Provider value="dark">
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, left: 0, right: 0, gap: 8 }}>
            <LocationDeniedBanner />
            {!online ? (
              <View style={{ alignSelf: 'center', padding: 8, borderRadius: 20, backgroundColor: 'rgba(30,30,30,0.9)' }}>
                <Label icon="wifi.slash" variant="footnote">Sin conexión: el mapa puede no cargar</Label>
              </View>
            ) : null}
          </View>

          {/* Panel inferior / cápsula */}
          <View pointerEvents="box-none" onLayout={(e) => setPanelH(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom }}>
            {selected ? (
              <Pressable
                onPress={() => setShowAim(true)}
                accessibilityRole="button"
                accessibilityLabel={`Apuntar a ${selected.name}`}
                style={{ marginHorizontal: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, backgroundColor: navy94, borderWidth: 1, borderColor: accent50 }}
              >
                <View pointerEvents="none" style={{ width: 84, height: 84 }}>
                  <CompassView size={84} target={info?.bearing} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="headline" color="#FFFFFF">{selected.name}</Txt>
                  {info ? (
                    <>
                      <Txt variant="title3" bold tabular color="#FFFFFF">{`Azimut ${formatFixed(info.bearing, 1)}° ${cardinal(info.bearing)}`}</Txt>
                      <Txt variant="subheadline" color="accent">{distanceText(info) + (cached ? ' · ubicación anterior' : '')}</Txt>
                    </>
                  ) : (
                    <Txt color="secondaryLabel">Esperando GPS…</Txt>
                  )}
                </View>
                <Icon name="chevron.right" size={18} color="#99999E" />
              </Pressable>
            ) : (
              <View style={{ alignSelf: 'center', marginBottom: 8, padding: 12, borderRadius: 24, backgroundColor: navy94, borderWidth: 1, borderColor: accent50 }}>
                <Txt variant="subheadline" color="#FFFFFF">Toca el mapa donde está el repetidor MeshCore</Txt>
              </View>
            )}
          </View>
        </SchemeContext.Provider>
      </View>

      {pending ? (
        <RepeaterEditorScreen
          visible
          isNew
          repeater={{ id: randomUuid(), name: `Repetidor ${repeaters.length + 1}`, latitude: pending.latitude, longitude: pending.longitude }}
          onClose={() => setPending(undefined)}
        />
      ) : null}
      <RepeaterListScreen visible={showList} onClose={() => setShowList(false)} />
      <AboutScreen visible={showAbout} onClose={() => setShowAbout(false)} />
      <AimScreen visible={showAim} onClose={() => setShowAim(false)} />
      {/* Primer arranque: la guía no es descartable (el botón Atrás se ignora, PM-18) */}
      <FullScreen visible={!onboardingDone} scheme="dark">
        <OnboardingScreen onDone={() => { setOnboardingDone(true); kv.setBool(Keys.onboardingDone, true); }} />
      </FullScreen>
    </View>
  );
}
