package com.ruttapp

import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Fångar Android-krascher (som JavaScript inte kan se) och sparar dem i en fil.
 * Vid nästa start läser appen filen via CrashLog.getLast() och visar felet under Felsök.
 */
object CrashCatcher {
  private const val FILE = "rutt_native_crash.txt"
  fun install(ctx: Context) {
    val prev = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, err ->
      try {
        val sw = StringWriter()
        err.printStackTrace(PrintWriter(sw))
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ROOT).format(Date())
        val text = "$stamp [${thread.name}]\n${sw.toString().take(6000)}"
        File(ctx.filesDir, FILE).writeText(text)
      } catch (_: Throwable) {}
      prev?.uncaughtException(thread, err)
    }
  }
  fun read(ctx: Context): String? = try { val f = File(ctx.filesDir, FILE); if (f.exists()) f.readText() else null } catch (_: Throwable) { null }
  fun clear(ctx: Context) { try { File(ctx.filesDir, FILE).delete() } catch (_: Throwable) {} }
}

class CrashLogModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName() = "CrashLog"
  @ReactMethod fun getLast(promise: Promise) { promise.resolve(CrashCatcher.read(rc)) }
  @ReactMethod fun clear(promise: Promise) { CrashCatcher.clear(rc); promise.resolve(true) }
}

class CrashLogPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(CrashLogModule(reactContext), RuttLocationModule(reactContext), RuttSmsModule(reactContext), RuttToolsModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
