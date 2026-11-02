# Privacy and attribution

## What stays on the device

Translation runs on the device. Per the [ML Kit terms](https://developers.google.com/ml-kit/terms), ML Kit does not send the input text or the translation to Google servers. This package does not log, store, or send them either.

The SDK still uses the network:

- to download language models;
- to contact Google for bug fixes, model updates, and hardware compatibility information;
- to send metrics about the performance and use of the APIs.

Do not describe the feature as fully offline or free of telemetry. You are responsible for telling your users about Google's processing of ML Kit metrics, as described in the ML Kit terms, and for the Google Play Data safety and App Store privacy disclosures.

## Attribution

Apps that show ML Kit translations must follow the [ML Kit translation terms](https://developers.google.com/ml-kit/language/translation/translation-terms), which apply the [Google Cloud Translation attribution requirements](https://cloud.google.com/translate/attribution) (layout, Google attribution, and branding). Check those pages for the current wording and assets; Google may change them without notice.

## Quality

ML Kit translation is meant for casual and simple text. Quality is lower than online Google Translate and varies by language pair. Do not use it to replace reviewed content such as lesson answers or dictionary entries.
