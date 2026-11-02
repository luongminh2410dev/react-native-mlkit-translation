#import "MLKitTranslation.h"

#import <MLKitCommon/MLKitCommon.h>
#import <MLKitTranslate/MLKitTranslate.h>

#include <atomic>

// Error codes shared with Android and `src/translation-error.js`.
static NSString *const MLKitTranslationUnsupportedLanguage = @"UNSUPPORTED_LANGUAGE";
static NSString *const MLKitTranslationModelNotDownloaded = @"MODEL_NOT_DOWNLOADED";
static NSString *const MLKitTranslationModelDownloadFailed = @"MODEL_DOWNLOAD_FAILED";
static NSString *const MLKitTranslationModelManagerFailed = @"MODEL_MANAGER_FAILED";
static NSString *const MLKitTranslationTranslationFailed = @"TRANSLATION_FAILED";

// Short text translated by prepareTranslator so ML Kit loads the models; the result is dropped.
static NSString *const MLKitTranslationWarmUpText = @"Hello";

static MLKTranslateLanguage _Nullable MLKitTranslationSupportedLanguage(NSString *code)
{
  return [MLKTranslateAllLanguages() containsObject:code] ? code : nil;
}

/// Promise callbacks of one downloadModel call.
@interface MLKitTranslationDownloadWaiter : NSObject
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, copy) RCTPromiseRejectBlock reject;
@end

@implementation MLKitTranslationDownloadWaiter
@end

/**
 * Every field below is read and written on `_queue` only: model checks, translator creation, translation results,
 * release, and download bookkeeping run there in order, so at most one translator exists and two translations never
 * overlap. ML Kit completions are dispatched back to `_queue`. JS queues requests; a call that arrives while a
 * translation runs is rejected instead of waiting.
 */
@implementation MLKitTranslation {
  dispatch_queue_t _queue;
  MLKTranslator *_translator;
  NSString *_translatorKey;
  BOOL _busy;
  BOOL _releaseWhenIdle;
  // After invalidation no promise of the old React instance is settled. Set on the calling thread, so blocks already
  // queued on _queue see it too.
  std::atomic<bool> _invalidated;
  // Callers waiting for the download in flight, per language.
  NSMutableDictionary<NSString *, NSMutableArray<MLKitTranslationDownloadWaiter *> *> *_downloadWaiters;
  id<NSObject> _downloadSucceededObserver;
  id<NSObject> _downloadFailedObserver;
}

RCT_EXPORT_MODULE(MLKitTranslation)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    _queue = dispatch_queue_create("com.reactnativemlkittranslation", DISPATCH_QUEUE_SERIAL);
    _downloadWaiters = [NSMutableDictionary new];
  }
  return self;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMLKitTranslationSpecJSI>(params);
}

#pragma mark - Models

- (void)isModelDownloaded:(NSString *)language
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  MLKTranslateRemoteModel *model = [self remoteModelForLanguage:language reject:reject];
  if (model == nil) {
    return;
  }
  dispatch_async(_queue, ^{
    if (self->_invalidated) {
      return;
    }
    resolve(@([[MLKModelManager modelManager] isModelDownloaded:model]));
  });
}

- (void)getDownloadedModels:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    if (self->_invalidated) {
      return;
    }
    NSMutableArray<NSString *> *languages = [NSMutableArray new];
    for (MLKTranslateRemoteModel *model in [MLKModelManager modelManager].downloadedTranslateModels) {
      [languages addObject:model.language];
    }
    resolve(languages);
  });
}

- (void)downloadModel:(NSString *)language
             wifiOnly:(BOOL)wifiOnly
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  MLKTranslateRemoteModel *model = [self remoteModelForLanguage:language reject:reject];
  if (model == nil) {
    return;
  }
  dispatch_async(_queue, ^{
    if (self->_invalidated) {
      return;
    }
    MLKModelManager *manager = [MLKModelManager modelManager];
    if ([manager isModelDownloaded:model]) {
      resolve(nil);
      return;
    }

    MLKitTranslationDownloadWaiter *waiter = [MLKitTranslationDownloadWaiter new];
    waiter.resolve = resolve;
    waiter.reject = reject;
    NSMutableArray<MLKitTranslationDownloadWaiter *> *waiters = self->_downloadWaiters[model.language];
    if (waiters != nil) {
      // Shares the download in flight and its network conditions.
      [waiters addObject:waiter];
      return;
    }
    self->_downloadWaiters[model.language] = [NSMutableArray arrayWithObject:waiter];

    // Observe before starting so the result notification cannot be missed.
    [self observeDownloadsIfNeeded];
    MLKModelDownloadConditions *conditions =
        [[MLKModelDownloadConditions alloc] initWithAllowsCellularAccess:!wifiOnly allowsBackgroundDownloading:YES];
    [manager downloadModel:model conditions:conditions];
  });
}

- (void)deleteModel:(NSString *)language resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  MLKTranslateRemoteModel *model = [self remoteModelForLanguage:language reject:reject];
  if (model == nil) {
    return;
  }
  [[MLKModelManager modelManager] deleteDownloadedModel:model
                                             completion:^(NSError *_Nullable error) {
                                               dispatch_async(self->_queue, ^{
                                                 if (self->_invalidated) {
                                                   return;
                                                 }
                                                 if (error != nil) {
                                                   reject(MLKitTranslationModelManagerFailed, error.localizedDescription, error);
                                                 } else {
                                                   resolve(nil);
                                                 }
                                               });
                                             }];
}

#pragma mark - Translation

- (void)prepareTranslator:(NSString *)sourceLanguage
            targetLanguage:(NSString *)targetLanguage
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  MLKTranslateLanguage source = MLKitTranslationSupportedLanguage(sourceLanguage);
  MLKTranslateLanguage target = MLKitTranslationSupportedLanguage(targetLanguage);
  if (![self validateSource:source target:target sourceInput:sourceLanguage targetInput:targetLanguage reject:reject]) {
    return;
  }

  dispatch_async(_queue, ^{
    if (self->_invalidated) {
      return;
    }
    MLKTranslator *translator = [self acquireTranslatorForSource:source target:target reject:reject];
    if (translator == nil) {
      return;
    }
    // ML Kit loads the models on the first translation, not when the translator is created.
    [self runTranslator:translator
                   text:MLKitTranslationWarmUpText
                resolve:^(id _Nullable result) {
                  resolve(nil);
                }
                 reject:reject];
  });
}

- (void)translate:(NSString *)text
    sourceLanguage:(NSString *)sourceLanguage
    targetLanguage:(NSString *)targetLanguage
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  MLKTranslateLanguage source = MLKitTranslationSupportedLanguage(sourceLanguage);
  MLKTranslateLanguage target = MLKitTranslationSupportedLanguage(targetLanguage);
  if (![self validateSource:source target:target sourceInput:sourceLanguage targetInput:targetLanguage reject:reject]) {
    return;
  }

  dispatch_async(_queue, ^{
    if (self->_invalidated) {
      return;
    }
    MLKTranslator *translator = [self acquireTranslatorForSource:source target:target reject:reject];
    if (translator == nil) {
      return;
    }
    [self runTranslator:translator text:text resolve:resolve reject:reject];
  });
}

- (void)releaseTranslator:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    [self releaseTranslatorWhenIdle];
    if (!self->_invalidated) {
      resolve(nil);
    }
  });
}

#pragma mark - Lifecycle

- (void)invalidate
{
  _invalidated = true;
  dispatch_async(_queue, ^{
    [self->_downloadWaiters removeAllObjects];
    [self stopObservingDownloads];
    [self releaseTranslatorWhenIdle];
  });
}

- (void)dealloc
{
  [self stopObservingDownloads];
}

#pragma mark - Private (on _queue unless noted)

/// Validates the code on the calling thread; rejects and returns nil when it is not an ML Kit language.
- (nullable MLKTranslateRemoteModel *)remoteModelForLanguage:(NSString *)language reject:(RCTPromiseRejectBlock)reject
{
  MLKTranslateLanguage supported = MLKitTranslationSupportedLanguage(language);
  if (supported == nil) {
    reject(
        MLKitTranslationUnsupportedLanguage, [NSString stringWithFormat:@"Unsupported language '%@'.", language], nil);
    return nil;
  }
  return [MLKTranslateRemoteModel translateRemoteModelWithLanguage:supported];
}

- (NSArray<NSString *> *)missingModelsForLanguages:(NSArray<MLKTranslateLanguage> *)languages
{
  MLKModelManager *manager = [MLKModelManager modelManager];
  NSMutableArray<NSString *> *missing = [NSMutableArray new];
  for (MLKTranslateLanguage language in [NSOrderedSet orderedSetWithArray:languages]) {
    if ([language isEqualToString:MLKTranslateLanguageEnglish] || [missing containsObject:language]) {
      continue;
    }
    if (![manager isModelDownloaded:[MLKTranslateRemoteModel translateRemoteModelWithLanguage:language]]) {
      [missing addObject:language];
    }
  }
  return missing;
}

/// Rejects with UNSUPPORTED_LANGUAGE when either side is not an ML Kit language. Runs on the calling thread.
- (BOOL)validateSource:(nullable MLKTranslateLanguage)source
                target:(nullable MLKTranslateLanguage)target
           sourceInput:(NSString *)sourceLanguage
           targetInput:(NSString *)targetLanguage
                reject:(RCTPromiseRejectBlock)reject
{
  if (source != nil && target != nil) {
    return YES;
  }
  NSString *message =
      [NSString stringWithFormat:@"Unsupported language pair '%@' → '%@'.", sourceLanguage, targetLanguage];
  reject(MLKitTranslationUnsupportedLanguage, message, nil);
  return NO;
}

/// Checks that both models are on the device (translating without them would make ML Kit fail; this module never
/// downloads on its own), then takes the translator for the pair and marks it busy. Rejects and returns nil otherwise.
/// Call finishTranslation once the translator is no longer used.
- (nullable MLKTranslator *)acquireTranslatorForSource:(MLKTranslateLanguage)source
                                                target:(MLKTranslateLanguage)target
                                                reject:(RCTPromiseRejectBlock)reject
{
  NSArray<NSString *> *missing = [self missingModelsForLanguages:@[ source, target ]];
  if (missing.count > 0) {
    NSString *message =
        [NSString stringWithFormat:@"Model not downloaded: %@.", [missing componentsJoinedByString:@", "]];
    reject(MLKitTranslationModelNotDownloaded, message, nil);
    return nil;
  }
  if (_busy) {
    reject(MLKitTranslationTranslationFailed, @"Another translation is running.", nil);
    return nil;
  }
  MLKTranslator *translator = [self translatorForSource:source target:target];
  _busy = YES;
  return translator;
}

/// Translates with an acquired translator, then frees it and settles the promise on `_queue`. The completion keeps the
/// module alive until the translation finishes, so the busy flag is always cleared.
- (void)runTranslator:(MLKTranslator *)translator
                 text:(NSString *)text
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  [translator translateText:text
                 completion:^(NSString *_Nullable result, NSError *_Nullable error) {
                   dispatch_async(self->_queue, ^{
                     [self finishTranslation];
                     if (self->_invalidated) {
                       return;
                     }
                     if (result != nil && error == nil) {
                       resolve(result);
                     } else {
                       reject(
                           MLKitTranslationTranslationFailed,
                           error.localizedDescription ?: @"The text could not be translated.",
                           error);
                     }
                   });
                 }];
}

/// Reuses the translator for the same pair; drops the current one before creating a translator for another pair.
- (MLKTranslator *)translatorForSource:(MLKTranslateLanguage)source target:(MLKTranslateLanguage)target
{
  NSString *key = [NSString stringWithFormat:@"%@>%@", source, target];
  if (_translator != nil && [_translatorKey isEqualToString:key]) {
    return _translator;
  }
  _translator = nil;
  _translatorKey = nil;
  MLKTranslatorOptions *options = [[MLKTranslatorOptions alloc] initWithSourceLanguage:source targetLanguage:target];
  _translator = [MLKTranslator translatorWithOptions:options];
  _translatorKey = key;
  return _translator;
}

- (void)finishTranslation
{
  _busy = NO;
  if (_releaseWhenIdle) {
    _releaseWhenIdle = NO;
    [self dropTranslator];
  }
}

- (void)releaseTranslatorWhenIdle
{
  if (_busy) {
    _releaseWhenIdle = YES;
  } else {
    [self dropTranslator];
  }
}

/// The translator is freed by ARC once this was the last strong reference.
- (void)dropTranslator
{
  _translator = nil;
  _translatorKey = nil;
}

- (void)observeDownloadsIfNeeded
{
  if (_downloadSucceededObserver != nil) {
    return;
  }
  __weak MLKitTranslation *weakSelf = self;
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  _downloadSucceededObserver = [center addObserverForName:MLKModelDownloadDidSucceedNotification
                                                   object:nil
                                                    queue:nil
                                               usingBlock:^(NSNotification *notification) {
                                                 [weakSelf settleDownloadForNotification:notification error:nil];
                                               }];
  _downloadFailedObserver = [center addObserverForName:MLKModelDownloadDidFailNotification
                                                object:nil
                                                 queue:nil
                                            usingBlock:^(NSNotification *notification) {
                                              NSError *error = notification.userInfo[MLKModelDownloadUserInfoKeyError];
                                              [weakSelf settleDownloadForNotification:notification
                                                                                error:error ?: [NSError errorWithDomain:@"MLKitTranslation"
                                                                                                                   code:0
                                                                                                               userInfo:nil]];
                                            }];
}

/// Called on `_queue`, or from dealloc when nothing else references the module.
- (void)stopObservingDownloads
{
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  if (_downloadSucceededObserver != nil) {
    [center removeObserver:_downloadSucceededObserver];
    _downloadSucceededObserver = nil;
  }
  if (_downloadFailedObserver != nil) {
    [center removeObserver:_downloadFailedObserver];
    _downloadFailedObserver = nil;
  }
}

/// Called on the notification's thread. Settles every caller waiting for that language, once.
- (void)settleDownloadForNotification:(NSNotification *)notification error:(nullable NSError *)error
{
  id model = notification.userInfo[MLKModelDownloadUserInfoKeyRemoteModel];
  if (![model isKindOfClass:[MLKTranslateRemoteModel class]]) {
    return;
  }
  NSString *language = ((MLKTranslateRemoteModel *)model).language;
  dispatch_async(_queue, ^{
    NSArray<MLKitTranslationDownloadWaiter *> *waiters = self->_downloadWaiters[language];
    if (waiters == nil) {
      return;
    }
    [self->_downloadWaiters removeObjectForKey:language];
    if (self->_invalidated) {
      return;
    }
    for (MLKitTranslationDownloadWaiter *waiter in waiters) {
      if (error != nil) {
        waiter.reject(MLKitTranslationModelDownloadFailed, error.localizedDescription, error);
      } else {
        waiter.resolve(nil);
      }
    }
  });
}

@end
