import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  deleteModel,
  downloadModel,
  getDownloadedModels,
  isTranslateLanguage,
  releaseTranslator,
  translate,
  TranslateLanguage,
  useModelState
} from 'react-native-mlkit-translation';

import { runSelfTest } from './selfTest';

const TAG = '[MLKitTranslationExample]';
const QUICK_LANGUAGES = [
  TranslateLanguage.ENGLISH,
  TranslateLanguage.VIETNAMESE,
  TranslateLanguage.JAPANESE,
  TranslateLanguage.FRENCH
];

function log(event, data) {
  // Logs metadata only, never the text, like the library itself.
  console.log(`${TAG} ${event} ${JSON.stringify(data)}`);
}

function describeError(error) {
  return error && error.code ? `${error.code}: ${error.message}` : String(error);
}

function LanguagePicker({ label, value, onChange }) {
  const [custom, setCustom] = useState('');
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {QUICK_LANGUAGES.map((language) => (
        <Pressable
          key={language}
          onPress={() => onChange(language)}
          style={[styles.chip, value === language && styles.chipSelected]}
        >
          <Text>{language}</Text>
        </Pressable>
      ))}
      <TextInput
        value={custom}
        onChangeText={setCustom}
        onSubmitEditing={() => isTranslateLanguage(custom) && onChange(custom)}
        placeholder="code"
        autoCapitalize="none"
        style={styles.codeInput}
      />
    </View>
  );
}

function ModelRow({ language, onResult }) {
  const state = useModelState(language);
  const run = (name, operation) => {
    const startedAt = Date.now();
    operation().then(
      () => {
        log(name, { language, ms: Date.now() - startedAt });
        onResult(`${name} ${language}: done`);
      },
      (error) => {
        log(name, { language, ms: Date.now() - startedAt, code: error.code });
        onResult(`${name} ${language}: ${describeError(error)}`);
      }
    );
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label}>
        {language}: {state.status}
        {state.error ? ` (${state.error.code})` : ''}
      </Text>
      <Button title="Wi-Fi" onPress={() => run('download', () => downloadModel(language, { wifiOnly: true }))} />
      <Button title="Any network" onPress={() => run('download', () => downloadModel(language))} />
      <Button title="Delete" onPress={() => run('delete', () => deleteModel(language))} />
    </View>
  );
}

function Button({ title, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export default function TranslationScreen({ autoRunSelfTest = false }) {
  const [from, setFrom] = useState(TranslateLanguage.ENGLISH);
  const [to, setTo] = useState(TranslateLanguage.VIETNAMESE);
  const [text, setText] = useState('Be careful, the floor is slippery.');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [downloaded, setDownloaded] = useState([]);
  const controllerRef = useRef(null);
  const [selfTest, setSelfTest] = useState({ running: false, steps: [] });

  const refreshDownloaded = useCallback(() => {
    getDownloadedModels().then(setDownloaded, (error) => setStatus(describeError(error)));
  }, []);

  const startSelfTest = useCallback(() => {
    setSelfTest({ running: true, steps: [] });
    log('selftest', { event: 'start' });
    runSelfTest((result) => {
      log('selftest', { name: result.name, ok: result.ok, ms: result.ms, detail: result.detail });
      setSelfTest((previous) => ({ ...previous, steps: [...previous.steps, result] }));
    }).then(() => {
      setSelfTest((previous) => {
        const failed = previous.steps.filter((result) => !result.ok).length;
        log('selftest', { event: 'done', passed: previous.steps.length - failed, failed });
        return { ...previous, running: false };
      });
      refreshDownloaded();
    });
  }, [refreshDownloaded]);

  useEffect(() => {
    if (autoRunSelfTest) {
      startSelfTest();
    }
  }, [autoRunSelfTest, startSelfTest]);

  useEffect(() => {
    refreshDownloaded();
    // The pattern the docs recommend: free the translator's memory in the background.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        releaseTranslator().then(
          () => log('release', { reason: 'background' }),
          () => {}
        );
      }
    });
    return () => subscription.remove();
  }, [refreshDownloaded]);

  const runTranslation = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = Date.now();
    setStatus('Translating…');
    translate({ text, from, to, signal: controller.signal }).then(
      (result) => {
        log('translate', { from, to, length: text.length, ms: Date.now() - startedAt });
        setOutput(result);
        setStatus(`Done in ${Date.now() - startedAt} ms`);
      },
      (error) => {
        log('translate', { from, to, length: text.length, ms: Date.now() - startedAt, code: error.code });
        setStatus(describeError(error));
      }
    );
  };

  // Several callers at once: results must come back to the right caller, one native translation at a time.
  const runConcurrent = () => {
    const startedAt = Date.now();
    const requests = Array.from({ length: 10 }, (_, index) => ({
      text: `${index + 1}. ${text}`,
      from: index % 2 === 0 ? from : to,
      to: index % 2 === 0 ? to : from
    }));
    Promise.allSettled(requests.map((request) => translate(request))).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      log('concurrent', { count: results.length, failed: failed.length, ms: Date.now() - startedAt });
      setStatus(`10 requests: ${results.length - failed.length} ok, ${failed.length} failed`);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>ML Kit translation</Text>
        <View style={styles.row}>
          <Button
            title={selfTest.running ? 'Self-test running…' : 'Run self-test'}
            onPress={selfTest.running ? () => {} : startSelfTest}
          />
          {!selfTest.running && selfTest.steps.length > 0 ? (
            <Text>
              {selfTest.steps.filter((result) => result.ok).length}/{selfTest.steps.length} passed
            </Text>
          ) : null}
        </View>
        {selfTest.steps.map((result) => (
          <Text key={result.name} style={result.ok ? styles.pass : styles.fail}>
            {result.ok ? '✓' : '✗'} {result.name} · {result.ms} ms{result.detail ? ` · ${result.detail}` : ''}
            {result.sample ? `\n   → ${result.sample}` : ''}
          </Text>
        ))}
        <LanguagePicker label="From" value={from} onChange={setFrom} />
        <LanguagePicker label="To" value={to} onChange={setTo} />
        <TextInput value={text} onChangeText={setText} multiline style={styles.textInput} />
        <View style={styles.row}>
          <Button title="Translate" onPress={runTranslation} />
          <Button title="Abort" onPress={() => controllerRef.current?.abort()} />
          <Button title="10 at once" onPress={runConcurrent} />
          <Button
            title="Release"
            onPress={() =>
              releaseTranslator().then(
                () => setStatus('Translator released'),
                (e) => setStatus(describeError(e))
              )
            }
          />
        </View>
        <Text style={styles.output}>{output}</Text>
        <Text style={styles.attribution}>Translated by Google</Text>
        <Text style={styles.status}>{status}</Text>

        <Text style={styles.section}>Models</Text>
        {Array.from(new Set([from, to])).map((language) => (
          <ModelRow
            key={language}
            language={language}
            onResult={(message) => {
              setStatus(message);
              refreshDownloaded();
            }}
          />
        ))}
        <Text>On device: {downloaded.join(', ')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { minWidth: 48 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#ccc' },
  chipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  codeInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, minWidth: 60 },
  textInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, minHeight: 80 },
  button: { backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  buttonText: { color: '#fff' },
  output: { fontSize: 16 },
  attribution: { color: '#666', fontSize: 12 },
  status: { color: '#444' },
  pass: { color: '#15803d', fontSize: 12 },
  fail: { color: '#b91c1c', fontSize: 12 }
});
