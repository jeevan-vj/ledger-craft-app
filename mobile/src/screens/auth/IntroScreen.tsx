import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ModernButton } from '@/components/ui/ModernButton';
import type { AuthStackParamList } from '@/navigation/types';
import { onboardingStorage } from '@/features/onboarding/onboardingStorage';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'Intro'>;
type FeatherName = React.ComponentProps<typeof Feather>['name'];

const slides: { icon: FeatherName; eyebrow: string; title: string; body: string }[] = [
  {
    icon: 'file-text',
    eyebrow: 'INVOICE WITH CONFIDENCE',
    title: 'Get paid without the paperwork',
    body: 'Create clear invoices, share them securely, and see what is still outstanding.',
  },
  {
    icon: 'bar-chart-2',
    eyebrow: 'KNOW YOUR NUMBERS',
    title: 'See the story behind every dollar',
    body: 'Keep income, expenses, purchases, and GST in one calm view built for small business.',
  },
  {
    icon: 'refresh-cw',
    eyebrow: 'WORK WHEREVER YOU ARE',
    title: 'Keep the business moving',
    body: 'Manage customers, banking, and bills from the same secure workspace on the go.',
  },
];

export default function IntroScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<Navigation>();
  const [index, setIndex] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    onboardingStorage.hasSeenIntro()
      .then((seen) => {
        if (seen) navigation.replace('Login');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigation]);

  const move = (next: number) => setIndex(next);

  const leave = async (route: 'Signup' | 'Login') => {
    await onboardingStorage.markIntroSeen().catch(() => undefined);
    navigation.replace(route);
  };

  if (checking) return <SafeAreaView style={styles.screen} />;
  const slide = slides[index];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>LedgerCraft</Text>
        <Text style={styles.counter} accessibilityLabel={`Page ${index + 1} of ${slides.length}`}>
          {index + 1}/{slides.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.heroScroll}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          key={slide.title}
          entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}
          style={styles.hero}
        >
          <View style={styles.illustration} accessible={false}>
            <View style={styles.phone}>
              <View style={styles.phoneBar} />
              <View style={styles.phoneLine} />
              <View style={[styles.phoneLine, styles.phoneLineShort]} />
              <View style={styles.phoneAmount} />
            </View>
            <View style={styles.iconBubble}>
              <Feather name={slide.icon} size={30} color={theme.colors.accentForeground} />
            </View>
            <View style={styles.successBubble}>
              <Feather name="check" size={20} color={theme.colors.accentForeground} />
            </View>
          </View>
          <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </Animated.View>
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.pagination} accessibilityRole="tablist">
          {slides.map((item, itemIndex) => (
            <View
              key={item.title}
              style={[styles.dot, itemIndex === index && styles.dotActive]}
              accessibilityLabel={`Page ${itemIndex + 1}`}
              accessibilityState={{ selected: itemIndex === index }}
            />
          ))}
        </View>
        <View style={styles.slideActions}>
          <ModernButton
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onPress={() => move(index - 1)}
          >
            Previous
          </ModernButton>
          <ModernButton
            variant="secondary"
            size="sm"
            disabled={index === slides.length - 1}
            onPress={() => move(index + 1)}
          >
            Next
          </ModernButton>
        </View>
        <ModernButton fullWidth size="lg" onPress={() => void leave('Signup')}>
          Create an account
        </ModernButton>
        <ModernButton fullWidth size="md" variant="ghost" onPress={() => void leave('Login')}>
          Log in
        </ModernButton>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  topBar: {
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { ...theme.type.headline },
  counter: { ...theme.type.caption },
  heroScroll: { flexGrow: 1, justifyContent: 'center' },
  hero: { paddingHorizontal: space.xxl, paddingVertical: space.xl },
  illustration: {
    height: 260,
    marginBottom: space.section,
    borderRadius: radius.xl,
    backgroundColor: theme.colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  phone: {
    width: 142,
    height: 204,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.surface,
    padding: space.xl,
  },
  phoneBar: { width: 42, height: 5, borderRadius: 3, backgroundColor: theme.colors.separator, alignSelf: 'center', marginBottom: 32 },
  phoneLine: { height: 10, borderRadius: 5, backgroundColor: theme.colors.fill, marginBottom: space.md },
  phoneLineShort: { width: '62%' },
  phoneAmount: { height: 38, borderRadius: radius.sm, backgroundColor: theme.colors.accent, marginTop: space.lg },
  iconBubble: {
    position: 'absolute', right: 42, top: 34, width: 64, height: 64,
    borderRadius: 32, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  successBubble: {
    position: 'absolute', left: 46, bottom: 36, width: 44, height: 44,
    borderRadius: 22, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { ...theme.type.section, color: theme.colors.accentText, marginBottom: space.md },
  title: { ...theme.type.display, marginBottom: space.md },
  body: { ...theme.type.body, color: theme.colors.textSecondary, lineHeight: 25 },
  bottom: { paddingHorizontal: space.xxl, paddingBottom: space.lg, gap: space.sm },
  pagination: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.fill },
  dotActive: { width: 28, backgroundColor: theme.colors.accent },
  slideActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
});
