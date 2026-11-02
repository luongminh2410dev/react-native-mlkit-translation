#import <React/RCTInvalidating.h>
#import <RNMLKitTranslationSpec/RNMLKitTranslationSpec.h>

NS_ASSUME_NONNULL_BEGIN

/// ML Kit on-device translation as a TurboModule. See MLKitTranslation.mm for the threading model.
@interface MLKitTranslation : NSObject <NativeMLKitTranslationSpec, RCTInvalidating>
@end

NS_ASSUME_NONNULL_END
