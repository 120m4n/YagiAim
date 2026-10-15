// SessionView.swift (SessionView) — lecturas de una sesión y exportación a CSV.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatFixed } from '../core/formatC';
import type { Reading, Session } from '../core/sessionModels';
import { csvFileName, makeCsv } from '../core/sessionCsv';
import { writeCacheFile } from '../platform/files';
import { MIME_CSV, shareFile } from '../platform/share';
import { Icon } from '../ui/icons/Icon';
import { GroupedList, Row, Section } from '../ui/ios/Lists';
import { Label, Txt } from '../ui/ios/Txt';
import { Theme } from '../ui/theme';

const line1 = (r: Reading): string =>
  [r.meanDelta !== undefined ? `Δ ${formatFixed(r.meanDelta, 1, true)}°` : 'Δ —', r.medSnrUp !== undefined ? `SNR↑ ${formatFixed(r.medSnrUp, 2, true)}` : 'SNR↑ —'].join('   ');

const line2 = (r: Reading): string =>
  [r.medSnrDn !== undefined ? `SNR↓ ${formatFixed(r.medSnrDn, 2, true)}` : 'SNR↓ —', r.lossPct !== undefined ? `pérdida ${r.lossPct} %` : 'pérdida —', `${r.stableCount} estables`].join(' · ');

export function SessionView({ session }: { session: Session }) {
  const [csvUri, setCsvUri] = useState<string | undefined>();
  // `.task { csvURL = writeCSV() }`
  useEffect(() => {
    try {
      setCsvUri(writeCacheFile(csvFileName(session), makeCsv(session)));
    } catch {
      setCsvUri(undefined);
    }
  }, [session]);
  return (
    <GroupedList>
      <Section header="Lecturas" footer="Δ = rumbo del teléfono respecto al azimut (positivo: falta girar a la derecha). ↺ = repetir: menos de 3 muestras estables.">
        {session.readings.map((r) => (
          <Row key={r.id} trailing={r.needsRepeat ? <Icon name="arrow.counterclockwise" size={18} color={Theme.target} /> : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt bold style={{ width: 34 }}>{`#${r.index}`}</Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="callout" tabular>{line1(r)}</Txt>
                <Txt variant="caption" color="secondaryLabel" tabular>{line2(r)}</Txt>
              </View>
            </View>
          </Row>
        ))}
      </Section>
      {csvUri ? (
        <Section>
          <Row onPress={() => void shareFile(csvUri, MIME_CSV)}><Label icon="square.and.arrow.up" color="accent">Exportar CSV</Label></Row>
        </Section>
      ) : null}
    </GroupedList>
  );
}
