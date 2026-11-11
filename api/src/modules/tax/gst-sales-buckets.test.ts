import { describe, expect, it } from 'vitest';
import { plugLargestBucket } from './gst-sales-buckets';

describe('plugLargestBucket', () => {
  it('puts the rounding cent on the largest supply so the parts equal the allocated total', () => {
    expect(plugLargestBucket({ zeroRated: '50.01', exempt: '50.01', unclassified: '0.00' }, '100.01')).toEqual({
      zeroRated: '50.00', exempt: '50.01', unclassified: '0.00',
    });
    expect(plugLargestBucket({ zeroRated: '2000.00', exempt: '0.00', unclassified: '0.00' }, '2000.00')).toEqual({
      zeroRated: '2000.00', exempt: '0.00', unclassified: '0.00',
    });
  });
});