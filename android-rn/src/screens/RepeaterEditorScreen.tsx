// RepeaterViews.swift (RepeaterEditor) — alta o edición de un repetidor.
import { useState } from 'react';
import { WHITESPACES, trimmingCharacters } from '../core/foundation';
import { normalizedHashPrefix, type Repeater } from '../core/repeater';
import { swiftDoubleDescription } from '../core/swiftDescribe';
import { parseSwiftDouble } from '../core/swiftParse';
import { useServices } from '../state/providers';
import { Field, GroupedList, Section } from '../ui/ios/Lists';
import { NavBar, NavTextButton } from '../ui/ios/NavBar';
import { Sheet } from '../ui/ios/Presentation';
import { Txt } from '../ui/ios/Txt';

const parse = (t: string): number | undefined => parseSwiftDouble(trimmingCharacters(t, WHITESPACES).split(',').join('.'));
const inRange = (v: number | undefined, max: number): number | undefined => (v !== undefined && Math.abs(v) <= max ? v : undefined);

export function RepeaterEditorScreen({ visible, repeater, isNew, onClose }: { visible: boolean; repeater: Repeater; isNew: boolean; onClose: () => void }) {
  const { repeaters: store } = useServices();
  const [name, setName] = useState(repeater.name);
  const [altitudeText, setAltitudeText] = useState(repeater.altitude === undefined ? '' : swiftDoubleDescription(repeater.altitude));
  const [latText, setLatText] = useState(swiftDoubleDescription(repeater.latitude));
  const [lonText, setLonText] = useState(swiftDoubleDescription(repeater.longitude));
  const [hashText, setHashText] = useState(repeater.hashPrefix ?? '');

  const hashValid = hashText === '' || normalizedHashPrefix(hashText) !== undefined;
  const lat = inRange(parse(latText), 90);
  const lon = inRange(parse(lonText), 180);
  const canSave = name !== '' && lat !== undefined && lon !== undefined && hashValid;

  const save = () => {
    const r: Repeater = { ...repeater, name, latitude: lat ?? repeater.latitude, longitude: lon ?? repeater.longitude };
    const alt = parseSwiftDouble(altitudeText.split(',').join('.')); // sin recortar espacios, como en Swift
    const hash = normalizedHashPrefix(hashText);
    delete r.altitude;
    delete r.hashPrefix;
    if (alt !== undefined) r.altitude = alt;
    if (hash !== undefined) r.hashPrefix = hash;
    // Se decide contra el store: si el id ya existe es edición, nunca un duplicado.
    if (store.repeaters.some((x) => x.id === r.id)) store.update(r);
    else store.add(r);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      header={<NavBar title={isNew ? 'Nuevo repetidor' : 'Editar'} withInset={false} left={<NavTextButton title="Cancelar" onPress={onClose} />} right={<NavTextButton title="Guardar" bold disabled={!canSave} onPress={save} />} />}
    >
      <GroupedList>
        <Section header="Nombre">
          <Field value={name} onChangeText={setName} placeholder="Nombre" />
        </Section>
        <Section header="Coordenadas (WGS84)">
          {/* PM-17: `numbers-and-punctuation` no existe en Android; el teclado por defecto garantiza "-", "," y "." */}
          <Field value={latText} onChangeText={setLatText} placeholder="Latitud" keyboardType="default" />
          <Field value={lonText} onChangeText={setLonText} placeholder="Longitud" keyboardType="default" />
        </Section>
        <Section header="Opcional" footer="Si la indicas, se calcula el ángulo de elevación con corrección de curvatura (k = 4/3).">
          <Field value={altitudeText} onChangeText={setAltitudeText} placeholder="Altitud antena (m s.n.m.)" keyboardType="decimal-pad" />
        </Section>
        <Section header="Pinger LoRa (opcional)" footer="Primer byte de la clave pública del repetidor (los dos primeros dígitos en la app MeshCore). El pinger lo usa para medir el enlace.">
          <Field value={hashText} onChangeText={setHashText} placeholder="Prefijo hash (2 hex)" autoCapitalize="characters" autoCorrect={false} />
          {!hashValid ? <Txt variant="footnote" color="red" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>Deben ser exactamente 2 dígitos hexadecimales (0-9, A-F).</Txt> : null}
        </Section>
      </GroupedList>
    </Sheet>
  );
}
