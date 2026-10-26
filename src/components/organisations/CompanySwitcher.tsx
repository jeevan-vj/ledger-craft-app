import { useEffect, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import type { OrganisationSummary } from '@ledgercraft/contracts';
import { organisationsApi } from '@/features/organisations/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const [companies, setCompanies] = useState<OrganisationSummary[]>([]);
  const [switching, setSwitching] = useState(false);
  useEffect(() => { void organisationsApi.list().then((data) => setCompanies(data.organisations)).catch(() => setCompanies([])); }, []);
  const active = companies.find((company) => company.isActive);
  if (!active) return null;
  const select = async (company: OrganisationSummary) => {
    if (company.isActive || switching || company.archivedAt) return;
    setSwitching(true);
    try { await organisationsApi.switch(company.id); window.location.assign('/'); } finally { setSwitching(false); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 gap-2 px-2" aria-label={`Switch company. Current company ${active.name}`}>
          <Building2 className="h-4 w-4 text-primary" />
          {!compact && <span className="max-w-[260px] truncate text-sm font-semibold lg:max-w-[360px]" title={active.name}>{active.name}</span>}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Companies</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.filter((company) => !company.archivedAt).map((company) => (
          <DropdownMenuItem key={company.id} onClick={() => void select(company)} className="flex items-center gap-3 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-primary"><Building2 className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{company.name}</span><span className="block text-xs capitalize text-muted-foreground">{company.role.replace('_', ' ')}</span></span>
            {company.isActive && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
