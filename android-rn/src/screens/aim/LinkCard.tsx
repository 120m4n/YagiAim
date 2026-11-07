// LinkCard.swift — estado del enlace con el pinger y la calidad del último ping, con una sparkline del SNR de subida.
import { View } from 'react-native';
import { formatFixed } from '../../core/formatC';
import type { PingStatus } from '../../core/lineCodec';
import { roundHalfAwayFromZero } from '../../core/round';
import { linkErrorMessage, opensSettings, stateFailure } from '../../link/lineTransport';
import { openSettingsFor } from '../../platform/settings';
import { useLink, useServices } from '../../state/providers';
import { isOperational } from '../../link/pingerLink';
import { useColors } from '../../ui/colors';
import { BorderedButton, ProminentButton } from '../../ui/ios/Buttons';
import { ActivityIndicator, Switch } from '../../ui/ios/Controls';
import { Material } from '../../ui/ios/Material';
import { Label, Txt } from '../../ui/ios/Txt';
import { TextButton } from '../../ui/ios/Buttons';
import { Sparkline } from './Sparkline';

const statusText = (s: PingStatus): string => (s === 'ok' ? '' : s === 'timeout' ? 'sin respuesta' : s === 'busy' ? 'canal ocupado' : 'error de TX');

/** Solo los avisos que el usuario puede necesitar ver. */
export function visibleWarning(w: string | undefined): string | undefined {
  if (w === undefined) return undefined;
  if (w.startsWith('duty_wait')) return 'El pinger retrasó un envío por su límite de TX';
  if (w.startsWith('hash_collision')) return 'Dos repetidores responden con el mismo hash';
  return undefined;
}

/** Pérdida sobre los últimos 30 pings respondidos (timeout / (ok + timeout)). */
export function lossText(history: readonly { status: PingStatus }[]): string | undefined {
  const answered = history.filter((r) => r.status === 'ok' || r.status === 'timeout');
  if (answered.length === 0) return undefined;
  const lost = answered.filter((r) => r.status === 'timeout').length;
  return `${roundHalfAwayFromZero((100 * lost) / answered.length)} %`;
}

function Metric({ title, value }: { title: string; value: string | undefined }) {
  return (
    <View style={{ minWidth: 130 }}>
      <Txt variant="caption" color="secondaryLabel">{title}</Txt>
      <Txt tabular bold>{value ?? '—'}</Txt>
    </View>
  );
}

export function LinkCard({ onConnect }: { onConnect: () => void }) {
  const { link } = useServices();
  const p = useColors();
  const state = useLink((s) => s.state);
  const operational = useLink((s) => isOperational(s));
  const hash = useLink((s) => s.hash);
  const device = useLink((s) => s.device);
  const last = useLink((s) => s.last);
  const history = useLink((s) => s.history);
  const live = useLink((s) => s.live);
  const warning = visibleWarning(useLink((s) => s.lastWarning));
  const failure = stateFailure(state);

  const spark = history.flatMap((r) => (r.snrUp === undefined ? [] : [r.snrUp]));

  return (
    <Material radius={14} style={{ marginHorizontal: 16, padding: 14, gap: 10, alignSelf: 'stretch' }}>
      {operational ? (
        <>
          <Label icon="checkmark.circle.fill" variant="headline" color="green">{`Conectado · ${hash ?? 'sin hash'}`}</Label>
          {device ? <Txt variant="caption" color="secondaryLabel">{device.name + (device.fw !== undefined ? ` · fw ${device.fw}` : '')}</Txt> : null}
          <TextButton title="Desconectar" destructive variant="footnote" onPress={() => link.disconnect()} />
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <Metric title="SNR ↑" value={last?.snrUp !== undefined ? `${formatFixed(last.snrUp, 2, true)} dB` : undefined} />
              <Metric title="SNR ↓" value={last?.snrDn !== undefined ? `${formatFixed(last.snrDn, 2, true)} dB` : undefined} />
            </View>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <Metric title="RSSI ↓" value={last?.rssiDn !== undefined ? `${formatFixed(last.rssiDn, 1)} dBm` : undefined} />
              <Metric title="RTT" value={last?.rttMs !== undefined ? `${last.rttMs} ms` : undefined} />
            </View>
            <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
              <Metric title="Pérdida" value={lossText(history)} />
              <View style={{ minWidth: 130 }}>{last && last.status !== 'ok' ? <Txt variant="footnote" color="target">{statusText(last.status)}</Txt> : null}</View>
            </View>
          </View>
          <Sparkline values={spark} color={p.accent} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Txt variant="subheadline" bold>En vivo</Txt>
              <Txt variant="caption" color="secondaryLabel">1 ping cada 2 s</Txt>
            </View>
            <Switch value={live} accessibilityLabel="En vivo" onValueChange={(v) => (v ? link.startLive() : link.stopLive())} />
          </View>
          {warning ? <Label icon="exclamationmark.triangle" variant="caption" color="target">{warning}</Label> : null}
        </>
      ) : failure ? (
        <>
          <Label icon="exclamationmark.triangle.fill" color="target">{linkErrorMessage(failure)}</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <BorderedButton title="Reintentar" size="small" onPress={onConnect} />
            {opensSettings(failure) ? <BorderedButton title="Abrir Ajustes" size="small" onPress={() => void openSettingsFor(failure)} /> : null}
          </View>
        </>
      ) : state.kind === 'connecting' || state.kind === 'scanning' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator />
          <Txt>Conectando al pinger…</Txt>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-start' }}>
          <ProminentButton title="Conectar pinger" icon="antenna.radiowaves.left.and.right" onPress={onConnect} />
        </View>
      )}
    </Material>
  );
}
