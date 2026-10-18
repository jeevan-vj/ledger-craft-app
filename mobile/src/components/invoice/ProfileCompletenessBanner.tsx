import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  describeMissingFields,
  getMissingProfileFields,
  type ProfileCompletenessInput,
} from '@/utils/profileCompleteness';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

let dismissedThisSession = false;

interface ProfileCompletenessBannerProps {
  profile: ProfileCompletenessInput | null | undefined;
  onCompleteProfile?: () => void;
}

export function ProfileCompletenessBanner({
  profile,
  onCompleteProfile,
}: ProfileCompletenessBannerProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const missing = getMissingProfileFields(profile);

  if (dismissed || missing.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    dismissedThisSession = true;
    setDismissed(true);
  };

  return (
    <View style={styles.banner} testID="profile-completeness-banner">
      <View style={styles.copy}>
        <Text style={styles.title}>Add {describeMissingFields(missing)} before you send</Text>
        <Text style={styles.subtitle}>Optional, but invoices look complete with it.</Text>
        {onCompleteProfile ? (
          <Pressable
            onPress={onCompleteProfile}
            accessibilityRole="button"
            accessibilityLabel="Update business profile"
            style={styles.linkHit}
          >
            <Text style={styles.link}>Update business profile</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Skip business profile reminder"
        testID="profile-completeness-dismiss"
        style={styles.linkHit}
      >
        <Text style={styles.dismiss}>Skip</Text>
      </Pressable>
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    backgroundColor: palette.accentFill,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: space.lg,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  subtitle: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 3,
  },
  linkHit: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.accentText,
  },
  dismiss: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: '500',
  },
});
