import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppErrorBoundary } from './AppErrorBoundary';
import { captureRenderError } from '@/observability/sentry';

jest.mock('@/observability/sentry', () => ({
  captureRenderError: jest.fn(),
}));

function Boom(): React.ReactElement {
  throw new Error('boom secret');
}

const crashGate = { failed: true };

function Flaky(): React.ReactElement {
  if (crashGate.failed) throw new Error('boom secret');
  return <Text>Back in business</Text>;
}

const initialMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderBoundary(children: React.ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </SafeAreaProvider>,
  );
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    crashGate.failed = true;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.mocked(captureRenderError).mockClear();
  });

  afterEach(() => {
    jest.mocked(console.error).mockRestore();
  });

  it('shows a retry screen and reports the crash without the raw error', () => {
    const screen = renderBoundary(<Boom />);

    expect(screen.getByText('Something went wrong')).toHaveProp('accessibilityRole', 'alert');
    expect(screen.queryByText('boom secret')).toBeNull();
    expect(screen.getByLabelText('Try again')).toHaveStyle({ backgroundColor: '#9FE870' });
    expect(screen.getByText('Try again')).toHaveStyle({ color: '#163300' });
    expect(captureRenderError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
    expect(jest.mocked(captureRenderError).mock.calls[0]?.[0]).toMatchObject({ message: 'boom secret' });
  });

  it('renders the child again after retry', () => {
    const screen = renderBoundary(<Flaky />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    crashGate.failed = false;
    fireEvent.press(screen.getByLabelText('Try again'));

    expect(screen.getByText('Back in business')).toBeTruthy();
  });
});
