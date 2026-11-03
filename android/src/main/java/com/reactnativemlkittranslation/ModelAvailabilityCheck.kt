package com.reactnativemlkittranslation

import java.util.concurrent.TimeoutException

/** Checks distinct non-built-in models within one monotonic time budget, on the translation thread. */
internal fun findMissingModels(
  languages: Iterable<String>,
  builtInLanguage: String,
  timeoutNanos: Long,
  nanoTime: () -> Long = System::nanoTime,
  isDownloaded: (String, Long) -> Boolean,
): List<String> {
  val started = nanoTime()
  fun remaining(): Long {
    val left = timeoutNanos - (nanoTime() - started)
    if (left <= 0) throw TimeoutException("Model availability check timed out.")
    return left
  }
  return languages.distinct().filter { language ->
    if (language == builtInLanguage) {
      false
    } else {
      val downloaded = isDownloaded(language, remaining())
      remaining()
      !downloaded
    }
  }
}
