// RepeaterViews.swift (RepeaterList) — lista de repetidores con búsqueda, orden, importar/exportar JSON.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatFixed } from '../core/formatC';
import { cardinal, bearing, distance } from '../core/geo';
import { encodeRepeatersPretty, parseRepeaters } from '../core/swiftJson';
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
import { Alert, Menu, PromptDialog, Sheet } from '../ui/ios/Presentation';
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
  const [importResult, setImportResult] = useState<{ title: string; message: string } | undefined>();
  const [urlPrompt, setUrlPrompt] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [downloading, setDownloading] = useState(false);
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

  /** Valida el texto, fusiona y avisa en un modal: error con su motivo, o resumen de la importación. */
  const importText = (text: string) => {
    const parsed = parseRepeaters(text);
    if ('error' in parsed) {
      setImportResult({ title: 'Error al importar', message: parsed.error });
      return;
    }
    const r = store.merge(parsed.list);
    setImportResult({
      title: r.added > 0 ? 'Importación exitosa' : 'Nada que importar',
      message: `Importados ${r.added} de ${parsed.list.length}.${r.skipped > 0 ? ` Omitidos ${r.skipped} (duplicados o inválidos).` : ''}`,
    });
  };

  const importFile = async () => {
    let text: string | undefined;
    try {
      text = await pickJsonText();
    } catch (e) {
      setImportResult({ title: 'Error al importar', message: `No se pudo abrir el archivo (${e instanceof Error ? e.message : 'error desconocido'}).` });
      return;
    }
    if (text !== undefined) importText(text); // undefined: el usuario canceló
  };

  const importUrl = async () => {
    const url = urlText.trim();
    if (downloading) return; // Enter + botón, o doble toque
    if (!/^https:\/\//i.test(url)) {
      setUrlPrompt(false);
      setImportResult({ title: 'Error al importar', message: 'La URL debe empezar con https://' });
      return;
    }
    setDownloading(true); // el diálogo sigue abierto mostrando «Descargando…» hasta tener respuesta
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      importText(await res.text());
    } catch (e) {
      setImportResult({ title: 'Error al importar', message: `No se pudo descargar el archivo (${e instanceof Error && e.name === 'AbortError' ? 'tiempo agotado' : e instanceof Error ? e.message : 'error desconocido'}).` });
    } finally {
      clearTimeout(timer);
      setDownloading(false);
      setUrlPrompt(false);
    }
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
                  { label: 'Importar JSON…', icon: 'square.and.arrow.down', separatorBefore: true, onPress: () => void importFile() },
                  { label: 'Importar desde URL…', icon: 'globe.americas', onPress: () => setUrlPrompt(true) },
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
      <PromptDialog
        visible={urlPrompt}
        title="Importar desde URL"
        message="Dirección https de un JSON de repetidores."
        value={urlText}
        onChangeText={setUrlText}
        placeholder="https://…/repetidores.json"
        actionLabel={downloading ? 'Descargando…' : 'Importar'}
        onSubmit={() => void importUrl()}
        onCancel={() => !downloading && setUrlPrompt(false)}
      />
      <Alert visible={importResult !== undefined} title={importResult?.title ?? ''} message={importResult?.message ?? ''} onClose={() => setImportResult(undefined)} />
    </>
  );
}
