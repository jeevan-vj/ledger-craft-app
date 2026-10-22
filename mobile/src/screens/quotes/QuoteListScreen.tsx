import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SalesDocumentSwitch } from '@/components/quotes/SalesDocumentSwitch';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterPills } from '@/components/ui/FilterPills';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import { quoteKindLabel, quoteStatusLabel } from '@/features/quotes/quoteModel';
import type { InvoiceStackParamList } from '@/navigation/types';
import type { Quote, QuoteStatus } from '@/types/quote';
import { EMPTY_QUOTE_COUNTS } from '@/types/quote';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<InvoiceStackParamList, 'QuoteList'>;
type Filter = 'all' | QuoteStatus;

const FILTERS: readonly Filter[] = ['all', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted'];

export default function QuoteListScreen() {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<Navigation>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const quotes = useQuery({ queryKey: ['quotes', 'list'], queryFn: () => quotesApi.list() });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Quotes',
      headerSearchBarOptions: Platform.OS === 'ios' ? {
        placeholder: 'Search quotes',
        hideWhenScrolling: true,
        onChangeText: (event) => setSearch(event.nativeEvent.text),
      } : undefined,
      headerRight: () => (
        <NativeHeaderButton
          label="New"
          primary
          accessibilityHint="Creates a quote or estimate"
          onPress={() => navigation.navigate('QuoteCreate')}
        />
      ),
    });
  }, [navigation]);

  const counts = quotes.data?.counts ?? EMPTY_QUOTE_COUNTS;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (quotes.data?.quotes ?? []).filter((quote) => {
      if (filter !== 'all' && quote.status !== filter) return false;
      if (!needle) return true;
      return quote.quoteNumber.toLowerCase().includes(needle)
        || (quote.customerName ?? '').toLowerCase().includes(needle);
    });
  }, [filter, quotes.data?.quotes, search]);

  const offline = !onlineManager.isOnline();
  const errorText = quotes.error instanceof Error
    ? (offline ? 'You are offline. Pull to retry when you are back online.' : quotes.error.message)
    : null;

  if (quotes.isLoading && quotes.data === undefined) {
    return (
      <View style={styles.container}>
        <SalesDocumentSwitch value="quotes" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading quotes" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SalesDocumentSwitch value="quotes" />
      {Platform.OS === 'android' ? (
        <View style={styles.search}>
          <Feather name="search" size={18} color={palette.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search quotes"
            placeholderTextColor={palette.textTertiary}
            style={styles.searchInput}
            accessibilityLabel="Search quotes"
          />
        </View>
      ) : null}
      <FilterPills
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        labels={{
          all: `All ${quotes.data?.quotes.length ?? 0}`,
          draft: `Draft ${counts.draft}`,
          sent: `Sent ${counts.sent}`,
          viewed: `Viewed ${counts.viewed}`,
          accepted: `Accepted ${counts.accepted}`,
          declined: `Declined ${counts.declined}`,
          expired: `Expired ${counts.expired}`,
          converted: `Converted ${counts.converted}`,
        }}
      />
      {errorText && quotes.data ? (
        <AppPressable
          onPress={() => quotes.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading quotes"
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        >
          <Text style={styles.bannerText}>{errorText} Tap to retry.</Text>
        </AppPressable>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={quotes.isRefetching} onRefresh={() => quotes.refetch()} tintColor={palette.accent} colors={[palette.accent]} />}
        renderItem={({ item, index }) => (
          <QuoteRow
            quote={item}
            first={index === 0}
            last={index === rows.length - 1}
            onPress={() => navigation.navigate('QuoteDetail', { quoteId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title={errorText ? 'Couldn’t load quotes' : search || filter !== 'all' ? 'No matching quotes' : 'No quotes yet'}
            description={errorText ?? (search || filter !== 'all' ? 'Try a different search or status.' : 'Create a quote or estimate, then share it with your customer.')}
            actionLabel={errorText ? 'Try again' : search || filter !== 'all' ? 'Show all' : 'New quote'}
            onAction={errorText ? () => quotes.refetch() : search || filter !== 'all' ? () => { setSearch(''); setFilter('all'); } : () => navigation.navigate('QuoteCreate')}
          />
        }
      />
    </View>
  );
}

function QuoteRow({ quote, first, last, onPress }: { quote: Quote; first: boolean; last: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const color = statusColor(quote.status, palette);
  return (
    <AppPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${quoteKindLabel(quote.kind)} ${quote.quoteNumber}, ${quote.customerName ?? 'No customer'}, ${quoteStatusLabel(quote.status)}, ${formatMoney(quote.total, quote.currency)}`}
      accessibilityHint="Opens quote details"
      style={({ pressed }) => [styles.row, first && styles.first, last && styles.last, pressed && styles.pressed]}
    >
      <View style={[styles.iconWell, { backgroundColor: `${color}18` }]}>
        <Feather name="file-text" size={18} color={color} />
      </View>
      <View style={styles.copy}>
        <Text style={type.callout} numberOfLines={1}>{quote.customerName || 'No customer'}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{quote.quoteNumber} · {quoteKindLabel(quote.kind)} · valid {quote.expiryDate}</Text>
      </View>
      <View style={styles.amountCopy}>
        <Text style={styles.amount}>{formatMoney(quote.total, quote.currency)}</Text>
        <Text style={[styles.status, { color }]}>{quoteStatusLabel(quote.status)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.textTertiary} />
    </AppPressable>
  );
}

function statusColor(status: QuoteStatus, palette: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'accepted':
    case 'converted':
      return palette.success;
    case 'declined':
    case 'expired':
      return palette.danger;
    case 'sent':
    case 'viewed':
      return palette.accentText;
    default:
      return palette.textSecondary;
  }
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.screen,
    marginBottom: space.sm,
    backgroundColor: palette.fill,
    borderRadius: 20,
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 8,
  },
  searchInput: { flex: 1, ...type.body, color: palette.text },
  content: { paddingHorizontal: space.screen, paddingTop: space.sm },
  banner: {
    marginHorizontal: space.screen,
    marginBottom: space.sm,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: palette.dangerFill,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  bannerText: { ...type.footnote, color: palette.danger, fontWeight: '600' },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    backgroundColor: palette.surface,
  },
  first: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  last: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, marginBottom: space.md },
  pressed: { backgroundColor: palette.fillMuted },
  iconWell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  subtitle: { ...type.footnote, marginTop: 2 },
  amountCopy: { alignItems: 'flex-end' },
  amount: { ...type.callout, fontVariant: ['tabular-nums'] },
  status: { ...type.caption, marginTop: 2, textTransform: 'capitalize' },
});
