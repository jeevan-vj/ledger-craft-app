import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GstRoundingLine } from './GstRoundingLine';

describe('GST rounding disclosure', () => {
  it('shows the signed ledger-versus-form difference outside Boxes 9 and 13', () => {
    render(<GstRoundingLine calculation={{ version: 'gst-ledger-v3', rounding: { output: '-0.01', input: '0.00' }, roundingReviewRequired: false } as never} />);
    expect(screen.getByText(/output -0.01, input 0.00/)).toBeInTheDocument();
    expect(screen.getByText(/not included in Box 9 or Box 13/)).toBeInTheDocument();
  });

  it('leaves a saved v2 snapshot without a rounding line', () => {
    const view = render(<GstRoundingLine calculation={{ version: 'gst-ledger-v2' } as never} />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
