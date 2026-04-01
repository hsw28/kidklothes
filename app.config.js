const appJson = require('./app.json');

const parseBoolean = (value) => String(value).toLowerCase() === 'true';

module.exports = () => {
  const base = appJson.expo;
  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      REVENUECAT_IOS_API_KEY: process.env.REVENUECAT_IOS_API_KEY || '',
      REVENUECAT_ANDROID_API_KEY: process.env.REVENUECAT_ANDROID_API_KEY || '',
      MONETIZATION_ENABLED: parseBoolean(process.env.MONETIZATION_ENABLED || 'false'),
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY || '',
      POSTHOG_HOST: process.env.POSTHOG_HOST || '',
    },
  };
};
