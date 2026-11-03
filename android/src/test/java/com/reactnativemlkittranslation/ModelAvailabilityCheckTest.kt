package com.reactnativemlkittranslation

import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeoutException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelAvailabilityCheckTest {
  @Test
  fun skipsEnglishAndDuplicatesAndReportsMissingModelsInOrder() {
    val checked = mutableListOf<String>()
    val missing = findMissingModels(listOf("en", "vi", "ja", "vi"), "en", 100, { 0L }) { language, _ ->
      checked.add(language)
      language == "vi"
    }
    assertEquals(listOf("vi", "ja"), checked)
    assertEquals(listOf("ja"), missing)
  }

  @Test
  fun secondModelUsesOnlyTheRemainingBudget() {
    var now = 0L
    val budgets = mutableListOf<Long>()
    val missing = findMissingModels(listOf("vi", "ja"), "en", 100, { now }) { _, remaining ->
      budgets.add(remaining)
      now += 40
      true
    }
    assertEquals(listOf(100L, 60L), budgets)
    assertTrue(missing.isEmpty())
  }

  @Test
  fun exhaustedBudgetDoesNotStartAnotherCheck() {
    var now = 0L
    val checked = mutableListOf<String>()
    val error = runCatching {
      findMissingModels(listOf("vi", "ja"), "en", 100, { now }) { language, _ ->
        checked.add(language)
        now = 100
        true
      }
    }.exceptionOrNull()
    assertTrue(error is TimeoutException)
    assertEquals(listOf("vi"), checked)
  }

  @Test
  fun timeoutEndsThisCheckAndTheNextRequestHasAFreshBudget() {
    val timeout = TimeoutException("pending task")
    val error = runCatching {
      findMissingModels(listOf("vi", "ja"), "en", 100, { 0L }) { _, _ -> throw timeout }
    }.exceptionOrNull()
    assertSame(timeout, error)
    assertTrue(findMissingModels(listOf("vi"), "en", 100, { 1000L }) { _, remaining ->
      assertEquals(100L, remaining)
      true
    }.isEmpty())
  }

  @Test
  fun propagatesTaskFailureWithoutCheckingTheNextModel() {
    val failure = ExecutionException(IllegalStateException("model manager failed"))
    val checked = mutableListOf<String>()
    val error = runCatching {
      findMissingModels(listOf("vi", "ja"), "en", 100, { 0L }) { language, _ ->
        checked.add(language)
        throw failure
      }
    }.exceptionOrNull()
    assertSame(failure, error)
    assertEquals(listOf("vi"), checked)
  }
}
