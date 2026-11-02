require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RNMLKitTranslation"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # ML Kit 9 requires iOS 15.5.
  s.platforms    = { :ios => "15.5" }
  s.source       = { :git => "https://github.com/luongminh2410dev/react-native-mlkit-translation.git", :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}"

  s.dependency "GoogleMLKit/Translate", "9.0.0"
  # ML Kit ships static frameworks.
  s.static_framework = true

  # React Native, Codegen output (RNMLKitTranslationSpec) and the New Architecture flags.
  install_modules_dependencies(s)
end
