// MeshAzimuthApp.swift — raíz de la app: servicios únicos, tinte global (Theme.accent) y estado de las barras del sistema (PM-19).
import { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureMapEngine } from './src/platform/mapCache';
import { MapScreen } from './src/screens/MapScreen';
import { createServices, ServicesProvider } from './src/state/providers';

configureMapEngine();

export default function App() {
  const services = useMemo(() => createServices(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ServicesProvider services={services}>
          {/* Barra de estado transparente con íconos claros sobre navy; el modo claro del sistema no la cambia (barra forzada a oscuro) */}
          <StatusBar style="light" />
          <MapScreen />
        </ServicesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
