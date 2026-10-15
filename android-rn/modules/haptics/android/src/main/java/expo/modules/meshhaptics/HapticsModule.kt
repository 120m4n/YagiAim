package expo.modules.meshhaptics

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** PM-10 — vibración con forma de onda y equivalentes de `UINotificationFeedbackGenerator`. */
class HapticsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Sin contexto de React")

  private val vibrator: Vibrator
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

  override fun definition() = ModuleDefinition {
    Name("MeshHaptics")

    Function("hasAmplitudeControl") { vibrator.hasAmplitudeControl() }

    Function("vibrateWaveform") { timings: List<Double>, amplitudes: List<Double> ->
      vibrator.vibrate(
        VibrationEffect.createWaveform(
          timings.map { it.toLong() }.toLongArray(),
          amplitudes.map { it.toInt() }.toIntArray(),
          -1,
        ),
      )
    }

    Function("cancel") { vibrator.cancel() }

    // success → CONFIRM (API 30+) o doble clic; warning → REJECT (API 30+) o clic fuerte
    Function("notify") { kind: String ->
      val success = kind == "success"
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val view = appContext.currentActivity?.window?.decorView
        if (view != null) {
          Handler(Looper.getMainLooper()).post {
            view.performHapticFeedback(if (success) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.REJECT)
          }
          return@Function
        }
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        vibrator.vibrate(VibrationEffect.createPredefined(if (success) VibrationEffect.EFFECT_DOUBLE_CLICK else VibrationEffect.EFFECT_HEAVY_CLICK))
      } else {
        vibrator.vibrate(VibrationEffect.createOneShot(if (success) 60 else 120, VibrationEffect.DEFAULT_AMPLITUDE))
      }
    }
  }
}
