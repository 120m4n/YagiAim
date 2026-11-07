package expo.modules.meshaltitude

import android.location.Location
import androidx.core.location.altitude.AltitudeConverterCompat
import androidx.core.location.LocationCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * PM-08 — altitud sobre el nivel medio del mar. `Location.getAltitude()` de Android es la altura sobre el elipsoide WGS84;
 * iOS reporta MSL. Sin convertir, la elevación al repetidor tendría un error igual a la ondulación del geoide.
 *
 * Devuelve { msl, accuracy } (accuracy = -1 si no hay precisión vertical válida) o null si la conversión falla.
 * Las AsyncFunction de Expo corren fuera del hilo principal, como exige `@WorkerThread`.
 */
class AltitudeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MeshAltitude")

    AsyncFunction("toMsl") { latitude: Double, longitude: Double, altitude: Double, verticalAccuracy: Double ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      try {
        val loc = Location("meshazimuth").apply {
          this.latitude = latitude
          this.longitude = longitude
          this.altitude = altitude
          if (verticalAccuracy >= 0) this.verticalAccuracyMeters = verticalAccuracy.toFloat()
        }
        AltitudeConverterCompat.addMslAltitudeToLocation(context, loc)
        if (!LocationCompat.hasMslAltitude(loc)) return@AsyncFunction null
        mapOf(
          "msl" to LocationCompat.getMslAltitudeMeters(loc),
          "accuracy" to if (LocationCompat.hasMslAltitudeAccuracy(loc)) LocationCompat.getMslAltitudeAccuracyMeters(loc).toDouble() else -1.0,
        )
      } catch (_: Exception) {
        null
      }
    }
  }
}
