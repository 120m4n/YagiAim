// PingerPicker.swift — lista de pingers cercanos. `onPick(undefined)` = pinger simulado (depuración).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';
import { BleLineTransport } from '../link/bleLineTransport';
import { linkErrorMessage, opensSettings, stateFailure, type PingerDevice } from '../link/lineTransport';
import type { PingerScanner } from '../link/pingerScanner';
import { Keys } from '../platform/kv';
import { openSettingsFor } from '../platform/settings';
import { useServices } from '../state/providers';
import { TextButton } from '../ui/ios/Buttons';
import { ActivityIndicator } from '../ui/ios/Controls';
import { GroupedList, Row, Section } from '../ui/ios/Lists';
import { NavBar, NavTextButton } from '../ui/ios/NavBar';
import { Sheet } from '../ui/ios/Presentation';
import { Label, Txt } from '../ui/ios/Txt';

export function PingerPickerScreen({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (d: PingerDevice | undefined) => void }) {
  const { kv, makeScanner } = useServices();
  const [scanner, setScanner] = useState<PingerScanner | undefined>();
  const simulated = kv.getBool(Keys.pingerSimulated, false);

  // `onAppear { scanner.start() }` / `onDisappear { scanner.stop() }`
  useEffect(() => {
    if (!visible) return;
    const s = makeScanner();
    setScanner(s);
    s.start();
    return () => {
      s.stop();
      setScanner(undefined);
    };
  }, [visible, makeScanner]);

  const pick = (d: PingerDevice | undefined) => {
    scanner?.stop();
    onClose();
    onPick(d);
  };

  return (
    <Sheet visible={visible} onClose={onClose} header={<NavBar title="Conectar pinger" withInset={false} left={<NavTextButton title="Cancelar" onPress={onClose} />} />}>
      {scanner ? <PickerBody scanner={scanner} simulated={simulated} lastDevice={BleLineTransport.lastDeviceID(kv)} pick={pick} /> : null}
    </Sheet>
  );
}

function PickerBody({ scanner, simulated, lastDevice, pick }: { scanner: PingerScanner; simulated: boolean; lastDevice: string | undefined; pick: (d: PingerDevice | undefined) => void }) {
  const devices = useStore(scanner.store, (s) => s.devices);
  const state = useStore(scanner.store, (s) => s.state);
  const timedOut = useStore(scanner.store, (s) => s.timedOut);
  const error = stateFailure(state);
  return (
    <GroupedList>
      {simulated ? (
        <Section footer="Modo de depuración: genera mediciones sin hardware, según el rumbo y el azimut reales.">
          <Row onPress={() => pick(undefined)}><Label icon="wand.and.stars" color="accent">Pinger simulado</Label></Row>
        </Section>
      ) : null}
      {error ? (
        <Section>
          <Row><Label icon="exclamationmark.triangle" color="target">{linkErrorMessage(error)}</Label></Row>
          {opensSettings(error) ? <Row><TextButton title="Abrir Ajustes" onPress={() => void openSettingsFor(error)} /></Row> : null}
        </Section>
      ) : (
        <Section header="Pingers cercanos">
          {devices.map((d) => (
            <Row key={d.id} onPress={() => pick(d)} trailing={d.id === lastDevice ? <Txt variant="caption" color="secondaryLabel">último usado</Txt> : undefined}>
              <Label icon="antenna.radiowaves.left.and.right" color="accent">{d.name}</Label>
            </Row>
          ))}
          {devices.length === 0 ? (
            timedOut ? (
              <View style={{ padding: 16, gap: 12, alignItems: 'flex-start' }}>
                <Txt variant="footnote" color="secondaryLabel">No se encontró ningún pinger. Comprueba que esté encendido y a menos de 2 m.</Txt>
                <TextButton title="Buscar de nuevo" onPress={() => scanner.start()} />
              </View>
            ) : (
              <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ActivityIndicator />
                <Txt color="secondaryLabel">Buscando pingers cercanos…</Txt>
              </View>
            )
          ) : null}
        </Section>
      )}
    </GroupedList>
  );
}
