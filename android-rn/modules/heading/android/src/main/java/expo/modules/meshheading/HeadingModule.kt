package expo.modules.meshheading

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Sensores de orientación del teléfono (PM-05, PM-06, PM-07).
 *
 * - `startSamples`: entrega a 20 Hz los valores PROMEDIADOS de acelerómetro, magnetómetro sin calibrar y calibrado por el controlador
 *   y el azimut del vector de rotación (si existe). Toda la fusión (calibración propia con el WMM, declinación, precisión) se hace
 *   en TypeScript (src/core/headingFusion.ts), donde se prueba con simulaciones. Motivo medido en el Redmi A5: el controlador
 *   resta un sesgo equivocado a un magnetómetro que lee ~230 µT por el imán del teléfono.
 * - Pitch: del vector de rotación o, sin él, de acelerómetro + magnetómetro, `-orientation[1]` (PM-07), a la cadencia pedida.
 */
class HeadingModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Sin contexto de React")

  private val main = Handler(Looper.getMainLooper())
  private var diag: DiagRecorder? = null
  private var stopSampleSensors: (() -> Unit)? = null
  private var stopPitchSensors: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("MeshHeading")
    Events("onSample", "onPitch")

    Function("isAvailable") {
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null && sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
    }

    Function("startSamples") { periodMs: Double -> startSamples(periodMs.toLong()) }
    Function("stopSamples") { stopSamples() }
    Function("startPitch") { intervalMs: Double -> startPitch(intervalMs) }
    Function("stopPitch") { stopPitch() }

    // FASE 0 (temporal): grabación de diagnóstico de todas las fuentes de orientación.
    Function("startDiagnostic") { label: String ->
      diag?.stop()
      val r = DiagRecorder(context)
      diag = r
      r.start(label, false)
    }
    Function("stopDiagnostic") {
      diag?.stop()
      diag = null
    }

    OnDestroy {
      stopSamples()
      stopPitch()
      diag?.stop()
    }
  }

  // MARK: - Muestras para la fusión

  private fun startSamples(periodMs: Long) {
    if (stopSampleSensors != null) return
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    val mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) ?: return
    val unc = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED)
    val rv = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    val sumG = DoubleArray(3); var nG = 0
    val sumM = DoubleArray(3); var nM = 0
    val sumU = DoubleArray(3); var nU = 0
    var rvSin = 0.0; var rvCos = 0.0; var nR = 0
    val rot = FloatArray(9)
    val ori = FloatArray(3)

    val listener = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
          Sensor.TYPE_ACCELEROMETER -> { for (i in 0..2) sumG[i] += e.values[i].toDouble(); nG++ }
          Sensor.TYPE_MAGNETIC_FIELD -> { for (i in 0..2) sumM[i] += e.values[i].toDouble(); nM++ }
          Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED -> { for (i in 0..2) sumU[i] += e.values[i].toDouble(); nU++ }
          Sensor.TYPE_ROTATION_VECTOR -> {
            SensorManager.getRotationMatrixFromVector(rot, e.values)
            SensorManager.getOrientation(rot, ori)
            rvSin += sin(ori[0].toDouble()); rvCos += cos(ori[0].toDouble()); nR++
          }
        }
      }
      override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
    }
    sm.registerListener(listener, accel, SensorManager.SENSOR_DELAY_GAME)
    sm.registerListener(listener, mag, SensorManager.SENSOR_DELAY_GAME)
    if (unc != null) sm.registerListener(listener, unc, SensorManager.SENSOR_DELAY_GAME)
    if (rv != null) sm.registerListener(listener, rv, SensorManager.SENSOR_DELAY_GAME)

    var running = true
    val tick = object : Runnable {
      override fun run() {
        if (!running) return
        if (nG > 0 && nM > 0) {
          val g = listOf(sumG[0] / nG, sumG[1] / nG, sumG[2] / nG)
          val mc = listOf(sumM[0] / nM, sumM[1] / nM, sumM[2] / nM)
          val mu = if (nU > 0) listOf(sumU[0] / nU, sumU[1] / nU, sumU[2] / nU) else mc
          val payload = mutableMapOf<String, Any>(
            "tNs" to SystemClock.elapsedRealtimeNanos().toDouble(),
            "g" to g, "mc" to mc, "mu" to mu,
          )
          if (nR > 0) payload["rv"] = (Math.toDegrees(atan2(rvSin, rvCos)) + 360.0) % 360.0
          sendEvent("onSample", payload)
        }
        sumG.fill(0.0); sumM.fill(0.0); sumU.fill(0.0); nG = 0; nM = 0; nU = 0; rvSin = 0.0; rvCos = 0.0; nR = 0
        main.postDelayed(this, periodMs)
      }
    }
    main.postDelayed(tick, periodMs)
    stopSampleSensors = {
      running = false
      main.removeCallbacks(tick)
      sm.unregisterListener(listener)
    }
  }

  private fun stopSamples() {
    stopSampleSensors?.invoke()
    stopSampleSensors = null
  }

  // MARK: - Inclinación

  /**
   * Matriz de rotación del dispositivo: vector de rotación; sin él, acelerómetro + magnetómetro con filtro paso bajo.
   * Devuelve la función que da de baja los sensores, o null si el teléfono no tiene sensores suficientes.
   */
  private fun registerOrientation(periodUs: Int, onMatrix: (FloatArray) -> Unit): (() -> Unit)? {
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val rotation = FloatArray(9)
    val rv = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    if (rv != null) {
      val l = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
          SensorManager.getRotationMatrixFromVector(rotation, e.values)
          onMatrix(rotation)
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
    val l = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        val isAccel = e.sensor.type == Sensor.TYPE_ACCELEROMETER
        val target = if (isAccel) gravity else field
        val have = if (isAccel) haveG else haveM
        for (i in 0..2) target[i] = if (have) target[i] + LOW_PASS * (e.values[i] - target[i]) else e.values[i]
        if (isAccel) haveG = true else haveM = true
        if (!isAccel && haveG && SensorManager.getRotationMatrix(rotation, null, gravity, field)) onMatrix(rotation)
      }
      override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
    }
    sm.registerListener(l, accel, periodUs)
    sm.registerListener(l, mag, periodUs)
    return { sm.unregisterListener(l) }
  }

  private fun startPitch(intervalMs: Double) {
    if (stopPitchSensors != null) return
    val orientation = FloatArray(3)
    var lastEmit = 0L
    stopPitchSensors = registerOrientation(SensorManager.SENSOR_DELAY_GAME) { rotation ->
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

  companion object {
    private const val LOW_PASS = 0.08f
  }
}
