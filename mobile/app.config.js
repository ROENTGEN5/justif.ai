module.exports = ({ config }) => {
  const mode = process.env.APK_SIZE_MODE;
  if (!mode) return config;
  if (!['universal', 'arm64'].includes(mode)) {
    throw new Error('APK_SIZE_MODE must be universal or arm64');
  }
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ['./plugins/withReleaseSize', { arm64: mode === 'arm64' }],
    ],
  };
};
