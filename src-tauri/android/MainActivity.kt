// Copied over the generated MainActivity by .github/workflows/android.yml.
//
// Bluetooth speaker mics made for Zello (Abbree / KST_vHMIC010 and similar) pair as a
// headset and send Fast Forward when PTT goes down and Rewind when it comes up. Android
// gives those only to the focused window (dispatchKeyEvent) or, with the screen off or
// another app open, to the app's media session, so this activity holds one and passes the
// presses to the page as an "rn-mic-ptt" event (App.jsx turns it into PTT).
package com.repeaternation.radio

import android.content.Intent
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var session: MediaSession? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    session = MediaSession(this, "RepeaterNationMic").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onMediaButtonEvent(intent: Intent): Boolean {
          @Suppress("DEPRECATION")
          val key = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT)
          return (key != null && micKey(key)) || super.onMediaButtonEvent(intent)
        }
        override fun onFastForward() = micPtt(true)
        override fun onRewind() = micPtt(false)
      })
      setPlaybackState(
        PlaybackState.Builder()
          .setActions(PlaybackState.ACTION_FAST_FORWARD or PlaybackState.ACTION_REWIND)
          .setState(PlaybackState.STATE_PLAYING, 0, 1f)
          .build()
      )
      isActive = true
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean = micKey(event) || super.dispatchKeyEvent(event)

  override fun onDestroy() {
    session?.release()
    session = null
    super.onDestroy()
  }

  /** Fast Forward = PTT down, Rewind = PTT up. Each arrives as a short key press. */
  private fun micKey(event: KeyEvent): Boolean {
    val down = when (event.keyCode) {
      KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> true
      KeyEvent.KEYCODE_MEDIA_REWIND -> false
      else -> return false
    }
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) micPtt(down)
    return true
  }

  private fun micPtt(down: Boolean) {
    runOnUiThread {
      webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('rn-mic-ptt',{detail:$down}))", null)
    }
  }
}
