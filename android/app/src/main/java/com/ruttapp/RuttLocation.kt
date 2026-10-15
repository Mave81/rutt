package com.ruttapp

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * GPS som Opter Driver: en förgrundstjänst (fast notis) som läser telefonens GPS
 * med jämna mellanrum och håller processen vaken, så positionen kan skickas även
 * när skärmen är släckt eller en annan app (t.ex. Google Maps) är öppen.
 * Senaste position hämtas av appen via RuttLocation.getLast().
 */
object LastFix {
  @Volatile var loc: Location? = null
  @Volatile var running = false
}

class LocationService : Service() {
  private var lm: LocationManager? = null
  private var wake: PowerManager.WakeLock? = null
  private val listener = object : LocationListener {
    override fun onLocationChanged(l: Location) { LastFix.loc = l }
    override fun onProviderEnabled(p: String) {}
    override fun onProviderDisabled(p: String) {}
    @Deprecated("") override fun onStatusChanged(p: String?, s: Int, e: Bundle?) {}
  }

  override fun onBind(intent: Intent?): IBinder? = null

  @SuppressLint("MissingPermission")
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val sec = (intent?.getIntExtra("interval", 60) ?: 60).coerceIn(5, 600)
    startForegroundNow()
    try {
      if (wake == null) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rutt:gps").apply { setReferenceCounted(false); acquire() }
      }
    } catch (_: Throwable) {}
    try {
      lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
      lm?.removeUpdates(listener)
      val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      if (fine) {
        val ms = sec * 1000L
        if (lm?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true) lm?.requestLocationUpdates(LocationManager.GPS_PROVIDER, ms, 0f, listener, Looper.getMainLooper())
        if (lm?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true) lm?.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, ms, 0f, listener, Looper.getMainLooper())
        val g = lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER) ?: lm?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        if (g != null && LastFix.loc == null) LastFix.loc = g
      }
    } catch (_: Throwable) {}
    LastFix.running = true
    return START_STICKY
  }

  private fun startForegroundNow() {
    val chId = "rutt_gps"
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(chId) == null) {
      nm.createNotificationChannel(NotificationChannel(chId, "RUTT position", NotificationManager.IMPORTANCE_LOW))
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val pi = if (open != null) PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) else null
    val n: Notification = NotificationCompat.Builder(this, chId)
      .setContentTitle("RUTT")
      .setContentText("Skickar din position till kontoret")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setContentIntent(pi)
      .build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(4711, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    else startForeground(4711, n)
  }

  override fun onDestroy() {
    try { lm?.removeUpdates(listener) } catch (_: Throwable) {}
    try { if (wake?.isHeld == true) wake?.release() } catch (_: Throwable) {}
    LastFix.running = false
    super.onDestroy()
  }
}

class RuttLocationModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName() = "RuttLocation"

  @ReactMethod fun start(intervalSec: Int, promise: Promise) {
    try {
      val i = Intent(rc, LocationService::class.java).putExtra("interval", intervalSec)
      if (Build.VERSION.SDK_INT >= 26) rc.startForegroundService(i) else rc.startService(i)
      promise.resolve(true)
    } catch (e: Throwable) { promise.reject("gps", e.message ?: "kunde inte starta GPS") }
  }

  @ReactMethod fun stop(promise: Promise) {
    try { rc.stopService(Intent(rc, LocationService::class.java)) } catch (_: Throwable) {}
    promise.resolve(true)
  }

  @ReactMethod fun getLast(promise: Promise) {
    val l = LastFix.loc
    if (l == null) { promise.resolve(null); return }
    val m = Arguments.createMap()
    m.putDouble("lat", l.latitude); m.putDouble("lng", l.longitude)
    m.putDouble("alt", if (l.hasAltitude()) l.altitude else 0.0)
    m.putDouble("bearing", if (l.hasBearing()) l.bearing.toDouble() else 0.0)
    m.putDouble("speedKmh", if (l.hasSpeed()) l.speed * 3.6 else 0.0)
    m.putDouble("acc", if (l.hasAccuracy()) l.accuracy.toDouble() else 0.0)
    m.putDouble("time", l.time.toDouble())
    m.putBoolean("running", LastFix.running)
    promise.resolve(m)
  }
}
