const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26 defaults pods to Swift 6 strict concurrency, which trips on
// non-Sendable types in several Expo / RN pods. Override per-pod build
// settings during pod install so the build matches pre-Xcode 26 behavior.
const SNIPPET = `
    # Override Swift strict concurrency to 'minimal' for all pods
    # to keep Xcode 26 builds working with current Expo SDK 54 packages.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      end
    end
`;

module.exports = function withSwiftStrictConcurrencyMinimal(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes("SWIFT_STRICT_CONCURRENCY'] = 'minimal'")) {
        return config;
      }

      const match = contents.match(/(post_install do \|installer\|[\s\S]*?)(\n\s*end\s*\n)/);
      if (!match) {
        throw new Error('Could not find post_install block in Podfile');
      }
      contents = contents.replace(match[0], match[1] + SNIPPET + match[2]);
      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
