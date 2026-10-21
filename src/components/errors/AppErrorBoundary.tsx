import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AppErrorFallback } from '@/components/errors/AppErrorFallback';
import { captureAppError } from '@/lib/sentry/init';

type AppErrorBoundaryProps = {
  children: ReactNode;
  onReload?: () => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  eventId?: string;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const eventId = captureAppError(error, info.componentStack);
    if (eventId) this.setState({ eventId });
  }

  render() {
    if (this.state.hasError) {
      return <AppErrorFallback eventId={this.state.eventId} onReload={this.props.onReload} />;
    }
    return this.props.children;
  }
}
