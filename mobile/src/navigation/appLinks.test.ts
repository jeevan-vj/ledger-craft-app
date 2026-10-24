import { describe, expect, it } from '@jest/globals';

type IntentFilterData = {
  scheme?: string;
  host?: string;
  pathPrefix?: string;
};

type IntentFilter = {
  autoVerify?: boolean;
  data?: IntentFilterData | IntentFilterData[];
};

type ExpoConfig = {
  expo: {
    android: {
      intentFilters: IntentFilter[];
    };
  };
};

declare const require: (id: string) => ExpoConfig;

describe('android app link intent filters', () => {
  it('auto-verifies the shared quote path beside the invoice path', () => {
    const config = require('../../app.config.js');
    const verified = config.expo.android.intentFilters.filter((filter) => filter.autoVerify === true);
    const prefixes = verified.flatMap((filter) => {
      const data = filter.data;
      const entries = Array.isArray(data) ? data : data ? [data] : [];
      return entries
        .filter((entry) => entry.scheme === 'https' && entry.host === 'easybiz.iamjeevan.com')
        .map((entry) => entry.pathPrefix);
    });

    expect(prefixes).toEqual(['/shared/invoice/', '/shared/quote/']);
  });
});
