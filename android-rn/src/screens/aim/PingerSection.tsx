// PingerSection.swift — bloque del pinger en la pantalla de apuntamiento: conexión, enlace en vivo y "Medir aquí".
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatFixed } from '../../core/formatC';
import type { Reading } from '../../core/sessionModels';
import { headingIsValid } from '../../core/sessionModels';
import type { Repeater } from '../../core/repeater';
import { isLinkError, linkErrorMessage } from '../../link/lineTransport';
import { isOperational } from '../../link/pingerLink';
import { MeasureError } from '../../session/sessionRecorder';
import { headingOf } from '../../state/locationStore';
import { useLink, useLocation, useRecorder, useServices } from '../../state/providers';
import { ProminentButton, TextButton } from '../../ui/ios/Buttons';
import { Label, Txt } from '../../ui/ios/Txt';
import { LinkCard } from './LinkCard';
import { PingerPickerScreen } from '../PingerPickerScreen';
import { SessionSheet } from '../SessionSheet';

const messageFor = (e: MeasureError): string | undefined => {
  switch (e.reason) {
    case 'notReady': return 'El pinger no está conectado.';
    case 'noHash': return 'Falta el prefijo hash del repetidor.';
    case 'needsCalibration': return 'Calibra la brújula y vuelve a intentar.';
    case 'noLocation': return 'Aún no hay ubicación GPS.';
    case 'measuring': return undefined;
  }
};

export function PingerSection({ repeater, bearing }: { repeater: Repeater; bearing: number | undefined }) {
  const { link, recorder, location, haptics } = useServices();
  const operational = useLink((s) => isOperational(s));
  const heading = useLocation((s) => headingOf(s));
  const accuracy = useLocation((s) => s.headingAccuracy);
  const measuring = useRecorder((s) => s.measuring);
  const done = useRecorder((s) => s.done);
  const total = useRecorder((s) => s.total);
  const current = useRecorder((s) => s.current);
  const [showPicker, setShowPicker] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [lastReading, setLastReading] = useState<Reading | undefined>();
  const [problem, setProblem] = useState<string | undefined>();

  useEffect(() => {
    link.simInputs.heading = heading;
  }, [heading, link]);
  useEffect(() => {
    link.simInputs.target = bearing;
  }, [bearing, link]);
  const hash = repeater.hashPrefix;
  const [firstHash] = useState(hash);
  useEffect(() => {
    // Reconfigura el hash al cambiar el repetidor (no en el primer render, como `onChange` sin `initial`).
    if (hash === firstHash && !link.isOperational) return;
    if (link.isOperational && hash !== undefined) void link.configure(hash).catch(() => undefined);
  }, [hash]);

  const canMeasure = operational && !measuring && hash !== undefined && heading !== undefined;
  const calibrationValid = headingIsValid(accuracy);

  const measure = () => {
    setProblem(undefined);
    void (async () => {
      try {
        const reading = await recorder.measureHere(link, location, repeater);
        setLastReading(reading);
        haptics.notify(reading.needsRepeat ? 'warning' : 'success');
      } catch (e) {
        if (e instanceof MeasureError) setProblem(messageFor(e));
        else setProblem(isLinkError(e) ? linkErrorMessage(e) : `No se pudo medir: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  };

  return (
    <View style={{ gap: 12 }}>
      <LinkCard onConnect={() => setShowPicker(true)} />
      {hash === undefined ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Label icon="info.circle" variant="footnote" color="secondaryLabel">{`Añade el prefijo hash de «${repeater.name}» (editar repetidor) para medir el enlace.`}</Label>
        </View>
      ) : null}
      {operational ? (
        <View style={{ gap: 8, alignItems: 'center', paddingHorizontal: 16 }}>
          <ProminentButton
            title={measuring ? `Midiendo ${done}/${total}…` : 'Medir aquí'}
            icon={measuring ? 'waveform' : 'scope'}
            disabled={!canMeasure}
            onPress={measure}
          />
          {!calibrationValid ? (
            <Label icon="location.north.line" variant="footnote" color="target">{`Calibra la brújula antes de medir (precisión ${accuracy < 0 ? 'sin calibrar' : `±${formatFixed(accuracy, 0)}°`}).`}</Label>
          ) : null}
          {problem ? <Txt variant="footnote" color="red" style={{ textAlign: 'center' }}>{problem}</Txt> : null}
          {lastReading ? <ReadingSummary r={lastReading} /> : null}
          <TextButton variant="footnote" icon="list.bullet.rectangle" title={`Sesión · ${current?.readings.length ?? 0} lecturas`} onPress={() => setShowSessions(true)} />
        </View>
      ) : null}
      <PingerPickerScreen
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onPick={(device) => void link.connect(device, repeater.hashPrefix)}
      />
      <SessionSheet visible={showSessions} onClose={() => setShowSessions(false)} repeater={repeater} />
    </View>
  );
}

function ReadingSummary({ r }: { r: Reading }) {
  const parts = [
    r.meanDelta !== undefined ? `Δ ${formatFixed(r.meanDelta, 1, true)}°` : undefined,
    r.medSnrUp !== undefined ? `SNR↑ ${formatFixed(r.medSnrUp, 2, true)} dB` : undefined,
    r.lossPct !== undefined ? `pérdida ${r.lossPct} %` : undefined,
  ].filter((x): x is string => x !== undefined);
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Txt variant="caption" color="secondaryLabel">{`Lectura ${r.index}`}</Txt>
      <Txt variant="callout" bold tabular>{parts.join(' · ')}</Txt>
      {r.needsRepeat ? <Label icon="arrow.counterclockwise" variant="footnote" color="target">{`Repetir: solo ${r.stableCount} muestras estables (mantén el teléfono quieto)`}</Label> : null}
    </View>
  );
}
