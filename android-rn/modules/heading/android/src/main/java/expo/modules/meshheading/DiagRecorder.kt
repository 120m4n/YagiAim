package expo.modules.meshheading

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import com.google.android.gms.location.DeviceOrientationListener
import com.google.android.gms.location.DeviceOrientationRequest
import com.google.android.gms.location.LocationServices
import java.io.BufferedWriter
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * FASE 0 (temporal) — graba todas las fuentes de orientación a la vez para decidir con datos cuál es estable.
 * CSV: t_ns,source,v1..v6 (t_ns = reloj elapsedRealtime de los sensores). Fuentes:
 *   fop  : v1 rumbo, v2 error (grados)            rv / grv : v1 azimut magnético, v2 precisión (°, -1 si no hay), v3 pitch, v4 roll
 *   acc  : x, y, z (m/s²)                          mag      : x, y, z (µT, calibrado), v4 estado de calibración (0–3)
 *   unc  : x, y, z (µT sin calibrar), v4–v6 sesgo  am       : v1 azimut magnético crudo (acelerómetro+magnetómetro, sin filtro), v2 pitch, v3 |B|
 * El archivo queda en getExternalFilesDir (legible con `adb pull` sin permisos).
 */
class DiagRecorder(private val context: Context) {
  private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val io = Executors.newSingleThreadExecutor()
  private val fopExecutor = Executors.newSingleThreadExecutor()
  private val listeners = mutableListOf<SensorEventListener>()
  private var fopListener: DeviceOrientationListener? = null
  private var out: BufferedWriter? = null
  @Volatile private var recording = false
  private val gravity = FloatArray(3)
  private val field = FloatArray(3)
  private var haveG = false
  private var magStatus = 0
  private val rot = FloatArray(9)
  private val ori = FloatArray(3)

  fun start(label: String, hasFix: Boolean): String {
    val dir = context.getExternalFilesDir(null) ?: context.cacheDir
    val file = File(dir, "compass_${label}_${System.currentTimeMillis()}.csv")
    out = file.bufferedWriter()
    write("# model=${android.os.Build.MODEL} android=${android.os.Build.VERSION.RELEASE} label=$label hasFix=$hasFix\n")
    write("t_ns,source,v1,v2,v3,v4,v5,v6\n")
    recording = true

    fun listen(type: Int, handler: (SensorEvent) -> Unit) {
      val s = sm.getDefaultSensor(type) ?: return
      val l = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) { if (recording) handler(e) }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) { if (sensor?.type == Sensor.TYPE_MAGNETIC_FIELD) magStatus = accuracy }
      }
      sm.registerListener(l, s, SensorManager.SENSOR_DELAY_GAME)
      listeners += l
    }

    listen(Sensor.TYPE_ROTATION_VECTOR) { e -> rotationRow("rv", e) }
    listen(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) { e -> rotationRow("grv", e) }
    listen(Sensor.TYPE_ACCELEROMETER) { e ->
      for (i in 0..2) gravity[i] = e.values[i]
      haveG = true
      row(e.timestamp, "acc", e.values[0], e.values[1], e.values[2])
    }
    listen(Sensor.TYPE_MAGNETIC_FIELD) { e ->
      for (i in 0..2) field[i] = e.values[i]
      row(e.timestamp, "mag", e.values[0], e.values[1], e.values[2], magStatus.toFloat())
      if (haveG && SensorManager.getRotationMatrix(rot, null, gravity, field)) {
        SensorManager.getOrientation(rot, ori)
        val b = Math.sqrt((field[0] * field[0] + field[1] * field[1] + field[2] * field[2]).toDouble()).toFloat()
        row(e.timestamp, "am", norm(Math.toDegrees(ori[0].toDouble())).toFloat(), -Math.toDegrees(ori[1].toDouble()).toFloat(), b)
      }
    }
    listen(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED) { e -> row(e.timestamp, "unc", *e.values.copyOf(6)) }

    try {
      val client = LocationServices.getFusedOrientationProviderClient(context)
      val l = DeviceOrientationListener { o ->
        if (recording) row(SystemClock.elapsedRealtimeNanos(), "fop", o.headingDegrees, o.headingErrorDegrees)
      }
      client.requestOrientationUpdates(DeviceOrientationRequest.Builder(DeviceOrientationRequest.OUTPUT_PERIOD_DEFAULT).build(), fopExecutor, l)
        .addOnFailureListener { write("# fop_registro_fallido=${it.message}\n") }
      fopListener = l
    } catch (t: Throwable) {
      write("# fop_no_disponible=${t.message}\n")
    }
    return file.absolutePath
  }

  fun stop() {
    recording = false
    listeners.forEach { sm.unregisterListener(it) }
    listeners.clear()
    fopListener?.let { LocationServices.getFusedOrientationProviderClient(context).removeOrientationUpdates(it) }
    fopListener = null
    io.execute { synchronized(this) { out?.flush(); out?.close(); out = null } }
    io.shutdown()
    io.awaitTermination(3, TimeUnit.SECONDS)
    fopExecutor.shutdown()
  }

  private fun rotationRow(src: String, e: SensorEvent) {
    SensorManager.getRotationMatrixFromVector(rot, e.values)
    SensorManager.getOrientation(rot, ori)
    val acc = if (e.values.size >= 5 && e.values[4] >= 0f) Math.toDegrees(e.values[4].toDouble()).toFloat() else -1f
    row(e.timestamp, src, norm(Math.toDegrees(ori[0].toDouble())).toFloat(), acc, -Math.toDegrees(ori[1].toDouble()).toFloat(), Math.toDegrees(ori[2].toDouble()).toFloat())
  }

  private fun norm(d: Double): Double { val r = d % 360.0; return if (r < 0) r + 360.0 else r }

  private fun row(t: Long, src: String, vararg v: Float) {
    val sb = StringBuilder().append(t).append(',').append(src)
    for (x in v) sb.append(',').append(String.format(Locale.US, "%.4f", x))
    sb.append('\n')
    write(sb.toString())
  }

  private fun write(line: String) {
    if (io.isShutdown) return
    io.execute { synchronized(this) { out?.write(line) } }
  }
}
