# Quick Reference: New Invoice UI Components

## 🚀 How to Use the New Components

### 1. AnimatedTotal

Display animated currency amounts with smooth counting animation.

```tsx
import { AnimatedTotal } from '@/components/ui/AnimatedTotal';

<AnimatedTotal 
  amount={1234.50} 
  currency="NZD" 
  size="medium"  // 'small' | 'medium' | 'large'
  showLabel={true}
/>
```

**Features**:
- Counts from previous to new amount (600ms)
- Scale spring animation on change
- Customizable size and currency

---

### 2. FloatingInvoiceHeader

Sticky header with blur effect and real-time total.

```tsx
import { FloatingInvoiceHeader } from '@/components/invoice/FloatingInvoiceHeader';

<FloatingInvoiceHeader
  invoiceNumber="INV-2026-0044"
  total={1234.50}
  currency="NZD"
/>
```

**Features**:
- Glassmorphism blur effect (iOS)
- Absolute positioning with zIndex
- Safe area insets handled
- Animated entrance

---

### 3. SmartDatePicker

Date picker with business presets.

```tsx
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';

<SmartDatePicker
  label="Due Date"
  value="2026-02-04"  // ISO date string
  onChangeDate={(date) => setDueDate(date)}
  minimumDate={new Date()}  // Optional
/>
```

**Presets**:
- Due on Receipt (today)
- Net 7 (7 days)
- Net 15 (15 days)
- Net 30 (30 days)
- Custom Date

**Platform Differences**:
- iOS: Inline spinner picker
- Android: Native modal picker

---

### 4. CompactLineItem

Swipe-to-delete line item card.

```tsx
import { CompactLineItem } from '@/components/invoice/CompactLineItem';

<CompactLineItem
  item={lineItem}
  index={0}
  onUpdate={(index, field, value) => updateItem(index, field, value)}
  onRemove={(index) => removeItem(index)}
  onSelectItem={(index) => openItemPicker(index)}
  canRemove={items.length > 1}
  formatCurrency={(amount) => `$${amount.toFixed(2)}`}
/>
```

**Gestures**:
- Tap: Open edit modal
- Swipe left: Delete (if canRemove)
- Swipe threshold: -60px

---

### 5. TaxConfigCard

Tax configuration with radio options.

```tsx
import { TaxConfigCard } from '@/components/invoice/TaxConfigCard';

<TaxConfigCard
  taxEnabled={true}
  taxRate={15}
  subtotal={1000}
  taxAmount={150}
  total={1150}
  onTaxEnabledChange={(enabled) => setTaxEnabled(enabled)}
  onTaxRateChange={(rate) => setTaxRate(rate)}
  formatCurrency={(amount) => `$${amount.toFixed(2)}`}
/>
```

**Options**:
- No Tax
- GST (15%) - New Zealand
- Custom Rate (with input)

---

### 6. ProgressIndicator

Visual progress tracker.

```tsx
import { ProgressIndicator } from '@/components/invoice/ProgressIndicator';

<ProgressIndicator
  steps={[
    { label: 'Customer', completed: true },
    { label: 'Items', completed: false },
    { label: 'Review', completed: false },
  ]}
/>
```

**Features**:
- Checkmarks for completed steps
- Animated progress bar
- Color-coded status

---

### 7. FloatingActionButton

FAB with action menu.

```tsx
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';

<FloatingActionButton
  onAddFromCatalog={() => openCatalog()}
  onAddCustomItem={() => addNewItem()}
  onDuplicateLastItem={() => duplicateItem()}  // Optional
  hasItems={items.length > 0}
/>
```

**Features**:
- Rotates 45° when menu opens
- Gradient background
- Haptic feedback
- Conditional "Duplicate" option

---

## 🎨 Haptic Feedback Guide

Use `expo-haptics` for tactile feedback:

```tsx
import * as Haptics from 'expo-haptics';

// Light tap (button press, selection)
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// Medium tap (significant action)
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

// Success notification
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// Warning (delete, discard)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

// Error
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
```

---

## 🎬 Animation Patterns

### Spring Animation (Natural Physics)

```tsx
import { useSharedValue, withSpring } from 'react-native-reanimated';

const scale = useSharedValue(1);
scale.value = withSpring(1.1, { damping: 10, stiffness: 200 });
```

### Timed Animation (Controlled)

```tsx
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';

const translateX = useSharedValue(0);
translateX.value = withTiming(100, {
  duration: 300,
  easing: Easing.out(Easing.cubic),
});
```

### Entrance Animation

```tsx
import Animated, { FadeInDown } from 'react-native-reanimated';

<Animated.View entering={FadeInDown.duration(400)}>
  {/* Content */}
</Animated.View>
```

---

## 🎯 Design Tokens

### Colors

```tsx
const colors = {
  primary: '#5B72EE',
  primaryDark: '#4A5FD8',
  accent: '#00D4FF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  border: '#e2e8f0',
};
```

### Spacing

```tsx
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};
```

### Border Radius

```tsx
const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};
```

### Shadows

```tsx
// iOS
shadowColor: '#000',
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.1,
shadowRadius: 8,

// Android
elevation: 3,
```

---

## 🧪 Testing Tips

### 1. Physical Device Required
- Haptics don't work in simulator
- Gestures feel different on device
- Performance varies

### 2. Test Both Platforms
```bash
# iOS
npm run ios

# Android
npm run android
```

### 3. Date Picker Testing
- iOS: Test inline spinner
- Android: Test native modal
- Both: Test minimum date validation

### 4. Animation Performance
- Test on mid-range devices
- Check for frame drops
- Reduce animation duration if needed

---

## 🔧 Common Customizations

### Change Primary Color

Update all components:

```tsx
// In each component's StyleSheet
{
  backgroundColor: '#YOUR_COLOR',  // Instead of #5B72EE
  borderColor: '#YOUR_COLOR',
  color: '#YOUR_COLOR',
}
```

### Adjust Animation Speed

```tsx
// Faster
withTiming(value, { duration: 200 });

// Slower
withTiming(value, { duration: 800 });
```

### Customize Tax Presets

In `TaxConfigCard.tsx`:

```tsx
// Add more tax options
<TouchableOpacity onPress={() => handleOptionSelect('vat')}>
  <Text>VAT (20%)</Text>
</TouchableOpacity>
```

### Change Date Presets

In `SmartDatePicker.tsx`:

```tsx
const DATE_PRESETS = [
  { label: 'Same Day', days: 0, icon: '⚡' },
  { label: 'Net 14', days: 14, icon: '📅' },
  { label: 'Net 60', days: 60, icon: '🗓️' },
];
```

---

## 📝 TypeScript Tips

### LineItem Type

```tsx
interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
}
```

### Date Format

Always use ISO strings:

```tsx
const date: string = '2026-01-06';  // YYYY-MM-DD
const isoDate = new Date().toISOString().split('T')[0];
```

### Currency Formatting

```tsx
const formatCurrency = (amount: number, currency: string = 'NZD') => {
  const symbol = currency === 'NZD' ? '$' : currency;
  return `${symbol}${amount.toFixed(2)}`;
};
```

---

## 🐛 Troubleshooting

### Issue: Haptics Not Working
**Solution**: Test on physical device, not simulator

### Issue: Blur Effect Not Showing
**Solution**: Check iOS version (BlurView requires iOS 13+)

### Issue: Date Picker Crashes
**Solution**: Ensure `@react-native-community/datetimepicker` is installed

### Issue: Swipe Gesture Not Working
**Solution**: Wrap with `GestureHandlerRootView` in app root

### Issue: FAB Positioning Off
**Solution**: Check safe area insets calculation

---

## 📚 Further Reading

- [React Native Reanimated Docs](https://docs.swmansion.com/react-native-reanimated/)
- [Expo Haptics API](https://docs.expo.dev/versions/latest/sdk/haptics/)
- [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/)
- [Expo Blur](https://docs.expo.dev/versions/latest/sdk/blur-view/)

---

**Happy Coding! 🚀**


