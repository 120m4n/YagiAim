// OnboardingView.swift — guía de 3 pantallas: primer arranque y «Ver guía» en Acerca de. Fondo navy, oscura, no descartable.
import { useRef, useState } from 'react';
import { FlatList, View, useWindowDimensions, type ViewToken } from 'react-native';
import { Icon } from '../ui/icons/Icon';
import { ProminentButton } from '../ui/ios/Buttons';
import { PageControl } from '../ui/ios/Controls';
import { Txt } from '../ui/ios/Txt';
import { Theme } from '../ui/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PAGES = [
  { icon: 'mappin.and.ellipse', title: 'Marca el repetidor', text: 'Toca el mapa donde está el repetidor MeshCore. Puedes guardar varios, con nombre y altitud opcional para calcular la elevación.' },
  { icon: 'iphone.gen3', title: 'Coloca el teléfono', text: 'Ponlo plano sobre el boom, con el borde superior hacia el director. Aléjalo de mástiles, coaxial y del imán del rotor. Si la precisión de la brújula pasa de ±15°, muévelo en forma de ocho.' },
  { icon: 'scope', title: 'Gira hasta el verde', text: 'La aguja naranja apunta al repetidor. Al alinearte se pone verde y vibra 3 segundos. Para el ajuste fino, conecta el pinger LoRa y mira el SNR en vivo.' },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList>(null);
  const last = page === PAGES.length - 1;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (i !== null && i !== undefined) setPage(i);
  });
  return (
    <View style={{ flex: 1, backgroundColor: Theme.navy, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <FlatList
        ref={list}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.icon}
        onViewableItemsChanged={onViewable.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <Icon name={item.icon} size={64} color={Theme.target} weight={2.4} />
            <Txt variant="title" bold color="#FFFFFF">{item.title}</Txt>
            <Txt color="rgba(255,255,255,0.85)" style={{ textAlign: 'center' }}>{item.text}</Txt>
          </View>
        )}
      />
      <PageControl count={PAGES.length} index={page} />
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <ProminentButton size="large" title={last ? 'Empezar' : 'Siguiente'} onPress={() => (last ? onDone() : list.current?.scrollToIndex({ index: page + 1, animated: true }))} />
      </View>
    </View>
  );
}
