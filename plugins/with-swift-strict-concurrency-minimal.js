const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26 defaults pods to Swift 6, whose strict concurrency rules
// (e.g. `sending` parameters) error on code that several Expo / RN pods
// still ship. SWIFT_STRICT_CONCURRENCY=minimal is ignored in Swift 6
// mode, so force SWIFT_VERSION=5.0 across all pods to keep them
// compiling until upstream catches up.
const SNIPPET = `
    # Force Swift 5 mode for all pods (Xcode 26 defaults to Swift 6).
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5.0'
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

      if (contents.includes("SWIFT_VERSION'] = '5.0'")) {
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
