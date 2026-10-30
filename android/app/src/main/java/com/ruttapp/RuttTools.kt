package com.ruttapp

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Små verktyg för RUTT:
 *  - copy: kopiera text (nummer, meddelanden)
 *  - addContact: öppnar telefonens egen "Ny kontakt" med namn och nummer ifyllda (RUTT läser aldrig telefonboken)
 *  - notify: notis med valt ljud. Android låser ljudet på en kanal → en kanal per ljud ("RUTT · Pling" osv.)
 *  - playSound / pickSound: lyssna på ett ljud, välja eget ljud ur telefonens ljudväljare
 */
class RuttToolsModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc), ActivityEventListener {
  override fun getName() = "RuttTools"
  private var pickPromise: Promise? = null
  private var playing: Ringtone? = null

  init { rc.addActivityEventListener(this) }

  @ReactMethod fun copy(text: String, promise: Promise) {
    try {
      val cm = rc.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      cm.setPrimaryClip(ClipData.newPlainText("RUTT", text))
      promise.resolve(true)
    } catch (e: Throwable) { promise.reject("copy", e.message ?: "kunde inte kopiera") }
  }

  @ReactMethod fun addContact(name: String, phone: String, note: String, promise: Promise) {
    try {
      val i = Intent(ContactsContract.Intents.Insert.ACTION).apply {
        type = ContactsContract.RawContacts.CONTENT_TYPE
        putExtra(ContactsContract.Intents.Insert.NAME, name)
        putExtra(ContactsContract.Intents.Insert.PHONE, phone)
        putExtra(ContactsContract.Intents.Insert.PHONE_TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_WORK)
        if (note.isNotEmpty()) putExtra(ContactsContract.Intents.Insert.NOTES, note)
        putExtra("finishActivityOnSaveCompleted", true)
      }
      val a = rc.currentActivity
      if (a != null) a.startActivity(i) else { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); rc.startActivity(i) }
      promise.resolve(true)
    } catch (e: Throwable) { promise.reject("contact", e.message ?: "kunde inte öppna kontakter") }
  }

  // ---- ljud ----
  private val names = mapOf(
    "pling" to "Pling", "retro" to "Retro-chatt", "dubbel" to "Dubbelpip", "tuta" to "Tuta",
    "klocka" to "Klocka", "varning" to "Varning", "standard" to "Telefonens standard", "tyst" to "Tyst (bara vibration)")

  private fun soundUri(key: String): Uri? = when {
    key.startsWith("custom:") -> Uri.parse(key.removePrefix("custom:"))
    key == "standard" -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    key == "tyst" -> null
    else -> {
      val id = rc.resources.getIdentifier("rutt_$key", "raw", rc.packageName)
      if (id != 0) Uri.parse("android.resource://${rc.packageName}/$id") else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }
  }

  private fun channelFor(key: String, nm: NotificationManager): String {
    val id = if (key.startsWith("custom:")) "rutt_snd_c" + Integer.toHexString(key.hashCode()) else "rutt_snd_$key"
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(id) == null) {
      val label = names[key] ?: "Eget ljud"
      val ch = NotificationChannel(id, "RUTT · $label", NotificationManager.IMPORTANCE_HIGH)
      ch.description = "Uppdrag, återkallade order och chatt med ljudet $label"
      ch.enableVibration(true); ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
      ch.setSound(soundUri(key), attrs)
      nm.createNotificationChannel(ch)
    }
    return id
  }

  /** Notis med valt ljud. key: pling/retro/dubbel/tuta/klocka/varning/standard/tyst eller custom:<uri>. */
  @ReactMethod fun notify(id: Int, title: String, text: String, key: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(rc, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { promise.resolve(false); return }
      val nm = rc.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val ch = channelFor(key, nm)
      val open = rc.packageManager.getLaunchIntentForPackage(rc.packageName)?.apply { addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK) }
      val pi = if (open != null) PendingIntent.getActivity(rc, 2, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) else null
      val b = NotificationCompat.Builder(rc, ch)
        .setSmallIcon(android.R.drawable.stat_notify_more)
        .setContentTitle(title).setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true).setContentIntent(pi)
      // Äldre Android (före kanaler): ljudet sätts på notisen.
      if (Build.VERSION.SDK_INT < 26) { val u = soundUri(key); if (u != null) b.setSound(u); b.setVibrate(longArrayOf(0, 250, 120, 250)) }
      NotificationManagerCompat.from(rc).notify(id, b.build())
      promise.resolve(true)
    } catch (e: Throwable) { promise.reject("notify", e.message ?: "kunde inte visa notis") }
  }

  /** Ta bort en notis (uppdraget är besvarat – i RUTT eller i Opter). */
  @ReactMethod fun cancel(id: Int, promise: Promise) {
    try { NotificationManagerCompat.from(rc).cancel(id); promise.resolve(true) }
    catch (e: Throwable) { promise.reject("cancel", e.message ?: "kunde inte ta bort notisen") }
  }

  @ReactMethod fun playSound(key: String, promise: Promise) {
    try {
      playing?.stop()
      val u = soundUri(key)
      if (u == null) { promise.resolve(false); return }
      val r = RingtoneManager.getRingtone(rc, u)
      playing = r; r?.play()
      promise.resolve(r != null)
    } catch (e: Throwable) { promise.reject("play", e.message ?: "kunde inte spela") }
  }

  /** Telefonens egen ljudväljare (notisljud). Svarar {uri, title} eller null om du avbröt. */
  @ReactMethod fun pickSound(current: String, promise: Promise) {
    val a = rc.currentActivity
    if (a == null) { promise.reject("pick", "ingen aktivitet"); return }
    try {
      val i = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
        putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
        putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Ljud för RUTT")
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
        if (current.startsWith("custom:")) putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(current.removePrefix("custom:")))
      }
      pickPromise = promise
      a.startActivityForResult(i, 7311)
    } catch (e: Throwable) { pickPromise = null; promise.reject("pick", e.message ?: "kunde inte öppna ljudväljaren") }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != 7311) return
    val p = pickPromise ?: return
    pickPromise = null
    if (resultCode != Activity.RESULT_OK || data == null) { p.resolve(null); return }
    val u: Uri? = if (Build.VERSION.SDK_INT >= 33) data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java) else data.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
    if (u == null) { p.resolve(null); return }
    val title = try { RingtoneManager.getRingtone(rc, u)?.getTitle(rc) ?: "Eget ljud" } catch (e: Throwable) { "Eget ljud" }
    val m = Arguments.createMap(); m.putString("uri", u.toString()); m.putString("title", title)
    p.resolve(m)
  }

  override fun onNewIntent(intent: Intent) {}
}
