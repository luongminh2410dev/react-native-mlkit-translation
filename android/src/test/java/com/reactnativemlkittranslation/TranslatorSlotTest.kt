package com.reactnativemlkittranslation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TranslatorSlotTest {

  private class FakeTranslator(val key: String) {
    var closed = false
  }

  private val created = mutableListOf<FakeTranslator>()
  private val slot = TranslatorSlot<String, FakeTranslator>(
    create = { key -> FakeTranslator(key).also { created.add(it) } },
    close = { translator -> translator.closed = true },
  )

  @Test
  fun reusesTheTranslatorForTheSameKey() {
    val first = slot.acquire("en-vi")!!
    slot.finish()
    val second = slot.acquire("en-vi")!!

    assertSame(first, second)
    assertEquals(1, created.size)
    assertFalse(first.closed)
  }

  @Test
  fun closesTheCurrentTranslatorBeforeCreatingOneForAnotherKey() {
    val first = slot.acquire("en-vi")!!
    slot.finish()
    val second = slot.acquire("vi-en")!!

    assertTrue(first.closed)
    assertFalse(second.closed)
    assertEquals(listOf("en-vi", "vi-en"), created.map { it.key })
  }

  @Test
  fun refusesASecondTranslationWhileBusy() {
    slot.acquire("en-vi")

    assertTrue(slot.isBusy)
    assertNull(slot.acquire("en-vi"))
    assertNull(slot.acquire("vi-en"))
    assertEquals(1, created.size)
  }

  @Test
  fun releasesRightAwayWhenIdle() {
    val translator = slot.acquire("en-vi")!!
    slot.finish()
    slot.release()

    assertTrue(translator.closed)
    slot.acquire("en-vi")
    assertEquals(2, created.size)
  }

  @Test
  fun defersReleaseUntilTheRunningTranslationFinishes() {
    val translator = slot.acquire("en-vi")!!
    slot.release()

    assertFalse(translator.closed)
    slot.finish()
    assertTrue(translator.closed)
    assertFalse(slot.isBusy)
  }

  @Test
  fun releaseIsSafeToRepeatAndOnAnEmptySlot() {
    slot.release()
    val translator = slot.acquire("en-vi")!!
    slot.finish()
    slot.release()
    slot.release()

    assertTrue(translator.closed)
  }

  @Test
  fun leavesTheSlotEmptyAndIdleWhenCreationFails() {
    val failing = TranslatorSlot<String, FakeTranslator>(
      create = { throw IllegalStateException("no model") },
      close = {},
    )

    val failure = runCatching { failing.acquire("en-vi") }.exceptionOrNull()

    assertTrue(failure is IllegalStateException)
    assertFalse(failing.isBusy)
  }

  @Test
  fun ignoresErrorsWhileClosing() {
    val throwingClose = TranslatorSlot<String, FakeTranslator>(
      create = { key -> FakeTranslator(key) },
      close = { throw IllegalStateException("already closed") },
    )

    throwingClose.acquire("en-vi")
    throwingClose.finish()
    throwingClose.release()
    throwingClose.acquire("vi-en")

    assertTrue(throwingClose.isBusy)
  }
}
