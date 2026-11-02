package com.reactnativemlkittranslation

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/**
 * ML Kit on-device translation. Model management calls go straight to [RemoteModelManager]; everything that touches the
 * translator (model check, creation, warm-up and translation results, release) runs in order on one thread, so
 * at most one translator exists and two translations never overlap. JS queues requests; a call that arrives while a
 * translation runs is rejected instead of waiting.
 */
class MLKitTranslationModule(reactContext: ReactApplicationContext) : NativeMLKitTranslationSpec(reactContext) {

  companion object {
    const val NAME = "MLKitTranslation"

    // Error codes shared with iOS and `src/translation-error.js`.
    private const val UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE"
    private const val MODEL_NOT_DOWNLOADED = "MODEL_NOT_DOWNLOADED"
    private const val MODEL_DOWNLOAD_FAILED = "MODEL_DOWNLOAD_FAILED"
    private const val MODEL_MANAGER_FAILED = "MODEL_MANAGER_FAILED"
    private const val TRANSLATION_FAILED = "TRANSLATION_FAILED"

    // Short text translated by prepareTranslator() so ML Kit loads the models; the result is dropped.
    private const val WARM_UP_TEXT = "Hello"
  }

  private data class LanguagePair(val source: String, val target: String)

  private val translationExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "MLKitTranslation").apply { isDaemon = true }
  }

  // Used on the translation thread only.
  private val translators = TranslatorSlot<LanguagePair, Translator>(
    create = { pair ->
      Translation.getClient(
        TranslatorOptions.Builder().setSourceLanguage(pair.source).setTargetLanguage(pair.target).build(),
      )
    },
    close = { translator -> translator.close() },
  )
  private var shutdownWhenIdle = false

  private val modelManager: RemoteModelManager by lazy { RemoteModelManager.getInstance() }

  // After invalidation no promise of the old React instance is settled.
  @Volatile private var invalidated = false

  override fun isModelDownloaded(language: String, promise: Promise) {
    val model = remoteModel(language, promise) ?: return
    modelManager.isModelDownloaded(model)
      .addOnSuccessListener { downloaded -> resolve(promise, downloaded) }
      .addOnFailureListener { error -> reject(promise, MODEL_MANAGER_FAILED, error.message, error) }
  }

  override fun getDownloadedModels(promise: Promise) {
    modelManager.getDownloadedModels(TranslateRemoteModel::class.java)
      .addOnSuccessListener { models ->
        val languages = Arguments.createArray()
        models.forEach { model -> languages.pushString(model.language) }
        resolve(promise, languages)
      }
      .addOnFailureListener { error -> reject(promise, MODEL_MANAGER_FAILED, error.message, error) }
  }

  override fun downloadModel(language: String, wifiOnly: Boolean, promise: Promise) {
    val model = remoteModel(language, promise) ?: return
    val conditions = DownloadConditions.Builder().apply { if (wifiOnly) requireWifi() }.build()
    modelManager.download(model, conditions)
      .addOnSuccessListener { resolve(promise, null) }
      .addOnFailureListener { error -> reject(promise, MODEL_DOWNLOAD_FAILED, error.message, error) }
  }

  override fun deleteModel(language: String, promise: Promise) {
    val model = remoteModel(language, promise) ?: return
    modelManager.deleteDownloadedModel(model)
      .addOnSuccessListener { resolve(promise, null) }
      .addOnFailureListener { error -> reject(promise, MODEL_MANAGER_FAILED, error.message, error) }
  }

  override fun prepareTranslator(sourceLanguage: String, targetLanguage: String, promise: Promise) {
    val pair = languagePair(sourceLanguage, targetLanguage, promise) ?: return
    runOnTranslationThread(promise) {
      val translator = acquireTranslator(pair, promise) ?: return@runOnTranslationThread
      // ML Kit loads the models on the first translation, not when the client is created.
      runTranslation(translator, WARM_UP_TEXT, promise) { null }
    }
  }

  override fun translate(text: String, sourceLanguage: String, targetLanguage: String, promise: Promise) {
    val pair = languagePair(sourceLanguage, targetLanguage, promise) ?: return
    runOnTranslationThread(promise) {
      val translator = acquireTranslator(pair, promise) ?: return@runOnTranslationThread
      runTranslation(translator, text, promise) { result -> result }
    }
  }

  override fun releaseTranslator(promise: Promise) {
    runOnTranslationThread(promise) {
      translators.release()
      resolve(promise, null)
    }
  }

  override fun invalidate() {
    invalidated = true
    try {
      translationExecutor.execute {
        translators.release()
        // A running translation still delivers its result to this executor; shut it down once that is done.
        if (translators.isBusy) {
          shutdownWhenIdle = true
        } else {
          translationExecutor.shutdown()
        }
      }
    } catch (_: RejectedExecutionException) {
      // Already shut down.
    }
    super.invalidate()
  }

  private fun languagePair(sourceLanguage: String, targetLanguage: String, promise: Promise): LanguagePair? {
    val source = TranslateLanguage.fromLanguageTag(sourceLanguage)
    val target = TranslateLanguage.fromLanguageTag(targetLanguage)
    if (source == null || target == null) {
      reject(promise, UNSUPPORTED_LANGUAGE, "Unsupported language pair '$sourceLanguage' → '$targetLanguage'.")
      return null
    }
    return LanguagePair(source, target)
  }

  /**
   * On the translation thread: checks that both models are on the device (translating without them would fail inside
   * ML Kit; this module never downloads on its own), then takes the translator for [pair] and marks it busy. Rejects
   * [promise] and returns `null` otherwise. Call [finishTranslation] once the translator is no longer used.
   */
  private fun acquireTranslator(pair: LanguagePair, promise: Promise): Translator? {
    val missing = setOf(pair.source, pair.target).filter { language ->
      language != TranslateLanguage.ENGLISH &&
        !Tasks.await(modelManager.isModelDownloaded(TranslateRemoteModel.Builder(language).build()))
    }
    if (missing.isNotEmpty()) {
      reject(promise, MODEL_NOT_DOWNLOADED, "Model not downloaded: ${missing.joinToString()}.")
      return null
    }
    val translator = translators.acquire(pair)
    if (translator == null) {
      reject(promise, TRANSLATION_FAILED, "Another translation is running.")
    }
    return translator
  }

  /** Translates with an acquired translator, then frees it and settles [promise] with [toResult] of the translation. */
  private fun runTranslation(translator: Translator, text: String, promise: Promise, toResult: (String) -> Any?) {
    try {
      translator.translate(text).addOnCompleteListener(translationExecutor) { task ->
        finishTranslation()
        if (task.isSuccessful) {
          resolve(promise, toResult(task.result))
        } else {
          reject(promise, TRANSLATION_FAILED, task.exception?.message, task.exception)
        }
      }
    } catch (error: Exception) {
      finishTranslation()
      throw error
    }
  }

  private fun finishTranslation() {
    translators.finish()
    if (shutdownWhenIdle) {
      translationExecutor.shutdown()
    }
  }

  private fun runOnTranslationThread(promise: Promise, block: () -> Unit) {
    try {
      translationExecutor.execute {
        if (invalidated) {
          return@execute
        }
        try {
          block()
        } catch (error: Exception) {
          reject(promise, TRANSLATION_FAILED, error.message, error)
        }
      }
    } catch (error: RejectedExecutionException) {
      reject(promise, TRANSLATION_FAILED, "The module is shutting down.", error)
    }
  }

  private fun remoteModel(language: String, promise: Promise): TranslateRemoteModel? {
    val tag = TranslateLanguage.fromLanguageTag(language)
    if (tag == null) {
      reject(promise, UNSUPPORTED_LANGUAGE, "Unsupported language '$language'.")
      return null
    }
    return TranslateRemoteModel.Builder(tag).build()
  }

  private fun resolve(promise: Promise, value: Any?) {
    if (!invalidated) {
      promise.resolve(value)
    }
  }

  private fun reject(promise: Promise, code: String, message: String?, error: Throwable? = null) {
    if (invalidated) {
      return
    }
    val text = message ?: code
    if (error != null) {
      promise.reject(code, text, error)
    } else {
      promise.reject(code, text)
    }
  }
}
