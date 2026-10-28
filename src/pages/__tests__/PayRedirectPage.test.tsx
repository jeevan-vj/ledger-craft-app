import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import PayRedirectPage from '../PayRedirectPage';

describe('PayRedirectPage', () => {
  afterEach(() => {
    document.querySelector('meta[name="referrer"]')?.remove();
  });

  it('prevents the public payment token from being sent as a referrer', () => {
    render(
      <MemoryRouter initialEntries={['/pay/payment-token?status=success']}>
        <Routes>
          <Route path="/pay/:token" element={<PayRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
  });
});
