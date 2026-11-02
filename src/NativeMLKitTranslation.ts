// Codegen spec for the MLKitTranslation native module. `src/index.js` requires it lazily on the first native call.
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// Language codes are plain strings here; `src/index.js` validates them against TRANSLATE_LANGUAGES before calling.
// Rejections carry a `code` from TranslationErrorCode; `src/index.js` maps anything else to a fallback code.
export interface Spec extends TurboModule {
  isModelDownloaded(language: string): Promise<boolean>;
  getDownloadedModels(): Promise<string[]>;
  downloadModel(language: string, wifiOnly: boolean): Promise<void>;
  deleteModel(language: string): Promise<void>;
  prepareTranslator(sourceLanguage: string, targetLanguage: string): Promise<void>;
  translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>;
  releaseTranslator(): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('MLKitTranslation');
