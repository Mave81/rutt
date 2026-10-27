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
import java.io.File
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

  init {
    rc.addActivityEventListener(this)
    RuttFiles.onShared = { emit("shared", null, true) }
  }

  /** Det som delats till RUTT sedan sist (töms när det hämtas). */
  @ReactMethod
  fun getShared(p: Promise) {
    val a = Arguments.createArray()
    synchronized(RuttFiles) { RuttFiles.pending.forEach { a.pushMap(RuttFiles.toMap(it)) }; RuttFiles.pending.clear() }
    p.resolve(a)
  }

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

  /**
   * MMS (bilder, PDF) från samma nummer. Delarna sparas i appens cache (mms/<id>.<ext>) och PDF:er ritas
   * som bilder sida för sida (högst 6) så de kan visas i appen utan annan läsare.
   * RCS-chatt syns inte här – den ligger i Meddelanden-appen. Då används Dela → RUTT.
   */
  @ReactMethod
  fun readMms(nums: ReadableArray, limit: Int, p: Promise) {
    Thread {
      try {
        val want = HashSet<String>()
        for (i in 0 until nums.size()) { val k = key(nums.getString(i)); if (k.length >= 6) want.add(k) }
        val out = Arguments.createArray()
        if (want.isEmpty()) { p.resolve(out); return@Thread }
        val cr = rc.contentResolver
        val dir = File(rc.cacheDir, "mms"); dir.mkdirs()
        val cur = cr.query(Uri.parse("content://mms"), arrayOf("_id", "date", "msg_box", "read"), null, null, "date DESC")
        var seen = 0; var n = 0
        cur?.use { c ->
          while (c.moveToNext() && seen < 300 && n < limit) {
            seen++
            val id = c.getLong(0); val box = c.getInt(2)
            // Avsändare (137) för inkomna, mottagare (151) för skickade.
            var addr: String? = null
            cr.query(Uri.parse("content://mms/$id/addr"), arrayOf("address", "type"), null, null, null)?.use { a ->
              while (a.moveToNext()) { val t = a.getInt(1); if ((box == 1 && t == 137) || (box != 1 && t == 151)) { addr = a.getString(0); break } }
            }
            val k = key(addr)
            if (!want.contains(k)) continue
            val text = StringBuilder(); val media = Arguments.createArray()
            cr.query(Uri.parse("content://mms/part"), arrayOf("_id", "ct", "text", "name", "cl", "fn"), "mid=?", arrayOf(id.toString()), null)?.use { q ->
              while (q.moveToNext()) {
                val pid = q.getLong(0); val ct = (q.getString(1) ?: "").lowercase()
                val name = q.getString(3) ?: q.getString(4) ?: q.getString(5) ?: ""
                if (ct == "text/plain") { val t = q.getString(2); if (!t.isNullOrBlank()) { if (text.isNotEmpty()) text.append("\n"); text.append(t) }; continue }
                val isImg = ct.startsWith("image/"); val isPdf = ct == "application/pdf" || name.lowercase().endsWith(".pdf")
                if (!isImg && !isPdf) continue
                val ext = if (isPdf) "pdf" else ct.substringAfter("/").replace("jpeg", "jpg").take(4)
                val f = File(dir, "$pid.$ext")
                if (!f.exists() || f.length() == 0L) {
                  try { cr.openInputStream(Uri.parse("content://mms/part/$pid"))?.use { ins -> f.outputStream().use { ins.copyTo(it) } } } catch (_: Throwable) { continue }
                }
                val m = Arguments.createMap()
                m.putString("kind", if (isPdf) "pdf" else "image"); m.putString("uri", "file://" + f.absolutePath); m.putString("name", name)
                if (isPdf) {
                  val (cnt, pages) = RuttFiles.pdfPages(f, dir, pid.toString())
                  m.putInt("pages", cnt); val a = Arguments.createArray(); pages.forEach { a.pushString(it) }; m.putArray("pageUris", a)
                }
                media.pushMap(m)
              }
            }
            if (text.isEmpty() && media.size() == 0) continue
            val o = Arguments.createMap()
            o.putString("id", "mms$id"); o.putString("key", k); o.putString("body", text.toString())
            o.putDouble("date", c.getLong(1) * 1000.0); o.putInt("type", if (box == 1) 1 else 2); o.putBoolean("read", c.getInt(3) == 1)
            o.putArray("media", media)
            out.pushMap(o); n++
          }
        }
        p.resolve(out)
      } catch (e: Throwable) { p.reject("mms", e) }
    }.start()
  }

  /** Läser texten i en bild (file://…): rader med ruta, i bildens pixlar. Fungerar utan nät. */
  @ReactMethod
  fun ocr(uri: String, p: Promise) {
    try {
      val img = com.google.mlkit.vision.common.InputImage.fromFilePath(rc, Uri.parse(uri))
      runOcr(img, null, p)
    } catch (e: Throwable) { p.reject("ocr", e) }
  }

  /**
   * Som ocr, men bilden vrids först (deg = 90/180/270, utöver kamerans EXIF) – för en sedel fotad på tvären.
   * Den vridna bilden sparas och skickas med som "uri", så rutorna stämmer mot bilden som visas.
   */
  @ReactMethod
  fun ocrRot(uri: String, deg: Int, p: Promise) {
    Thread {
      try {
        val u = Uri.parse(uri); val cr = rc.contentResolver
        val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(u).use { android.graphics.BitmapFactory.decodeStream(it, null, o) }
        var sample = 1; while (maxOf(o.outWidth, o.outHeight) / sample > 3000) sample *= 2
        val bmp = cr.openInputStream(u).use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) }
          ?: throw Exception("kunde inte läsa bilden")
        val ex = try { cr.openInputStream(u).use { android.media.ExifInterface(it!!).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1) } } catch (e: Throwable) { 1 }
        val exDeg = when (ex) { 6 -> 90; 3 -> 180; 8 -> 270; else -> 0 }
        val m = android.graphics.Matrix(); m.postRotate(((exDeg + deg) % 360).toFloat())
        val rot = android.graphics.Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        val f = File(rc.cacheDir, "ocr_" + System.currentTimeMillis() + "_" + deg + ".jpg")
        java.io.FileOutputStream(f).use { rot.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, it) }
        runOcr(com.google.mlkit.vision.common.InputImage.fromBitmap(rot, 0), Uri.fromFile(f).toString(), p)
      } catch (e: Throwable) { p.reject("ocr", e) }
    }.start()
  }

  private fun runOcr(img: com.google.mlkit.vision.common.InputImage, newUri: String?, p: Promise) {
    try {
      val rec = com.google.mlkit.vision.text.TextRecognition.getClient(com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS)
      rec.process(img).addOnSuccessListener { t ->
        val out = Arguments.createMap(); out.putInt("w", img.width); out.putInt("h", img.height)
        if (newUri != null) out.putString("uri", newUri)
        val lines = Arguments.createArray()
        t.textBlocks.forEachIndexed { bi, b ->
          for (l in b.lines) {
            val r = l.boundingBox ?: continue
            val m = Arguments.createMap()
            m.putString("t", l.text); m.putInt("b", bi)
            m.putInt("x", r.left); m.putInt("y", r.top); m.putInt("w", r.width()); m.putInt("h", r.height())
            lines.pushMap(m)
          }
        }
        out.putArray("lines", lines); out.putString("text", t.text)
        p.resolve(out); rec.close()
      }.addOnFailureListener { e -> p.reject("ocr", e); rec.close() }
    } catch (e: Throwable) { p.reject("ocr", e) }
  }

  /**
   * Ifylld sedel: ritar text (namn, datum, tid, hämtad av) och signaturen på sidbilden och sparar en ny PNG.
   * texts: [{t, x, y, size}] i bildens pixlar. sig: {strokes:[[{x,y}]], w, h} + box {x,y,w,h}.
   * footer: rader som läggs i en vit list under sidan (när sedeln saknar fält att skriva i).
   */
  @ReactMethod
  fun fillSedel(src: String, texts: ReadableArray, sig: com.facebook.react.bridge.ReadableMap?, footer: ReadableArray?, p: Promise) {
    Thread {
      try {
        val opts = android.graphics.BitmapFactory.Options().apply { inMutable = true }
        val path = Uri.parse(src).path ?: throw Exception("ingen fil")
        val base = android.graphics.BitmapFactory.decodeFile(path, opts) ?: throw Exception("kunde inte läsa bilden")
        val fl = if (footer != null) footer.size() else 0
        val lineH = (base.width * 0.028f)
        val extra = if (fl > 0) (lineH * (fl + 1.6f)).toInt() + (if (sig != null) (base.width * 0.16f).toInt() else 0) else 0
        val out = android.graphics.Bitmap.createBitmap(base.width, base.height + extra, android.graphics.Bitmap.Config.ARGB_8888)
        val cv = android.graphics.Canvas(out)
        cv.drawColor(android.graphics.Color.WHITE)
        cv.drawBitmap(base, 0f, 0f, null)
        val ink = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(26, 63, 160) }
        for (i in 0 until texts.size()) {
          val t = texts.getMap(i) ?: continue
          ink.textSize = t.getDouble("size").toFloat(); ink.typeface = android.graphics.Typeface.DEFAULT_BOLD
          cv.drawText(t.getString("t") ?: "", t.getDouble("x").toFloat(), t.getDouble("y").toFloat(), ink)
        }
        var sigTop = 0f
        if (fl > 0) {
          val y0 = base.height.toFloat()
          val sep = android.graphics.Paint().apply { color = android.graphics.Color.rgb(200, 200, 200); strokeWidth = 2f }
          cv.drawLine(base.width * 0.04f, y0 + lineH * 0.5f, base.width * 0.96f, y0 + lineH * 0.5f, sep)
          for (i in 0 until fl) {
            ink.textSize = lineH * (if (i == 0) 0.78f else 0.66f); ink.typeface = if (i == 0) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            cv.drawText(footer!!.getString(i) ?: "", base.width * 0.05f, y0 + lineH * (1.4f + i), ink)
          }
          sigTop = y0 + lineH * (fl + 1.1f)
        }
        if (sig != null) {
          val strokes = sig.getArray("strokes"); val sw = sig.getDouble("w").toFloat(); val sh = sig.getDouble("h").toFloat()
          val box = sig.getMap("box")
          val bx = if (box != null) box.getDouble("x").toFloat() else base.width * 0.05f
          val by = if (box != null) box.getDouble("y").toFloat() else sigTop
          val bw = if (box != null) box.getDouble("w").toFloat() else base.width * 0.45f
          val bh = if (box != null) box.getDouble("h").toFloat() else base.width * 0.14f
          val k = minOf(bw / sw, bh / sh); val ox = bx + (bw - sw * k) / 2; val oy = by + (bh - sh * k) / 2
          val pen = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(26, 63, 160); style = android.graphics.Paint.Style.STROKE; strokeWidth = maxOf(2.5f, base.width / 400f); strokeCap = android.graphics.Paint.Cap.ROUND; strokeJoin = android.graphics.Paint.Join.ROUND }
          if (strokes != null) for (i in 0 until strokes.size()) {
            val st = strokes.getArray(i) ?: continue
            val path2 = android.graphics.Path()
            for (j in 0 until st.size()) { val pt = st.getMap(j) ?: continue; val x = ox + pt.getDouble("x").toFloat() * k; val y = oy + pt.getDouble("y").toFloat() * k; if (j == 0) path2.moveTo(x, y) else path2.lineTo(x, y) }
            cv.drawPath(path2, pen)
          }
        }
        val dir = File(rc.cacheDir, "shared"); dir.mkdirs()
        val f = File(dir, "ifylld_" + System.currentTimeMillis() + ".png")
        f.outputStream().use { out.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        base.recycle(); out.recycle()
        p.resolve("file://" + f.absolutePath)
      } catch (e: Throwable) { p.reject("fill", e) }
    }.start()
  }

  /** Öppnar Meddelanden med bilden bifogad till numret (du trycker Skicka – Android låter inte appar skicka MMS själva). */
  @ReactMethod
  fun shareImage(uri: String, num: String, text: String, p: Promise) {
    try {
      val f = File(Uri.parse(uri).path ?: "")
      val cu = androidx.core.content.FileProvider.getUriForFile(rc, rc.packageName + ".files", f)
      val i = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"; putExtra(Intent.EXTRA_STREAM, cu); putExtra("address", num); putExtra("sms_body", text); putExtra(Intent.EXTRA_TEXT, text)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val pkg = Telephony.Sms.getDefaultSmsPackage(rc)
      if (pkg != null) i.setPackage(pkg)
      try { rc.startActivity(i) } catch (_: Throwable) { i.setPackage(null); rc.startActivity(Intent.createChooser(i, "Skicka sedeln").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      p.resolve(true)
    } catch (e: Throwable) { p.reject("share", e) }
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
      // Från appens eget fönster när det finns (säkrast på nyare Android), annars från appen.
      val ctx: Context = rc.currentActivity ?: rc
      try { ctx.startActivity(gm) } catch (e: Throwable) { ctx.startActivity(Intent.createChooser(base, subject).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      p.resolve(true)
    } catch (e: Throwable) { p.reject("email", e) }
  }

  override fun onNewIntent(intent: Intent) {}

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
