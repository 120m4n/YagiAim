const { AndroidConfig, withAndroidStyles } = require('@expo/config-plugins');

// Android 15 dibuja de borde a borde y pone un velo blanco detrás de la barra de 3 botones; la app ya deja sitio con
// insets.bottom, así que se quita el velo para que el fondo (mapa, hoja) llegue hasta abajo, como en iOS.
module.exports = function withTransparentNavBar(config) {
  return withAndroidStyles(config, (c) => {
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:enforceNavigationBarContrast',
      value: 'false',
      targetApi: '29',
    });
    return c;
  });
};
