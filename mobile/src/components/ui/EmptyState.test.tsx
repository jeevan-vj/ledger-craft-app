import React from 'react';
import { render } from '@testing-library/react-native';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('allows a light link label on a dark denied-state background', () => {
    const { getByText } = render(
      <EmptyState title="Import access restricted" actionLabel="Go back" actionVariant="link" onAction={() => undefined} />,
    );

    expect(getByText('Go back')).toHaveStyle({ color: '#9FE870' });
  });
});
