package com.reactnativemlkittranslation

/**
 * Holds at most one translator, keyed by its language pair. Free of Android and ML Kit APIs so it runs in JVM tests.
 *
 * Not thread-safe: the module calls it from its single translation thread only.
 */
internal class TranslatorSlot<K : Any, T : Any>(
  private val create: (K) -> T,
  private val close: (T) -> Unit,
) {
  private var key: K? = null
  private var instance: T? = null
  private var releaseWhenIdle = false

  /** True between [acquire] and [finish]: a translation is using the instance. */
  var isBusy = false
    private set

  /**
   * Returns the translator for [newKey] and marks the slot busy, reusing the current one for the same key and closing it
   * before creating one for another key. Returns `null` while busy. Throws what [create] throws, leaving the slot empty.
   */
  fun acquire(newKey: K): T? {
    if (isBusy) {
      return null
    }
    val current = instance
    if (current != null && key == newKey) {
      isBusy = true
      return current
    }
    closeCurrent()
    val created = create(newKey)
    instance = created
    key = newKey
    isBusy = true
    return created
  }

  /** Ends the translation started by [acquire]; runs a release requested meanwhile. */
  fun finish() {
    isBusy = false
    if (releaseWhenIdle) {
      releaseWhenIdle = false
      closeCurrent()
    }
  }

  /** Closes the translator now, or after the running translation when busy. Safe to call repeatedly. */
  fun release() {
    if (isBusy) {
      releaseWhenIdle = true
    } else {
      closeCurrent()
    }
  }

  private fun closeCurrent() {
    val current = instance
    instance = null
    key = null
    if (current != null) {
      runCatching { close(current) }
    }
  }
}
