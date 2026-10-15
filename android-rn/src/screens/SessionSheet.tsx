// SessionView.swift (SessionSheet) — sesión actual e historial del repetidor, con la pantalla de detalle dentro de la hoja.
import { useEffect, useState } from 'react';
import { IconTap } from '../ui/ios/Buttons';
import { Chevron, GroupedList, Row, Section } from '../ui/ios/Lists';
import { NavBar, NavTextButton } from '../ui/ios/NavBar';
import { Sheet } from '../ui/ios/Presentation';
import { Txt } from '../ui/ios/Txt';
import { View } from 'react-native';
import { formatAbbreviatedShortened, resolveDateLocale } from '../core/dateStyle';
import type { Repeater } from '../core/repeater';
import type { Session } from '../core/sessionModels';
import { localTimeZone } from '../core/timeZone';
import { resolveLocaleTag } from '../platform/locale';
import { useColors } from '../ui/colors';
import { useRecorder, useServices } from '../state/providers';
import { SessionView } from './SessionView';

export const sessionDate = (d: Date): string => formatAbbreviatedShortened(d, resolveDateLocale(resolveLocaleTag()), localTimeZone);

function SessionRow({ s }: { s: Session }) {
  return (
    <View>
      <Txt>{sessionDate(s.started)}</Txt>
      <Txt variant="caption" color="secondaryLabel">{`${s.readings.length} lecturas · ${s.samples.length} muestras`}</Txt>
    </View>
  );
}

export function SessionSheet({ visible, onClose, repeater }: { visible: boolean; onClose: () => void; repeater: Repeater }) {
  const { recorder, sessions } = useServices();
  const p = useColors();
  const current = useRecorder((s) => s.current);
  const [past, setPast] = useState<Session[]>([]);
  const [detail, setDetail] = useState<Session | undefined>();

  useEffect(() => {
    if (visible) setPast(sessions.sessions(repeater.id).filter((s) => s.id !== recorder.current?.id));
    else setDetail(undefined);
  }, [visible, sessions, repeater.id, recorder]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      // PM-18: dentro de la sesión, Atrás vuelve a la lista; en la lista cierra la hoja.
      onBack={() => (detail ? setDetail(undefined) : onClose())}
      header={
        detail ? (
          <NavBar title={sessionDate(detail.started)} withInset={false} left={<IconTap icon="chevron.left" label="Atrás" color={p.accent} onPress={() => setDetail(undefined)} />} />
        ) : (
          <NavBar title={repeater.name} withInset={false} right={<NavTextButton title="Listo" bold onPress={onClose} />} />
        )
      }
    >
      {detail ? (
        <SessionView session={detail} />
      ) : (
        <GroupedList>
          {current ? (
            <Section header="Sesión actual">
              <Row onPress={() => setDetail(current)} trailing={<Chevron />}><SessionRow s={current} /></Row>
              <Row onPress={() => { recorder.startSession(); onClose(); }}><Txt color="accent">Empezar una sesión nueva</Txt></Row>
            </Section>
          ) : (
            <Section plain>
              <Txt color="secondaryLabel" style={{ paddingHorizontal: 16 }}>Aún no hay lecturas. Toca «Medir aquí» con la antena quieta.</Txt>
            </Section>
          )}
          {past.length > 0 ? (
            <Section header="Anteriores">
              {past.map((s) => (
                <Row key={s.id} onPress={() => setDetail(s)} trailing={<Chevron />}><SessionRow s={s} /></Row>
              ))}
            </Section>
          ) : null}
        </GroupedList>
      )}
    </Sheet>
  );
}
