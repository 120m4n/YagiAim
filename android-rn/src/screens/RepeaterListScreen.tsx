// RepeaterViews.swift (RepeaterList) — lista de repetidores con búsqueda, orden, importar/exportar JSON.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatFixed } from '../core/formatC';
import { cardinal, bearing, distance } from '../core/geo';
import { encodeRepeatersPretty, decodeRepeaters } from '../core/swiftJson';
import { repeaterCoordinate, type Repeater } from '../core/repeater';
import { localizedCaseInsensitiveCompare, localizedCaseInsensitiveContains } from '../core/textMatch';
import { randomUuid } from '../core/uuid';
import { pickJsonText } from '../platform/documentPicker';
import { writeCacheFile } from '../platform/files';
import { Keys } from '../platform/kv';
import { resolveLocaleTag } from '../platform/locale';
import { MIME_JSON, shareFile } from '../platform/share';
import { useLocation, useRepeaters, useServices } from '../state/providers';
import { useColors } from '../ui/colors';
import { Icon } from '../ui/icons/Icon';
import { ContentUnavailable, GroupedList, Row, SearchBar, Section, SwipeRow } from '../ui/ios/Lists';
import { NavBar, NavIconGroup, NavTextButton } from '../ui/ios/NavBar';
import { Alert, Menu, Sheet } from '../ui/ios/Presentation';
import { Txt } from '../ui/ios/Txt';
import { Theme } from '../ui/theme';
import { RepeaterEditorScreen } from './RepeaterEditorScreen';

export const EXPORT_NAME = 'MeshAzimuth-repetidores.json';

/** «306.7 km · az 62.8° ENE», o las coordenadas si aún no hay ubicación. */
export function repeaterDetail(r: Repeater, me: { latitude: number; longitude: number } | undefined): string {
  if (!me) return `${formatFixed(r.latitude, 6)}, ${formatFixed(r.longitude, 6)}`;
  const c = repeaterCoordinate(r);
  const d = distance(me, c);
  const b = bearing(me, c);
  const dist = d >= 1000 ? `${formatFixed(d / 1000, 1)} km` : `${formatFixed(d, 0)} m`;
  return `${dist} · az ${formatFixed(b, 1)}° ${cardinal(b)}`;
}

export function RepeaterListScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { repeaters: store, kv } = useServices();
  const p = useColors();
  const repeaters = useRepeaters((s) => s.repeaters);
  const selectedID = useRepeaters((s) => s.selectedID);
  const me = useLocation((s) => s.location);
  const [query, setQuery] = useState('');
  const [sortByDistance, setSortByDistance] = useState(() => kv.getBool(Keys.listSortByDistance, true));
  const [editing, setEditing] = useState<{ repeater: Repeater; isNew: boolean } | undefined>();
  const [exportUri, setExportUri] = useState<string | undefined>();
  const [importMessage, setImportMessage] = useState<string | undefined>();
  const locale = resolveLocaleTag();

  const rows = useMemo(() => {
    let list = repeaters;
    if (query !== '') list = list.filter((r) => localizedCaseInsensitiveContains(r.name, query, locale));
    if (sortByDistance && me) return [...list].sort((a, b) => distance(me, repeaterCoordinate(a)) - distance(me, repeaterCoordinate(b)));
    return [...list].sort((a, b) => localizedCaseInsensitiveCompare(a.name, b.name, locale));
  }, [repeaters, query, sortByDistance, me, locale]);

  // Se reescribe en cada cambio de la lista mientras está abierta (`onChange(initial: true)`).
  useEffect(() => {
    if (!visible) return;
    try {
      setExportUri(writeCacheFile(EXPORT_NAME, encodeRepeatersPretty(repeaters)));
    } catch {
      setExportUri(undefined);
    }
  }, [visible, repeaters]);

  const setSort = (v: boolean) => {
    setSortByDistance(v);
    kv.setBool(Keys.listSortByDistance, v);
  };

  const importFile = async (): Promise<string | undefined> => {
    let text: string | undefined;
    try {
      text = await pickJsonText();
    } catch {
      return 'No se pudo abrir el archivo.';
    }
    if (text === undefined) return undefined; // el usuario canceló
    const list = decodeRepeaters(text);
    if (!list) return 'El archivo no tiene el formato esperado (lista JSON de repetidores).';
    const r = store.merge(list);
    return `Importados ${r.added}. Omitidos ${r.skipped} (duplicados o inválidos).`;
  };

  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        header={
          <NavBar
            title="Repetidores"
            withInset={false}
            left={
              <Menu
                items={[
                  { label: 'Por cercanía', icon: 'location', checked: sortByDistance, onPress: () => setSort(true) },
                  { label: 'Por nombre', icon: 'textformat', checked: !sortByDistance, onPress: () => setSort(false) },
                  { label: 'Importar JSON…', icon: 'square.and.arrow.down', separatorBefore: true, onPress: () => void importFile().then((m) => m && setImportMessage(m)) },
                  ...(exportUri && repeaters.length > 0 ? [{ label: 'Exportar JSON', icon: 'square.and.arrow.up', onPress: () => void shareFile(exportUri, MIME_JSON) }] : []),
                ]}
              >
                {(open, ref) => (
                  <View ref={ref} collapsable={false}>
                    <NavIconGroup
                      items={[
                        { icon: 'plus', label: 'Nuevo repetidor', onPress: () => setEditing({ repeater: { id: randomUuid(), name: 'Nuevo', latitude: 0, longitude: 0 }, isNew: true }) },
                        { icon: 'ellipsis.circle', label: 'Más opciones', onPress: open },
                      ]}
                    />
                  </View>
                )}
              </Menu>
            }
            right={<NavTextButton title="Cerrar" onPress={onClose} />}
          />
        }
      >
        <View style={{ flex: 1 }}>
          <SearchBar value={query} onChangeText={setQuery} prompt="Buscar repetidor" />
          {repeaters.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ContentUnavailable icon="antenna.radiowaves.left.and.right" title="Sin repetidores" description="Toca el mapa para agregar uno o importa un archivo." />
            </View>
          ) : (
            <GroupedList>
              <Section plain>
                <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: p.cell }}>
                  {rows.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 ? <View style={{ height: 1, backgroundColor: p.separator, marginLeft: 16 }} /> : null}
                      <SwipeRow
                        leading={{ label: 'Editar', icon: 'pencil', color: Theme.accent, onPress: () => setEditing({ repeater: r, isNew: false }) }}
                        trailing={{ label: 'Borrar', icon: 'trash', color: p.red, onPress: () => store.delete(r) }}
                      >
                        <Pressable
                          onPress={() => {
                            store.selectedID = r.id;
                            onClose();
                          }}
                          accessibilityRole="button"
                        >
                          <Row trailing={r.id === selectedID ? <Icon name="checkmark" size={18} color={Theme.target} weight={2.4} /> : undefined}>
                            <Txt variant="headline">{r.name}</Txt>
                            <Txt variant="caption" color="secondaryLabel" tabular>{repeaterDetail(r, me)}</Txt>
                          </Row>
                        </Pressable>
                      </SwipeRow>
                    </View>
                  ))}
                </View>
              </Section>
            </GroupedList>
          )}
        </View>
      </Sheet>
      {editing ? <RepeaterEditorScreen visible repeater={editing.repeater} isNew={editing.isNew} onClose={() => setEditing(undefined)} /> : null}
      <Alert visible={importMessage !== undefined} title="Importación" message={importMessage ?? ''} onClose={() => setImportMessage(undefined)} />
    </>
  );
}
