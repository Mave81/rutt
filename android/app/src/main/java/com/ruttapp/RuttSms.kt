package com.ruttapp

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.Telephony
import android.telephony.SmsManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * SMS och kontakter för fliken Jobbet.
 *  - pickContact(): telefonens egen kontaktväljare (ingen kontaktbehörighet behövs – Android ger
 *    tillfällig läsrätt till just den valda kontakten).
 *  - send(): vanligt SMS via SmsManager. Android sparar det själv i telefonens SMS-lista
 *    (gäller appar som inte är standard-SMS-app), så det syns även i Samsung Meddelanden.
 *  - read(): läser telefonens SMS-lista, bara trådarna med de nummer RUTT frågar om.
 *  - Händelser till appen ("ruttSms"): sent / delivered / in (nytt SMS).
 * Chattmeddelanden (RCS) ligger i Samsungs egen app och går inte att läsa härifrån.
 */
class RuttSmsModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc), ActivityEventListener {
  private var pickPromise: Promise? = null
  private val PICK = 7311
  private var registered = false

  override fun getName() = "RuttSms"

  init { rc.addActivityEventListener(this) }

  private fun emit(type: String, id: String?, ok: Boolean, extra: String? = null) {
    try {
      val m = Arguments.createMap()
      m.putString("type", type); m.putString("id", id); m.putBoolean("ok", ok)
      if (extra != null) m.putString("num", extra)
      rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("ruttSms", m)
    } catch (_: Throwable) {}
  }

  private val statusRx = object : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
      val id = i.getStringExtra("id")
      when (i.action) {
        "com.ruttapp.SMS_SENT" -> emit("sent", id, resultCode == Activity.RESULT_OK)
        "com.ruttapp.SMS_DELIVERED" -> emit("delivered", id, true)
        Telephony.Sms.Intents.SMS_RECEIVED_ACTION -> {
          val from = try { Telephony.Sms.Intents.getMessagesFromIntent(i).firstOrNull()?.originatingAddress } catch (_: Throwable) { null }
          emit("in", null, true, from)
        }
      }
    }
  }

  @ReactMethod
  fun listen(p: Promise) {
    if (registered) { p.resolve(true); return }
    try {
      val own = IntentFilter().apply { addAction("com.ruttapp.SMS_SENT"); addAction("com.ruttapp.SMS_DELIVERED") }
      val sys = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
      if (Build.VERSION.SDK_INT >= 33) {
        rc.registerReceiver(statusRx, own, Context.RECEIVER_NOT_EXPORTED)
        rc.registerReceiver(statusRx, sys, Context.RECEIVER_EXPORTED)
      } else {
        rc.registerReceiver(statusRx, own)
        rc.registerReceiver(statusRx, sys)
      }
      registered = true
      p.resolve(true)
    } catch (e: Throwable) { p.reject("listen", e) }
  }

  @ReactMethod
  fun send(num: String, text: String, id: String, p: Promise) {
    try {
      val sm: SmsManager = if (Build.VERSION.SDK_INT >= 31) rc.getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
      val parts = sm.divideMessage(text)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
      val req = (id.hashCode() and 0x7fffffff)
      val sent = ArrayList<PendingIntent>(); val dlv = ArrayList<PendingIntent>()
      for (k in parts.indices) {
        val last = k == parts.size - 1
        sent.add(PendingIntent.getBroadcast(rc, req + k * 2, Intent("com.ruttapp.SMS_SENT").setPackage(rc.packageName).putExtra("id", if (last) id else id + "#" + k), flags))
        dlv.add(PendingIntent.getBroadcast(rc, req + k * 2 + 1, Intent("com.ruttapp.SMS_DELIVERED").setPackage(rc.packageName).putExtra("id", if (last) id else id + "#" + k), flags))
      }
      if (parts.size == 1) sm.sendTextMessage(num, null, text, sent[0], dlv[0])
      else sm.sendMultipartTextMessage(num, null, parts, sent, dlv)
      p.resolve(true)
    } catch (e: Throwable) { p.reject("send", e) }
  }

  // Sista 9 siffrorna: 070-123 45 67, +46701234567 och 0046701234567 blir samma nummer.
  private fun key(n: String?): String { val d = (n ?: "").filter { it.isDigit() }; return if (d.length > 9) d.takeLast(9) else d }

  @ReactMethod
  fun read(nums: ReadableArray, limit: Int, p: Promise) {
    try {
      val want = HashSet<String>()
      for (i in 0 until nums.size()) { val k = key(nums.getString(i)); if (k.length >= 6) want.add(k) }
      val out = Arguments.createArray()
      if (want.isEmpty()) { p.resolve(out); return }
      val cur = rc.contentResolver.query(Uri.parse("content://sms"), arrayOf("_id", "address", "body", "date", "type", "read"), null, null, "date DESC")
      var n = 0
      cur?.use { c ->
        val iId = c.getColumnIndex("_id"); val iA = c.getColumnIndex("address"); val iB = c.getColumnIndex("body")
        val iD = c.getColumnIndex("date"); val iT = c.getColumnIndex("type"); val iR = c.getColumnIndex("read")
        while (c.moveToNext() && n < limit) {
          val k = key(c.getString(iA))
          if (!want.contains(k)) continue
          val m = Arguments.createMap()
          m.putString("id", c.getLong(iId).toString()); m.putString("key", k)
          m.putString("body", c.getString(iB) ?: ""); m.putDouble("date", c.getLong(iD).toDouble())
          m.putInt("type", c.getInt(iT)); m.putBoolean("read", c.getInt(iR) == 1)
          out.pushMap(m); n++
        }
      }
      p.resolve(out)
    } catch (e: Throwable) { p.reject("read", e) }
  }

  @ReactMethod
  fun pickContact(p: Promise) {
    val act = rc.currentActivity
    if (act == null) { p.reject("pick", "ingen aktivitet"); return }
    pickPromise = p
    try {
      act.startActivityForResult(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI), PICK)
    } catch (e: Throwable) { pickPromise = null; p.reject("pick", e) }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != PICK) return
    val p = pickPromise ?: return
    pickPromise = null
    if (resultCode != Activity.RESULT_OK || data?.data == null) { p.resolve(null); return }
    try {
      val cur = rc.contentResolver.query(data.data!!, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)
      cur?.use { c ->
        if (c.moveToFirst()) {
          val m = Arguments.createMap()
          m.putString("name", c.getString(0) ?: ""); m.putString("num", c.getString(1) ?: "")
          p.resolve(m); return
        }
      }
      p.resolve(null)
    } catch (e: Throwable) { p.reject("pick", e) }
  }

  // Mejl med färdig mottagare, ämne och text (Gmail om den finns, annars väljaren). Används för felsökningsdata till Claude.
  @ReactMethod
  fun email(to: String, subject: String, body: String, p: Promise) {
    try {
      val base = Intent(Intent.ACTION_SEND).apply {
        type = "message/rfc822"
        putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val gm = Intent(base).setPackage("com.google.android.gm")
      try { rc.startActivity(gm) } catch (e: Throwable) { rc.startActivity(Intent.createChooser(base, subject).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      p.resolve(true)
    } catch (e: Throwable) { p.reject("email", e) }
  }

  override fun onNewIntent(intent: Intent) {}

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
