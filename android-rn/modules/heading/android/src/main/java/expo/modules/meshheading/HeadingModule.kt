package expo.modules.meshheading

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Handler
import android.os.Looper
import com.google.android.gms.location.DeviceOrientation
import com.google.android.gms.location.DeviceOrientationListener
import com.google.android.gms.location.DeviceOrientationRequest
import com.google.android.gms.location.FusedOrientationProviderClient
import com.google.android.gms.location.LocationServices
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Rumbo e inclinación del teléfono (PM-05, PM-06, PM-07).
 *
 * - Rumbo: Fused Orientation Provider (FOP); si no está disponible (sin giroscopio o sin Play Services), vector de rotación
 *   + GeomagneticField, con la precisión de values[4] o -1 si no existe (C-5).
 * - `usingMagnetic` = el sistema no tiene ningún fix de ubicación (PM-05, resolución 0/1). La ubicación que guarda la app
 *   (`location.last`) no cuenta, porque Core Location tampoco la conoce.
 * - Solo se emite cuando el azimut cambia >= 0.5° (equivale a `headingFilter` de iOS, PM-05 resolución 3).
 * - Pitch: del vector de rotación, `-orientation[1]` en grados (positivo = el frente sube), a 10 Hz (PM-07).
 *
 * Pendiente de campo (research R-3/R-4, tasks T081/T084): unidades de `headingErrorDegrees` y tasa de muestreo del
 * rumbo; ver specs/004-react-native-android/bench-log.md.
 */
class HeadingModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Sin contexto de React")

  private val main = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()

  private var fopClient: FusedOrientationProviderClient? = null
  private var fopListener: DeviceOrientationListener? = null
  private var headingSensorListener: SensorEventListener? = null
  private var pitchSensorListener: SensorEventListener? = null

  @Volatile private var systemLocation: Location? = null
  private var refreshing = false
  private var lastAzimuth: Double? = null
  private var lastAccuracy: Double? = null
  private var lastMagnetic: Boolean? = null

  private val refreshFix = object : Runnable {
    override fun run() {
      if (!refreshing) return
      try {
        LocationServices.getFusedLocationProviderClient(context).lastLocation
          .addOnSuccessListener { if (it != null) systemLocation = it }
      } catch (_: SecurityException) {
        // sin permiso de ubicación: se sigue en magnético
      }
      main.postDelayed(this, FIX_REFRESH_MS)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MeshHeading")
    Events("onHeading", "onPitch")

    Function("isAvailable") {
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null
    }

    Function("startHeading") {
      startFixRefresh()
      lastAzimuth = null
      if (!startFop()) startRotationVectorHeading()
    }

    Function("stopHeading") {
      stopHeading()
    }

    Function("startPitch") { intervalMs: Double ->
      startPitch(intervalMs)
    }

    Function("stopPitch") {
      stopPitch()
    }

    OnDestroy {
      stopHeading()
      stopPitch()
    }
  }

  // MARK: - Fix del sistema

  private fun startFixRefresh() {
    if (refreshing) return
    refreshing = true
    main.post(refreshFix)
  }

  // MARK: - Rumbo

  private fun startFop(): Boolean {
    if (fopListener != null) return true
    return try {
      val client = LocationServices.getFusedOrientationProviderClient(context)
      val listener = DeviceOrientationListener { o: DeviceOrientation ->
        emitHeading(o.headingDegrees.toDouble(), o.headingErrorDegrees.toDouble())
      }
      val request = DeviceOrientationRequest.Builder(DeviceOrientationRequest.OUTPUT_PERIOD_DEFAULT).build()
      client.requestOrientationUpdates(request, executor, listener)
        .addOnFailureListener {
          // sin FOP: respaldo con el vector de rotación
          fopListener = null
          fopClient = null
          startRotationVectorHeading()
        }
      fopClient = client
      fopListener = listener
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun startRotationVectorHeading() {
    if (headingSensorListener != null) return
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: return
    val rotation = FloatArray(9)
    val orientation = FloatArray(3)
    val listener = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rotation, e.values)
        SensorManager.getOrientation(rotation, orientation)
        var az = Math.toDegrees(orientation[0].toDouble())
        val loc = systemLocation
        if (loc != null) {
          az += GeomagneticField(loc.latitude.toFloat(), loc.longitude.toFloat(), loc.altitude.toFloat(), System.currentTimeMillis()).declination
        }
        // values[4]: precisión estimada del rumbo (radianes según la documentación de Android; -1 si no existe)
        val acc = if (e.values.size >= 5 && e.values[4] >= 0f) Math.toDegrees(e.values[4].toDouble()) else -1.0
        emitHeading(normalize(az), acc)
      }

      override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
    }
    sm.registerListener(listener, sensor, HEADING_PERIOD_US)
    headingSensorListener = listener
  }

  private fun emitHeading(azimuth: Double, accuracy: Double) {
    val magnetic = systemLocation == null
    val az = normalize(azimuth)
    val prev = lastAzimuth
    val moved = prev == null || angularDistance(az, prev) >= HEADING_FILTER_DEG
    if (!moved && lastAccuracy == accuracy && lastMagnetic == magnetic) return
    lastAzimuth = az
    lastAccuracy = accuracy
    lastMagnetic = magnetic
    sendEvent("onHeading", mapOf("azimuth" to az, "usingMagnetic" to magnetic, "accuracy" to accuracy))
  }

  private fun stopHeading() {
    refreshing = false
    main.removeCallbacks(refreshFix)
    fopListener?.let { fopClient?.removeOrientationUpdates(it) }
    fopListener = null
    fopClient = null
    headingSensorListener?.let { (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(it) }
    headingSensorListener = null
  }

  // MARK: - Inclinación

  private fun startPitch(intervalMs: Double) {
    if (pitchSensorListener != null) return
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: return
    val rotation = FloatArray(9)
    val orientation = FloatArray(3)
    var lastEmit = 0L
    val listener = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        val now = System.nanoTime() / 1_000_000
        if (now - lastEmit < intervalMs) return
        lastEmit = now
        SensorManager.getRotationMatrixFromVector(rotation, e.values)
        SensorManager.getOrientation(rotation, orientation)
        // En Android levantar el borde superior da pitch negativo; en iOS es positivo (PM-07).
        sendEvent("onPitch", mapOf("pitch" to -Math.toDegrees(orientation[1].toDouble())))
      }

      override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
    }
    sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
    pitchSensorListener = listener
  }

  private fun stopPitch() {
    pitchSensorListener?.let { (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(it) }
    pitchSensorListener = null
  }

  private fun normalize(d: Double): Double {
    val r = d % 360.0
    val n = if (r < 0) r + 360.0 else r
    return if (n >= 360.0) 0.0 else n
  }

  private fun angularDistance(a: Double, b: Double): Double {
    val d = abs(a - b) % 360.0
    return if (d > 180.0) 360.0 - d else d
  }

  companion object {
    private const val FIX_REFRESH_MS = 5_000L
    private const val HEADING_FILTER_DEG = 0.5
    private const val HEADING_PERIOD_US = 50_000 // 20 Hz; se ajusta con R-3
  }
}
