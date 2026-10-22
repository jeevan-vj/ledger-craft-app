import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '@/navigation/types';
import { GroupedSection, ListRow, ModernButton, ModernInput, AppPressable, EmptyState } from '@/components/ui';
import { useTheme } from '@/theme';
import { organisationService, type OrganisationInvitation, type OrganisationMember, type OrganisationRole, type OrganisationSummary } from '@/services/organisationService';
import { clearServerState } from '@/lib/queryClient';
import { useAuth } from '@/store';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'CompanyTeam'>;
type InviteRole = Exclude<OrganisationRole, 'owner'>;
const roles: InviteRole[] = ['admin', 'accountant', 'member', 'read_only'];
const label = (role: OrganisationRole) => role.replace('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

export default function CompanyTeamScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Navigation>();
  const route = useRoute<RouteProp<MoreStackParamList, 'CompanyTeam'>>();
  const { refreshUser } = useAuth();
  const acceptedToken = useRef<string | null>(null);
  const [companies, setCompanies] = useState<OrganisationSummary[]>([]);
  const [members, setMembers] = useState<OrganisationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganisationInvitation[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [activeName, setActiveName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('member');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const active = companies.find((company) => company.isActive);
  const canManage = active?.role === 'owner' || active?.role === 'admin';

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await organisationService.list();
      setCompanies(data.organisations);
      const selected = data.organisations.find((company) => company.isActive);
      setActiveName(selected?.name ?? '');
      if (selected) {
        const [memberData, invitationData] = await Promise.all([organisationService.members(selected.id), organisationService.invitations(selected.id)]);
        setMembers(memberData.members); setInvitations(invitationData.invitations);
      } else { setMembers([]); setInvitations([]); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load company access.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const invite = route.params?.invite;
    if (!invite || acceptedToken.current === invite) return;
    acceptedToken.current = invite;
    void organisationService.accept(invite).then(async () => {
      clearServerState(); await refreshUser(); await load(); Alert.alert('Invitation accepted', 'The invited company is now active.');
    }).catch((reason) => Alert.alert('Could not accept invitation', reason instanceof Error ? reason.message : 'The link may have expired.'));
  }, [load, refreshUser, route.params?.invite]);

  const switchCompany = async (company: OrganisationSummary) => {
    if (company.isActive) return;
    try {
      await organisationService.switch(company.id); clearServerState(); await refreshUser();
      Alert.alert('Company switched', `${company.name} is now active.`); navigation.goBack();
    } catch (reason) { Alert.alert('Could not switch company', reason instanceof Error ? reason.message : 'Try again.'); }
  };
  const createCompany = async () => {
    if (companyName.trim().length < 2) return;
    try { await organisationService.create(companyName.trim()); clearServerState(); await refreshUser(); navigation.goBack(); }
    catch (reason) { Alert.alert('Could not create company', reason instanceof Error ? reason.message : 'Try again.'); }
  };
  const invite = async () => {
    if (!active || !email.trim()) return;
    try {
      const created = await organisationService.invite(active.id, email.trim(), role);
      await Share.share({ message: `Join ${active.name} in LedgerCraft: easybizinvoice://settings?invite=${created.acceptToken}` });
      setEmail(''); Alert.alert('Invitation link ready', 'Email delivery is unavailable, so share the secure seven-day link directly.');
    } catch (reason) { Alert.alert('Could not invite teammate', reason instanceof Error ? reason.message : 'Try again.'); }
  };
  const updateCompany = async () => {
    if (!active || activeName.trim().length < 2) return;
    try { await organisationService.update(active.id, activeName.trim()); await load(); }
    catch (reason) { Alert.alert('Could not update company', reason instanceof Error ? reason.message : 'Try again.'); }
  };
  const archiveCompany = () => {
    if (!active) return;
    Alert.alert('Archive company?', `${active.name} and its ledger will become unavailable.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => void organisationService.archive(active.id).then(async () => { clearServerState(); await refreshUser(); navigation.goBack(); }).catch((reason) => Alert.alert('Could not archive company', reason instanceof Error ? reason.message : 'Try again.')) },
    ]);
  };
  const manageMember = (member: OrganisationMember) => {
    if (!active || !canManage || member.role === 'owner') return;
    Alert.alert(member.name, 'Choose a role or remove this teammate.', [
      ...roles.map((nextRole) => ({ text: label(nextRole), onPress: () => void organisationService.updateMember(active.id, member.id, nextRole).then(load).catch((reason) => Alert.alert('Could not update role', reason instanceof Error ? reason.message : 'Try again.')) })),
      { text: 'Remove teammate', style: 'destructive' as const, onPress: () => void organisationService.removeMember(active.id, member.id).then(load).catch((reason) => Alert.alert('Could not remove teammate', reason instanceof Error ? reason.message : 'Try again.')) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  const shareInvitation = async (acceptToken: string) => Share.share({ message: `Join ${active?.name ?? 'this company'} in LedgerCraft: easybizinvoice://settings?invite=${acceptToken}` });
  const manageInvitation = (item: OrganisationInvitation) => {
    if (!active || !canManage) return;
    Alert.alert(item.email, 'Refresh the seven-day link or revoke this invitation.', [
      { text: 'Refresh & share', onPress: () => void organisationService.resendInvitation(active.id, item.id).then(async (created) => { await shareInvitation(created.acceptToken); await load(); }).catch((reason) => Alert.alert('Could not refresh invitation', reason instanceof Error ? reason.message : 'Try again.')) },
      { text: 'Revoke', style: 'destructive', onPress: () => void organisationService.revokeInvitation(active.id, item.id).then(load).catch((reason) => Alert.alert('Could not revoke invitation', reason instanceof Error ? reason.message : 'Try again.')) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><Text style={theme.type.body}>Loading company access…</Text></View>;
  if (error) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Couldn’t load company access" description={error} actionLabel="Try again" onAction={() => { setLoading(true); void load(); }} /></View>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <GroupedSection title="Companies" footer="Each company has a separate, isolated ledger.">
      {companies.filter((company) => !company.archivedAt).map((company) => <ListRow key={company.id} label={company.name} subtitle={label(company.role)} value={company.isActive ? 'Active' : undefined} icon={<Feather name="briefcase" size={18} color={theme.colors.accentText} />} onPress={company.isActive ? undefined : () => void switchCompany(company)} accessibilityHint={company.isActive ? undefined : `Switches to ${company.name}`} />)}
    </GroupedSection>
    <GroupedSection title="Create company"><View style={styles.form}><ModernInput label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="South Island Studio" autoCapitalize="words" /><ModernButton onPress={() => void createCompany()} disabled={companyName.trim().length < 2}>Create company</ModernButton></View></GroupedSection>
    {active && (active.role === 'owner' || active.role === 'admin') ? <GroupedSection title="Active company" footer="Archiving requires another active company."><View style={styles.form}><ModernInput label="Company name" value={activeName} onChangeText={setActiveName} autoCapitalize="words" /><ModernButton variant="secondary" onPress={() => void updateCompany()} disabled={activeName.trim().length < 2 || activeName.trim() === active.name}>Save name</ModernButton>{active.role === 'owner' && companies.filter((company) => !company.archivedAt).length > 1 ? <ModernButton variant="outline" onPress={archiveCompany}>Archive company</ModernButton> : null}</View></GroupedSection> : null}
    <GroupedSection title="Team" footer="Roles are enforced by the API, including direct requests.">
      {members.map((member) => <ListRow key={member.id} label={member.name} subtitle={member.email} value={label(member.role)} showChevron={canManage && member.role !== 'owner'} onPress={canManage && member.role !== 'owner' ? () => manageMember(member) : undefined} accessibilityHint={canManage && member.role !== 'owner' ? 'Changes this teammate role or removes access' : undefined} icon={<Feather name="user" size={18} color={theme.colors.accentText} />} />)}
    </GroupedSection>
    {invitations.some((item) => item.status === 'pending') ? <GroupedSection title="Pending invitations" footer="Tap an invitation to refresh its secure link or revoke it.">{invitations.filter((item) => item.status === 'pending').map((item) => <ListRow key={item.id} label={item.email} subtitle={`${label(item.role)} · expires ${new Date(item.expiresAt).toLocaleDateString()}`} showChevron={canManage} onPress={canManage ? () => manageInvitation(item) : undefined} icon={<Feather name="mail" size={18} color={theme.colors.accentText} />} />)}</GroupedSection> : null}
    {canManage ? <GroupedSection title="Invite teammate" footer="Email delivery is unavailable. LedgerCraft creates a secure link you can share."><View style={styles.form}><ModernInput label="Email" value={email} onChangeText={setEmail} placeholder="books@example.com" keyboardType="email-address" autoCapitalize="none" /><Text style={[theme.type.footnote, { color: theme.colors.textSecondary }]}>Role</Text><View style={styles.roles}>{roles.map((value) => <AppPressable key={value} accessibilityRole="button" accessibilityState={{ selected: role === value }} onPress={() => setRole(value)} style={[styles.role, { backgroundColor: role === value ? theme.colors.accent : theme.colors.fill }]}><Text style={{ color: role === value ? theme.colors.accentForeground : theme.colors.text, fontWeight: '700' }}>{label(value)}</Text></AppPressable>)}</View><ModernButton onPress={() => void invite()} disabled={!email.trim()}>Create and share link</ModernButton></View></GroupedSection> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  form: { padding: 16, gap: 14 }, roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, role: { minHeight: 44, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
