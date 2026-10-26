import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { EmptyState, ModernButton } from '@/components/ui';
import { documentImportApi } from '@/features/invoice-import/api/documentImportApi';
import type { RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { radius, space } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportOriginal'>;

export default function ImportOriginalScreen({ route }: Props) {
  const theme = useTheme(); const styles = createStyles(theme);
  const [uri, setUri] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; let objectUrl: string | null = null;
    void documentImportApi.downloadOriginal(route.params.importId, route.params.filename).then((value) => { if (active) { objectUrl = value.startsWith('blob:') ? value : null; setUri(value); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'The original could not be opened.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [route.params.filename, route.params.importId]);
  if (error) return <View style={styles.state}><EmptyState title="Couldn't open the original" description={error} /></View>;
  if (!uri) return <View style={styles.state}><ActivityIndicator size="large" color={theme.colors.accent} accessibilityLabel="Loading original document" /><Text style={styles.loading}>Loading original</Text></View>;
  return <View style={styles.container}>
    {route.params.mimeType.startsWith('image/') ? <Image source={{ uri }} resizeMode="contain" style={styles.image} accessibilityLabel={`Original document ${route.params.filename}`} /> : <View style={styles.pdf}><View style={styles.icon}><Feather name="file-text" size={52} color={theme.colors.accentText} /></View><Text style={styles.title}>{route.params.filename}</Text><Text style={styles.subtitle}>The original PDF was downloaded securely.</Text><ModernButton onPress={() => void Linking.openURL(uri)}>Open PDF</ModernButton></View>}
  </View>;
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: space.screen }, state: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: space.screen }, loading: { ...type.subhead, marginTop: space.md }, image: { width: '100%', height: '100%' }, pdf: { flex: 1, alignItems: 'center', justifyContent: 'center' }, icon: { width: 104, height: 128, borderRadius: radius.lg, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' }, title: { ...type.headline, textAlign: 'center', marginTop: space.xl }, subtitle: { ...type.footnote, textAlign: 'center', marginTop: space.xs, marginBottom: space.xl },
});
