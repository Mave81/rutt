package com.ruttapp

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.File

/**
 * Filer som kommer in i RUTT: delade från andra appar (Dela → RUTT) och MMS-delar.
 * PDF ritas som bilder (högst 6 sidor) så appen kan visa och läsa dem utan annan läsare.
 */
object RuttFiles {
  @Volatile var pending: MutableList<Map<String, Any?>> = mutableListOf()
  var onShared: (() -> Unit)? = null

  fun pdfPages(f: File, dir: File, base: String): Pair<Int, List<String>> {
    val out = ArrayList<String>(); var count = 0
    try {
      ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { r ->
          count = r.pageCount
          for (pi in 0 until minOf(6, r.pageCount)) {
            val pf = File(dir, "${base}_p$pi.png")
            if (!pf.exists() || pf.length() == 0L) {
              r.openPage(pi).use { pg ->
                val w = 1400; val h = (w.toFloat() * pg.height / pg.width).toInt()
                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); bmp.eraseColor(Color.WHITE)
                pg.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                pf.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }; bmp.recycle()
              }
            }
            out.add("file://" + pf.absolutePath)
          }
        }
      }
    } catch (_: Throwable) {}
    return Pair(count, out)
  }

  fun toMap(m: Map<String, Any?>): WritableMap {
    val w = Arguments.createMap()
    for ((k, v) in m) when (v) {
      is String -> w.putString(k, v); is Int -> w.putInt(k, v); is Double -> w.putDouble(k, v); is Long -> w.putDouble(k, v.toDouble())
      is List<*> -> { val a = Arguments.createArray(); v.forEach { a.pushString(it.toString()) }; w.putArray(k, a) }
      null -> w.putNull(k)
    }
    return w
  }

  /** Dela → RUTT: kopierar bilderna/PDF:erna till appen. Anropas från MainActivity. */
  fun take(ctx: Context, i: Intent?) {
    if (i == null) return
    if (i.action != Intent.ACTION_SEND && i.action != Intent.ACTION_SEND_MULTIPLE) return
    val uris = ArrayList<Uri>()
    @Suppress("DEPRECATION")
    if (i.action == Intent.ACTION_SEND) {
      val u: Uri? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)
      if (u != null) uris.add(u)
    } else {
      val l: ArrayList<Uri>? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
      if (l != null) uris.addAll(l)
    }
    val text = i.getStringExtra(Intent.EXTRA_TEXT) ?: ""
    val dir = File(ctx.cacheDir, "shared"); dir.mkdirs()
    Thread {
      val got = ArrayList<Map<String, Any?>>()
      for ((n, u) in uris.withIndex()) {
        try {
          val cr = ctx.contentResolver
          val type = (cr.getType(u) ?: i.type ?: "").lowercase()
          var name = ""
          try { cr.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: "" } } catch (_: Throwable) {}
          val isPdf = type == "application/pdf" || name.lowercase().endsWith(".pdf")
          if (!isPdf && !type.startsWith("image/")) continue
          val base = "s" + System.currentTimeMillis() + "_" + n
          val f = File(dir, base + if (isPdf) ".pdf" else ".jpg")
          cr.openInputStream(u)?.use { ins -> f.outputStream().use { ins.copyTo(it) } }
          val m = HashMap<String, Any?>()
          m["kind"] = if (isPdf) "pdf" else "image"; m["uri"] = "file://" + f.absolutePath; m["name"] = name; m["text"] = text; m["at"] = System.currentTimeMillis().toDouble()
          if (isPdf) { val (c, pages) = pdfPages(f, dir, base); m["pages"] = c; m["pageUris"] = pages }
          got.add(m)
        } catch (_: Throwable) {}
      }
      if (got.isEmpty() && text.isNotBlank()) got.add(mapOf("kind" to "text", "text" to text, "at" to System.currentTimeMillis().toDouble()))
      synchronized(this) { pending.addAll(got) }
      onShared?.invoke()
    }.start()
  }
}
