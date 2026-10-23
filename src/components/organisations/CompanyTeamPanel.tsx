import { useCallback, useEffect, useState } from 'react';
import { Building2, Copy, Plus, RefreshCw, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import type { OrganisationInvitation, OrganisationMember, OrganisationRole, OrganisationSummary } from '@ledgercraft/contracts';
import { organisationsApi } from '@/features/organisations/api';
import { useAuth } from '@/context/StableAuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type InviteRole = Exclude<OrganisationRole, 'owner'>;
const roleLabel = (role: OrganisationRole) => role.replace('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

export function CompanyTeamPanel() {
  const { me } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<OrganisationSummary[]>([]);
  const [members, setMembers] = useState<OrganisationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganisationInvitation[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [activeName, setActiveName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);
  const active = companies.find((company) => company.isActive);
  const canManage = me?.permissions.includes('users.manage') ?? false;
  const canUpdate = me?.permissions.includes('organisations.update') ?? false;
  const canArchive = me?.permissions.includes('organisations.archive') ?? false;

  const load = useCallback(async () => {
    const data = await organisationsApi.list();
    setCompanies(data.organisations);
    const selected = data.organisations.find((company) => company.isActive);
      setActiveName(selected?.name ?? '');
    if (selected) {
      const [memberData, inviteData] = await Promise.all([organisationsApi.members(selected.id), organisationsApi.invitations(selected.id)]);
      setMembers(memberData.members); setInvitations(inviteData.invitations);
    }
  }, []);
  useEffect(() => { void load().catch((error) => toast({ title: 'Could not load company access', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })); }, [load, toast]);
  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get('invite');
    if (!inviteToken) return;
    void organisationsApi.acceptInvitation(inviteToken).then(() => {
      window.history.replaceState({}, '', '/settings');
      toast({ title: 'Invitation accepted', description: 'The invited company is now active.' });
      window.location.reload();
    }).catch((error) => toast({ title: 'Could not accept invitation', description: error instanceof Error ? error.message : 'The link may have expired.', variant: 'destructive' }));
  }, [toast]);

  const createCompany = async () => {
    if (companyName.trim().length < 2) return;
    setBusy(true);
    try { await organisationsApi.create(companyName.trim()); window.location.assign('/settings'); }
    catch (error) { toast({ title: 'Could not create company', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const invite = async () => {
    if (!active || !email.trim()) return;
    setBusy(true);
    try {
      const created = await organisationsApi.invite(active.id, email.trim(), role);
      const link = `${window.location.origin}/settings?invite=${encodeURIComponent(created.acceptToken)}`;
      setInviteLink(link); setEmail(''); await load();
      toast({ title: 'Invitation link ready', description: 'Email delivery is not configured. Copy and send this secure link.' });
    } catch (error) { toast({ title: 'Could not create invitation', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const revealInvitation = (acceptToken: string) => setInviteLink(`${window.location.origin}/settings?invite=${encodeURIComponent(acceptToken)}`);
  const changeRole = async (memberId: string, nextRole: InviteRole) => {
    if (!active) return;
    try { await organisationsApi.updateMember(active.id, memberId, nextRole); await load(); }
    catch (error) { toast({ title: 'Could not update role', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
  };
  const removeMember = async (memberId: string, memberName: string) => {
    if (!active || !window.confirm(`Remove ${memberName} from ${active.name}?`)) return;
    try { await organisationsApi.removeMember(active.id, memberId); await load(); }
    catch (error) { toast({ title: 'Could not remove teammate', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
  };
  const saveCompany = async () => {
    if (!active || activeName.trim().length < 2) return;
    setBusy(true);
    try { await organisationsApi.update(active.id, activeName.trim()); await load(); toast({ title: 'Company updated' }); }
    catch (error) { toast({ title: 'Could not update company', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const archiveCompany = async () => {
    if (!active || !window.confirm(`Archive ${active.name}? Its ledger will become unavailable until a future restore workflow is added.`)) return;
    setBusy(true);
    try { await organisationsApi.archive(active.id); window.location.assign('/'); }
    catch (error) { toast({ title: 'Could not archive company', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); setBusy(false); }
  };

  return <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] [&>*]:min-w-0">
    <div className="min-w-0 space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Company access</CardTitle><CardDescription>Switch between isolated company ledgers. Your role is enforced by the API.</CardDescription></CardHeader>
        <CardContent className="space-y-3">{companies.map((company) => <div key={company.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{company.name}</p><p className="text-sm capitalize text-muted-foreground">{roleLabel(company.role)}</p></div>
          {company.isActive ? <Badge>Active</Badge> : !company.archivedAt && <Button variant="outline" onClick={async () => { await organisationsApi.switch(company.id); window.location.reload(); }}>Switch</Button>}
        </div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Team</CardTitle><CardDescription>Owners and administrators can invite collaborators. Owner access cannot be removed through this screen.</CardDescription></CardHeader>
        <CardContent className="space-y-3">{members.map((member) => <div key={member.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-semibold text-primary">{member.name.slice(0,1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{member.name}</p><p className="truncate text-sm text-muted-foreground">{member.email}</p></div>
          {canManage && member.role !== 'owner' ? <><Select value={member.role} onValueChange={(value) => void changeRole(member.id, value as InviteRole)}><SelectTrigger className="w-36" aria-label={`Role for ${member.name}`}><SelectValue /></SelectTrigger><SelectContent>{(['admin','accountant','member','read_only'] as InviteRole[]).map((value) => <SelectItem key={value} value={value}>{roleLabel(value)}</SelectItem>)}</SelectContent></Select><Button size="icon" variant="ghost" aria-label={`Remove ${member.name}`} onClick={() => void removeMember(member.id, member.name)}><Trash2 className="h-4 w-4" /></Button></> : <Badge variant="secondary">{roleLabel(member.role)}</Badge>}
        </div>)}</CardContent></Card>
      {invitations.some((item) => item.status === 'pending') && <Card><CardHeader><CardTitle>Pending invitations</CardTitle></CardHeader><CardContent className="space-y-2">{invitations.filter((item) => item.status === 'pending').map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-muted/50 p-3"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.email}</span><span className="text-xs text-muted-foreground">{roleLabel(item.role)} · expires {new Date(item.expiresAt).toLocaleDateString()}</span></span>{canManage && active && <><Button size="icon" variant="ghost" aria-label={`Refresh invitation for ${item.email}`} onClick={async () => { try { revealInvitation((await organisationsApi.resendInvitation(active.id, item.id)).acceptToken); await load(); } catch (error) { toast({ title: 'Could not refresh invitation', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); } }}><RefreshCw className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Revoke invitation for ${item.email}`} onClick={async () => { try { await organisationsApi.revokeInvitation(active.id, item.id); await load(); } catch (error) { toast({ title: 'Could not revoke invitation', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); } }}><Trash2 className="h-4 w-4" /></Button></>}</div>)}</CardContent></Card>}
    </div>
    <div className="min-w-0 space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />New company</CardTitle><CardDescription>Create a separate ledger and become its owner.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="company-name">Company name</Label><Input id="company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="South Island Studio" /><Button onClick={() => void createCompany()} disabled={busy || companyName.trim().length < 2}>Create company</Button></CardContent></Card>
      {active && canUpdate && <Card><CardHeader><CardTitle>Active company</CardTitle><CardDescription>Rename this company or archive its isolated ledger.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="active-company-name">Company name</Label><Input id="active-company-name" value={activeName} onChange={(event) => setActiveName(event.target.value)} /><div className="flex flex-wrap gap-2"><Button onClick={() => void saveCompany()} disabled={busy || activeName.trim().length < 2 || activeName.trim() === active.name}><Save className="mr-2 h-4 w-4" />Save name</Button>{canArchive && companies.filter((company) => !company.archivedAt).length > 1 && <Button variant="outline" onClick={() => void archiveCompany()} disabled={busy}><Trash2 className="mr-2 h-4 w-4" />Archive company</Button>}</div></CardContent></Card>}
      {canManage && <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" />Invite teammate</CardTitle><CardDescription>Create a seven-day invitation link. Email delivery remains unavailable on the free deployment.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="books@example.com" /><Label>Role</Label><Select value={role} onValueChange={(value) => setRole(value as InviteRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(['admin','accountant','member','read_only'] as InviteRole[]).map((value) => <SelectItem key={value} value={value}>{roleLabel(value)}</SelectItem>)}</SelectContent></Select><Button className="w-full" onClick={() => void invite()} disabled={busy || !email.trim()}>Create invitation link</Button>{inviteLink && <div className="rounded-xl bg-muted p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Secure invitation link</p><div className="flex gap-2"><Input readOnly value={inviteLink} /><Button size="icon" variant="outline" aria-label="Copy invitation link" onClick={() => void navigator.clipboard.writeText(inviteLink)}><Copy className="h-4 w-4" /></Button></div></div>}</CardContent></Card>}
    </div>
  </div>;
}
