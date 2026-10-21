import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconWell } from '@/components/ui/IconWell';
import { captureRenderError } from '@/observability/sentry';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureRenderError(error, info.componentStack ?? undefined);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return <CrashFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + space.section,
          paddingBottom: insets.bottom + space.xl,
        },
      ]}
    >
      <IconWell size={64} primary>
        <Feather name="alert-circle" size={28} color={theme.colors.accentForeground} />
      </IconWell>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.title, theme.type.title]}
      >
        Something went wrong
      </Text>
      <Text style={[styles.body, theme.type.subhead]}>
        This screen ran into a problem. You can try again. If it keeps happening, force-quit the app and open it again.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const createStyles = ({ colors }: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.screen,
  },
  title: {
    marginTop: space.xl,
    textAlign: 'center',
  },
  body: {
    marginTop: space.md,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    marginTop: space.section,
    minHeight: control.prominent,
    paddingHorizontal: space.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    color: colors.accentForeground,
    fontSize: 16,
    fontWeight: '600',
  },
});
