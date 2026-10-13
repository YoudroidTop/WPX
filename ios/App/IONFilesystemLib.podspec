# Compile the pinned upstream sources instead of downloading its binary release.
Pod::Spec.new do |spec|
  spec.name = 'IONFilesystemLib'
  spec.version = '2.0.0'
  spec.summary = 'Native filesystem support for Capacitor'
  spec.homepage = 'https://github.com/ionic-team/ion-ios-filesystem'
  spec.license = { :type => 'MIT', :file => 'LICENSE' }
  spec.author = 'OutSystems'
  spec.source = { :git => 'https://github.com/ionic-team/ion-ios-filesystem.git', :commit => '13848aab4f3447ff98dfdbe72ff8ef31bf333db0' }
  spec.source_files = 'IONFilesystemLib/**/*.swift'
  spec.ios.deployment_target = '15.0'
  spec.swift_version = '5.9'
end
