package com.ruttapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.common.assets.ReactFontManager

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(CrashLogPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    CrashCatcher.install(this)
    // Typsnitt (Barlow, Barlow Semi Condensed, IBM Plex Mono) med vikter – se src/fontpatch.js
    try {
      val fm = ReactFontManager.getInstance()
      fm.addCustomFont(this, "Barlow", R.font.barlow)
      fm.addCustomFont(this, "BarlowCond", R.font.barlowcond)
      fm.addCustomFont(this, "PlexMono", R.font.plexmono)
    } catch (e: Throwable) {}
    loadReactNative(this)
  }
}
