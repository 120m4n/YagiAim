// FR-051: requisitos equivalentes a UIRequiredDeviceCapabilities de iOS (brújula, ubicación, GPS) como obligatorios.
// El Bluetooth LE se declara NO requerido: en iOS tampoco figura en esa lista.
const { withAndroidManifest } = require('@expo/config-plugins');

const FEATURES = [
  ['android.hardware.sensor.compass', 'true'],
  ['android.hardware.location', 'true'],
  ['android.hardware.location.gps', 'true'],
  ['android.hardware.bluetooth_le', 'false'],
];

module.exports = function withHardwareFeatures(config) {
  return withAndroidManifest(config, (c) => {
    const m = c.modResults.manifest;
    const list = (m['uses-feature'] = (m['uses-feature'] ?? []).filter(
      (f) => !FEATURES.some(([name]) => name === f.$['android:name']),
    ));
    for (const [name, required] of FEATURES) list.push({ $: { 'android:name': name, 'android:required': required } });
    return c;
  });
};
