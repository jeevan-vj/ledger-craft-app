import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { useQuery } from '@tanstack/react-query';
import type { AssistantPart, AssistantProposal } from '@ledgercraft/contracts';
import { AppPressable, PillButton } from '@/components/ui';
import { ProposalCard } from '@/components/assistant/ProposalCard';
import { askAssistant, saveAssistantDraft } from '@/features/assistant/api/assistantApi';
import { assistantScreenLink } from '@/features/assistant/model/assistantLinks';
import { readAssistantFailure, type AssistantFailure } from '@/features/assistant/model/assistantFailure';
import {
  applyCustomerPick,
  buildSaveBody,
  draftFromProposal,
  type ProposalDraft,
} from '@/features/assistant/model/proposalDraft';
import type { HomeStackParamList, MainTabParamList } from '@/navigation/types';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { useTheme } from '@/theme';
import { randomId } from '@/utils/id';

type AssistantNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Assistant'>,
  NativeBottomTabNavigationProp<MainTabParamList>
>;

type UserTurn = { kind: 'user'; id: string; text: string };
type AssistantTurn = { kind: 'assistant'; id: string; conversationId: string; parts: AssistantPart[] };
type ThreadItem = UserTurn | AssistantTurn;

export default function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AssistantNavigation>();
  const capabilities = useQuery({ queryKey: ['server-capabilities'], queryFn: getServerCapabilities, staleTime: Infinity });
  const [composer, setComposer] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProposalDraft>>({});
  const [running, setRunning] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<AssistantFailure | null>(null);
  const savingRef = useRef<string | null>(null);
  const saveKeys = useRef(new Map<string, string>());
  const abortRef = useRef<AbortController | null>(null);

  const openForm = (href = '/invoices/new') => {
    const link = assistantScreenLink(href);
    navigation.navigate(link.tab, link.params);
  };

  const submit = async (raw: string) => {
    const message = raw.trim();
    if (!message || running) return;
    const id = randomId();
    setFailure(null);
    setComposer('');
    setItems((current) => [...current, { kind: 'user', id, text: message }]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await askAssistant(conversationId ? { conversationId, message } : { message }, controller.signal);
      setConversationId(reply.conversationId);
      setDrafts((current) => {
        const next = { ...current };
        for (const part of reply.parts) {
          if (part.type === 'proposal' && !next[part.proposal.id]) next[part.proposal.id] = draftFromProposal(part.proposal);
        }
        return next;
      });
      setItems((current) => [...current, { kind: 'assistant', id: randomId(), conversationId: reply.conversationId, parts: reply.parts }]);
    } catch (error) {
      setItems((current) => current.filter((item) => item.id !== id));
      setComposer(message);
      if (!controller.signal.aborted) setFailure(readAssistantFailure(error));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const save = async (turnId: string, proposal: AssistantProposal) => {
    if (savingRef.current) return;
    const draft = drafts[proposal.id] ?? draftFromProposal(proposal);
    const body = buildSaveBody(turnId, proposal, draft);
    const stamp = JSON.stringify(body);
    const key = saveKeys.current.get(stamp) ?? randomId();
    saveKeys.current.set(stamp, key);
    savingRef.current = proposal.id;
    setSavingId(proposal.id);
    setFailure(null);
    try {
      const saved = await saveAssistantDraft(body, key);
      navigation.navigate('Invoices', assistantScreenLink(`/invoices/${saved.id.toLowerCase()}`).params);
    } catch (error) {
      if (!savingRef.current) return;
      setFailure(readAssistantFailure(error));
    } finally {
      savingRef.current = null;
      setSavingId(null);
    }
  };

  const pick = (turn: AssistantTurn, field: 'customerId' | 'itemId', option: { id: string; label: string }) => {
    const proposal = turn.parts.find((part) => part.type === 'proposal');
    if (field === 'customerId' && proposal?.type === 'proposal') {
      setDrafts((current) => {
        const draft = current[proposal.proposal.id] ?? draftFromProposal(proposal.proposal);
        return { ...current, [proposal.proposal.id]: applyCustomerPick(draft, option.id, option.label) };
      });
      return;
    }
    void submit(`Use ${option.label}`);
  };

  if (capabilities.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} accessibilityLabel="Checking the assistant" />
      </View>
    );
  }

  if (capabilities.data?.assistant !== 'available') {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.colors.background }]}>
        <Text style={theme.type.headline}>The assistant is turned off.</Text>
        <Text style={theme.type.subhead}>Use the invoice form to continue.</Text>
        <PillButton label="Open the invoice form" onPress={() => openForm('/invoices/new')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      accessibilityLabel="Assistant conversation"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.thread}
      >
        {items.map((item) => item.kind === 'user' ? (
          <Text key={item.id} style={[theme.type.body, styles.user, { color: theme.colors.text }]}>{item.text}</Text>
        ) : (
          <View key={item.id} style={styles.reply}>
            {item.parts.map((part, index) => {
              if (part.type === 'text') return <Text key={index} style={theme.type.body}>{part.text}</Text>;
              if (part.type === 'link') {
                return (
                  <AppPressable key={index} accessibilityRole="link" accessibilityLabel={part.label} onPress={() => openForm(part.href)} style={styles.link}>
                    <Text style={[theme.type.callout, { color: theme.colors.accentText }]}>{part.label}</Text>
                  </AppPressable>
                );
              }
              if (part.type === 'quick_picks') {
                return (
                  <View key={index} accessibilityLabel={part.prompt}>
                    <Text style={theme.type.subhead}>{part.prompt}</Text>
                    <View style={styles.picks}>
                      {part.options.map((option) => (
                        <AppPressable
                          key={option.id}
                          accessibilityRole="button"
                          accessibilityLabel={option.label}
                          accessibilityHint={part.prompt}
                          onPress={() => pick(item, part.field, option)}
                          style={[styles.chip, { backgroundColor: theme.colors.accentFill, minHeight: theme.control.default }]}
                        >
                          <Text style={[theme.type.callout, { color: theme.colors.accentText }]}>{option.label}</Text>
                        </AppPressable>
                      ))}
                    </View>
                  </View>
                );
              }
              const draft = drafts[part.proposal.id] ?? draftFromProposal(part.proposal);
              return (
                <ProposalCard
                  key={part.proposal.id}
                  proposal={part.proposal}
                  draft={draft}
                  saving={savingId === part.proposal.id}
                  onChange={(next) => setDrafts((current) => ({ ...current, [part.proposal.id]: next }))}
                  onSave={() => { void save(item.conversationId, part.proposal); }}
                />
              );
            })}
          </View>
        ))}
        {running ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Assistant is working" style={styles.progress}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={theme.type.body}>Working on that</Text>
            <PillButton label="Cancel" variant="secondary" onPress={cancel} />
          </View>
        ) : null}
        {failure ? (
          <View accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.colors.dangerFill }]}>
            <Text style={[theme.type.body, { color: theme.colors.danger }]}>{failure.message}</Text>
            <PillButton label="Open the invoice form" variant="secondary" onPress={() => openForm('/invoices/new')} />
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.composer, { borderTopColor: theme.colors.separator, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          accessibilityLabel="Message"
          value={composer}
          onChangeText={setComposer}
          editable={!running}
          placeholder="Ask about an invoice"
          placeholderTextColor={theme.colors.textTertiary}
          style={[styles.input, theme.type.body, { color: theme.colors.text, backgroundColor: theme.colors.fill, minHeight: theme.control.default }]}
          multiline
        />
        <PillButton label="Ask" disabled={running || composer.trim().length === 0} onPress={() => { void submit(composer); }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fallback: { flex: 1, justifyContent: 'center', gap: 12, padding: 20 },
  thread: { padding: 20, gap: 16 },
  reply: { gap: 12 },
  user: { textAlign: 'right' },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center' },
  link: { minHeight: 48, justifyContent: 'center' },
  progress: { gap: 8 },
  error: { borderRadius: 16, padding: 12, gap: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
});
