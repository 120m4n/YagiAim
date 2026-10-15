// AimView.swift — pantalla de apuntamiento a pantalla completa.
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aimInfo, distanceText, type AimInfo } from '../core/aimInfo';
import { formatFixed } from '../core/formatC';
import { cardinal } from '../core/geo';
import { startDiagnostic, stopDiagnostic } from '../native/heading';
import { allowScreenOff, keepScreenOn } from '../platform/keepAwake';
import { Keys } from '../platform/kv';
import { headingOf } from '../state/locationStore';
import { selectedOf } from '../state/repeaterStore';
import { useStore } from 'zustand';
import { headingDebug } from '../state/headingDebug';
import { angleChanged, numberChanged } from '../state/throttle';
import { useThrottled } from '../state/useThrottled';
import { useLocation, useRepeaters, useServices } from '../state/providers';
import { BorderedButton } from '../ui/ios/Buttons';
import { ActivityIndicator, Slider } from '../ui/ios/Controls';
import { NavBar, NavTextButton } from '../ui/ios/NavBar';
import { ConfirmationDialog, FullScreen } from '../ui/ios/Presentation';
import { Icon } from '../ui/icons/Icon';
import { Label, NumericText, Txt } from '../ui/ios/Txt';
import { useColors } from '../ui/colors';
import { CompassView } from './aim/CompassView';
import { PingerSection } from './aim/PingerSection';
import { LocationDeniedBanner } from './PermissionBanner';

function Row({ k, v, onLongPress }: { k: string; v: string; onLongPress?: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} disabled={!onLongPress} style={{ flexDirection: 'row', gap: 24 }}>
      <Txt color="secondaryLabel" tabular style={{ width: 170 }}>{k}</Txt>
      <Txt bold tabular>{v}</Txt>
    </Pressable>
  );
}

function Instruction({ info, aligned }: { info: AimInfo; aligned: boolean }) {
  const colors = useColors();
  const d = info.delta;
  if (d === undefined) return <Txt variant="title2" color="secondaryLabel">Brújula no disponible</Txt>;
  if (aligned) return <Label icon="checkmark.circle.fill" variant="largeTitle" bold color="green" iconSize={34}>Alineado</Label>;
  // `contentTransition(.numericText())`
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={d > 0 ? 'arrow.clockwise' : 'arrow.counterclockwise'} size={34} color={colors.target} />
      <NumericText variant="largeTitle" bold tabular color="target">{`Gira ${formatFixed(Math.abs(d), 0)}°`}</NumericText>
    </View>
  );
}

function AimContent({ onClose }: { onClose: () => void }) {
  const { kv, location, motion, link } = useServices();
  const p = useColors();
  const insets = useSafeAreaInsets();
  const selected = useRepeaters(selectedOf);
  const loc = useLocation((s) => s.location);
  // Los textos se actualizan a ≤ 5 Hz y con histéresis; la brújula se mueve aparte (CompassView se suscribe sola).
  const heading = useThrottled(location.store, headingOf, { intervalMs: 200, changed: angleChanged(0.7) });
  const hasRawHeading = useLocation((s) => s.rawHeading !== undefined);
  const accuracy = useLocation((s) => s.headingAccuracy);
  const offset = useLocation((s) => s.headingOffset);
  const magnetic = useLocation((s) => s.usingMagneticFallback);
  const pitch = useThrottled(motion.store, (m) => m.pitch, { intervalMs: 250, changed: numberChanged(0.3) });
  const [tolerance, setToleranceState] = useState(() => kv.getNumber(Keys.tolerance, 3.0));
  const [aligned, setAligned] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // FASE 0 (temporal): mantener pulsado «Precisión brújula» graba 30 s; cada pulsación usa la siguiente etiqueta.
  const [diag, setDiag] = useState<string | undefined>();
  const dbg = useStore(headingDebug, (d) => d.last);
  const diagRun = useRef(0);
  const toggleDiag = () => {
    if (diag?.startsWith('Grabando')) return;
    const label = ['reposo', 'giro', 'metal', 'extra'][diagRun.current++ % 4] as string;
    const path = startDiagnostic(label);
    setDiag(`Grabando ${label} (30 s)…`);
    setTimeout(() => {
      stopDiagnostic();
      setDiag(`Guardado: ${path}`);
    }, 30_000);
  };

  // onAppear / onDisappear / scenePhase
  useEffect(() => {
    void keepScreenOn();
    motion.start();
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') link.stopLive(); // sin modo background
    });
    return () => {
      sub.remove();
      void allowScreenOff();
      motion.stop();
      link.disconnect();
    };
  }, [motion, link]);

  const setTolerance = (v: number) => {
    setToleranceState(v);
    kv.setNumber(Keys.tolerance, v);
  };

  const info = selected ? aimInfo(loc, selected, heading) : undefined;
  const accuracyText = accuracy < 0 ? 'sin calibrar' : `±${formatFixed(accuracy, 0)}°`;

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <NavBar title={selected?.name ?? 'Apuntar'} right={<NavTextButton title="Listo" onPress={onClose} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24, gap: 20, alignItems: 'stretch' }}>
        {selected ? (
          <>
            <View style={{ paddingHorizontal: 24 }}>
              <CompassView target={info?.bearing} tolerance={tolerance} onAlignedChange={setAligned} />
            </View>
            {info ? (
              <>
                <View style={{ alignItems: 'center' }}>
                  <Instruction info={info} aligned={aligned} />
                </View>
                <View style={{ gap: 8, alignSelf: 'center' }}>
                  <Row k="Azimut verdadero" v={`${formatFixed(info.bearing, 1)}° ${cardinal(info.bearing)}`} />
                  <Row k="Rumbo teléfono" v={heading !== undefined ? `${formatFixed(heading, 1)}°` : '—'} />
                  <Row k="Distancia" v={distanceText(info)} />
                  {info.elevation !== undefined ? <Row k="Elevación objetivo" v={`${formatFixed(info.elevation, 1, true)}°`} /> : null}
                  {pitch !== undefined ? (
                    <>
                      <Row k="Inclinación boom" v={`${formatFixed(pitch, 1, true)}°`} />
                      {info.elevation !== undefined ? <Row k="Ajuste vertical" v={`${info.elevation - pitch >= 0 ? 'Sube' : 'Baja'} ${formatFixed(Math.abs(info.elevation - pitch), 1)}°`} /> : null}
                    </>
                  ) : null}
                  <Row k="Precisión brújula" v={accuracyText} onLongPress={toggleDiag} />
                  {diag ? <Txt variant="caption" color="target">{diag}</Txt> : null}
                  {diag && dbg ? <Txt variant="caption" color="target" tabular>{`cal ${dbg.calibrated ? 'sí' : 'no'} · cobertura ${dbg.coverage}/26 · rms ${dbg.rms === undefined ? '—' : formatFixed(dbg.rms, 1)} µT · campo ${formatFixed(dbg.dev * 100, 0, true)} % · inclinación ${formatFixed(dbg.dipError, 0, true)}°`}</Txt> : null}
                  <Row k="Precisión GPS" v={loc ? `±${formatFixed(loc.horizontalAccuracy, 0)} m` : '—'} />
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <LocationDeniedBanner />
                <ActivityIndicator />
                <Txt color="secondaryLabel">Obteniendo ubicación…</Txt>
              </View>
            )}

            {magnetic ? (
              <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
                <Label icon="exclamationmark.triangle" variant="footnote" color="target">Usando norte magnético (sin GPS). Declinación no corregida.</Label>
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 16, gap: 2 }}>
              <Txt variant="footnote">{`Tolerancia de alineación: ±${Math.trunc(tolerance)}°`}</Txt>
              <Slider value={tolerance} min={1} max={15} step={1} onValueChange={setTolerance} />
            </View>

            {info ? (
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
                <BorderedButton title="Calibrar boom" size="small" disabled={!hasRawHeading} onPress={() => setConfirm(true)} />
                {offset !== 0 ? <BorderedButton title={`Restablecer (${formatFixed(offset, 1, true)}°)`} size="small" onPress={() => { location.headingOffset = 0; }} /> : null}
              </View>
            ) : null}
            <ConfirmationDialog
              visible={confirm}
              title="¿La Yagi está apuntando exactamente al repetidor?"
              message="Se corregirá la diferencia entre el teléfono y el boom usando este azimut como referencia."
              actions={[{ label: 'Sí, calibrar', onPress: () => { setConfirm(false); if (info) location.calibrate(info.bearing); } }]}
              onCancel={() => setConfirm(false)}
            />

            <PingerSection repeater={selected} bearing={info?.bearing} />

            <Txt variant="footnote" color="secondaryLabel" style={{ textAlign: 'center', paddingHorizontal: 16 }}>
              Sostén el teléfono plano sobre el boom, con la parte superior hacia el director. Aléjate de metal y del cable coaxial.
            </Txt>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function AimScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <FullScreen visible={visible} onRequestClose={onClose}>
      <AimContent onClose={onClose} />
    </FullScreen>
  );
}
