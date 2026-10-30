const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withReleaseSize(config, { arm64 = false } = {}) {
  return withGradleProperties(config, (result) => {
    const properties = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
    };
    if (arm64) properties.reactNativeArchitectures = 'arm64-v8a';
    for (const [key, value] of Object.entries(properties)) {
      result.modResults = result.modResults.filter(
        (entry) => entry.type !== 'property' || entry.key !== key
      );
      result.modResults.push({ type: 'property', key, value });
    }
    return result;
  });
};
