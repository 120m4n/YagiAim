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
 * - Pitch: de la misma matriz de rotación (vector de rotación o, sin giroscopio, acelerómetro + magnetómetro), `-orientation[1]` en grados (positivo = el frente sube), a 10 Hz (PM-07).
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
  private var stopHeadingSensors: (() -> Unit)? = null
  private var stopPitchSensors: (() -> Unit)? = null

  @Volatile private var systemLocation: Location? = null
  private var refreshing = false
  @Volatile private var fopEmitted = false
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
      sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null ||
        (sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null && sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null)
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
        fopEmitted = true
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
      fopEmitted = false
      // Un teléfono sin giroscopio puede aceptar el registro y no emitir nunca: sin datos en 2 s se usa el respaldo.
      main.postDelayed({
        if (!fopEmitted && fopListener === listener && stopHeadingSensors == null) startRotationVectorHeading()
      }, FOP_SILENCE_MS)
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun startRotationVectorHeading() {
    if (stopHeadingSensors != null) return
    val orientation = FloatArray(3)
    stopHeadingSensors = registerOrientation(HEADING_PERIOD_US) { rotation, accuracyDeg ->
      SensorManager.getOrientation(rotation, orientation)
      var az = Math.toDegrees(orientation[0].toDouble())
      val loc = systemLocation
      if (loc != null) {
        az += GeomagneticField(loc.latitude.toFloat(), loc.longitude.toFloat(), loc.altitude.toFloat(), System.currentTimeMillis()).declination
      }
      emitHeading(normalize(az), accuracyDeg)
    }
  }

  /**
   * Fuente de orientación como matriz de rotación. Orden de preferencia:
   * 1. TYPE_ROTATION_VECTOR (precisión = values[4], en radianes según la documentación; -1 si no existe);
   * 2. respaldo para teléfonos sin giroscopio ni vector de rotación: acelerómetro + magnetómetro con
   *    `getRotationMatrix` y filtro paso bajo. Sin dato de precisión en grados, se aproxima con el estado de
   *    calibración del magnetómetro (ALTA 5°, MEDIA 15°, BAJA 30°, no fiable -1): es una estimación, no una medida.
   * Devuelve la función que da de baja los sensores, o null si el teléfono no tiene sensores suficientes.
   */
  private fun registerOrientation(periodUs: Int, onMatrix: (FloatArray, Double) -> Unit): (() -> Unit)? {
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val rotation = FloatArray(9)
    val rv = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    if (rv != null) {
      val l = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
          SensorManager.getRotationMatrixFromVector(rotation, e.values)
          val acc = if (e.values.size >= 5 && e.values[4] >= 0f) Math.toDegrees(e.values[4].toDouble()) else -1.0
          onMatrix(rotation, acc)
        }
        override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
      }
      sm.registerListener(l, rv, periodUs)
      return { sm.unregisterListener(l) }
    }
    val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return null
    val mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) ?: return null
    val gravity = FloatArray(3)
    val field = FloatArray(3)
    var haveG = false
    var haveM = false
    var magStatus = SensorManager.SENSOR_STATUS_UNRELIABLE
    val l = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        val target = if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) gravity else field
        val have = if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) haveG else haveM
        for (i in 0..2) target[i] = if (have) target[i] + LOW_PASS * (e.values[i] - target[i]) else e.values[i]
        if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) haveG = true else haveM = true
        if (e.sensor.type != Sensor.TYPE_MAGNETIC_FIELD || !haveG) return
        if (!SensorManager.getRotationMatrix(rotation, null, gravity, field)) return
        val acc = when (magStatus) {
          SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> 5.0
          SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> 15.0
          SensorManager.SENSOR_STATUS_ACCURACY_LOW -> 30.0
          else -> -1.0
        }
        onMatrix(rotation, acc)
      }
      override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {
        if (s?.type == Sensor.TYPE_MAGNETIC_FIELD) magStatus = accuracy
      }
    }
    sm.registerListener(l, accel, periodUs)
    sm.registerListener(l, mag, periodUs)
    return { sm.unregisterListener(l) }
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
    stopHeadingSensors?.invoke()
    stopHeadingSensors = null
  }

  // MARK: - Inclinación

  private fun startPitch(intervalMs: Double) {
    if (stopPitchSensors != null) return
    val orientation = FloatArray(3)
    var lastEmit = 0L
    stopPitchSensors = registerOrientation(SensorManager.SENSOR_DELAY_GAME) { rotation, _ ->
      val now = System.nanoTime() / 1_000_000
      if (now - lastEmit >= intervalMs) {
        lastEmit = now
        SensorManager.getOrientation(rotation, orientation)
        // En Android levantar el borde superior da pitch negativo; en iOS es positivo (PM-07).
        sendEvent("onPitch", mapOf("pitch" to -Math.toDegrees(orientation[1].toDouble())))
      }
    }
  }

  private fun stopPitch() {
    stopPitchSensors?.invoke()
    stopPitchSensors = null
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
    private const val FOP_SILENCE_MS = 2_000L
    private const val LOW_PASS = 0.2f // respaldo acelerómetro + magnetómetro
  }
}
