// AboutView.swift — Acerca de: versión, desarrollador y proyectos relacionados.
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { formatByteCount } from '../core/byteCount';
import { Keys } from '../platform/kv';
import { clearMapCache, mapCacheBytes } from '../platform/mapCache';
import { resolveLocaleTag } from '../platform/locale';
import { useServices } from '../state/providers';
import { Icon } from '../ui/icons/Icon';
import { useColors } from '../ui/colors';
import { TextButton } from '../ui/ios/Buttons';
import { Switch } from '../ui/ios/Controls';
import { GroupedList, LabeledRow, Row, Section } from '../ui/ios/Lists';
import { NavBar, NavTextButton } from '../ui/ios/NavBar';
import { ConfirmationDialog, FullScreen, Sheet } from '../ui/ios/Presentation';
import { Label, Txt } from '../ui/ios/Txt';
import { Theme } from '../ui/theme';
import { OnboardingScreen } from './OnboardingScreen';

export const APP_NAME = 'MeshAzimuth';
export const APP_VERSION = '1.0 (1)';

export function AboutScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { kv } = useServices();
  const p = useColors();
  const [cacheBytes, setCacheBytes] = useState(() => mapCacheBytes());
  const [confirmClear, setConfirmClear] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [simulated, setSimulated] = useState(() => kv.getBool(Keys.pingerSimulated, false));
  return (
    <>
      <Sheet visible={visible} onClose={onClose} header={<NavBar title="Acerca de" withInset={false} right={<NavTextButton title="Listo" onPress={onClose} />} />}>
        <GroupedList>
          <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
            <Icon name="scope" size={44} color={Theme.target} weight={2.4} />
            <Txt variant="title2" bold>{APP_NAME}</Txt>
            <Txt variant="subheadline" color="secondaryLabel">Apunta tu Yagi al repetidor MeshCore</Txt>
          </View>
          <Section header="Aplicación">
            <LabeledRow title="Versión" value={APP_VERSION} />
            <Row onPress={() => setShowGuide(true)}><Label icon="questionmark.circle" color="accent">Ver guía de uso</Label></Row>
          </Section>
          <Section header="Almacenamiento" footer="Guarda solo las teselas que has visto (máx. 500 MB). Para usar una zona sin red, recórrela antes con conexión.">
            <LabeledRow title="Caché de mapas" value={formatByteCount(cacheBytes, resolveLocaleTag())} />
            <Row><TextButton title="Borrar caché de mapas" destructive onPress={() => setConfirmClear(true)} /></Row>
          </Section>
          <Section header="Depuración" footer="Sustituye al pinger BLE por uno simulado que genera mediciones según tu rumbo y el azimut. Sirve para probar la pantalla sin hardware.">
            <Row trailing={<Switch value={simulated} accessibilityLabel="Pinger simulado" onValueChange={(v) => { setSimulated(v); kv.setBool(Keys.pingerSimulated, v); }} />}>
              <Txt>Pinger simulado</Txt>
            </Row>
          </Section>
          <Section header="Desarrollador">
            <LabeledRow title="Indicativo" value="HJ7RMN" />
            <Row onPress={() => void Linking.openURL('https://github.com/120m4n')}><Label icon="chevron.left.forwardslash.chevron.right" color="accent">github.com/120m4n</Label></Row>
          </Section>
          <Section header="Proyectos relacionados">
            <Row onPress={() => void Linking.openURL('https://meshcore-bga.sidis-ingenieria.com')}>
              <View style={{ gap: 2 }}>
                <Label icon="map" color="accent">MeshCore Santander</Label>
                <Txt variant="caption" color={p.secondaryLabel}>Mapa de cobertura MeshCore: reportes de conectividad y simulación de línea de vista (LOS) 360°.</Txt>
              </View>
            </Row>
          </Section>
        </GroupedList>
      </Sheet>
      {/* La guía no es descartable: el botón Atrás se ignora (PM-18) */}
      <FullScreen visible={showGuide} scheme="dark"><OnboardingScreen onDone={() => setShowGuide(false)} /></FullScreen>
      <ConfirmationDialog
        visible={confirmClear}
        title="¿Borrar la caché de mapas?"
        actions={[{ label: 'Borrar', destructive: true, onPress: () => { setConfirmClear(false); void clearMapCache().then(() => setCacheBytes(mapCacheBytes())); } }]}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}
