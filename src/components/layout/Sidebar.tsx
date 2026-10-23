import React, { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { usePermissions, Permission } from '@/hooks/usePermissions';
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  X,
  CreditCard,
  Tag,
  Receipt,
  FolderOpen,
  ChevronDown,
  Wallet,
  Calculator,
  BarChart3,
  DollarSign,
  FileBarChart,
  PieChart,
  Building2,
  Upload,
  Landmark,
  Truck,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import AppVersion from '@/components/common/AppVersion';

interface NavChild {
  name: string;
  path: string;
  icon: LucideIcon;
  permission?: Permission;
}

interface NavItem {
  name: string;
  path?: string;
  icon: LucideIcon;
  permission?: Permission;
  children?: NavChild[];
}

interface SidebarProps {
  collapsed: boolean;
  isMobile: boolean;
  onCloseMobileMenu?: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Home', path: '/', icon: LayoutDashboard },
  { name: 'Invoices', path: '/invoices', icon: Receipt, permission: 'invoices:read' },
  { name: 'Quotes', path: '/quotes', icon: FileText, permission: 'invoices:read' },
  { name: 'Customers', path: '/customers', icon: Users, permission: 'customers:read' },
  { name: 'Items', path: '/items', icon: FolderOpen },
  {
    name: 'Purchases',
    icon: Truck,
    children: [
      { name: 'Vendors', path: '/vendors', icon: Building2 },
      { name: 'Bills', path: '/bills', icon: FileText },
    ],
  },
  {
    name: 'Money',
    icon: Wallet,
    children: [
      { name: 'Expenses', path: '/expenses', icon: CreditCard, permission: 'expenses:read' },
      { name: 'Payments', path: '/payments', icon: Wallet, permission: 'payments:read' },
      { name: 'Receipts', path: '/receipts', icon: Receipt, permission: 'receipts:read' },
      { name: 'Bank Accounts', path: '/bank-accounts', icon: Building2 },
      { name: 'Import', path: '/transaction-import', icon: Upload },
      { name: 'Accounts', path: '/accounts', icon: Landmark, permission: 'accounts:read' },
      { name: 'Categories', path: '/categories', icon: Tag },
      { name: 'Expense Categories', path: '/expense-categories', icon: Tag, permission: 'expenses:read' },
    ],
  },
  {
    name: 'Reports',
    icon: BarChart3,
    children: [
      { name: 'Accounting', path: '/accounting', icon: BarChart3 },
      { name: 'Tax Overview', path: '/tax-overview', icon: DollarSign, permission: 'reports:view' },
      { name: 'Tax Config', path: '/tax-config', icon: Calculator, permission: 'settings:manage' },
      { name: 'Financial Reports', path: '/financial-reports', icon: FileBarChart, permission: 'reports:view' },
      { name: 'IRD Reporting', path: '/ird-reports', icon: PieChart, permission: 'reports:generate' },
      { name: 'Journal Entries', path: '/journal-entries', icon: FileText },
    ],
  },
  { name: 'Recurring', path: '/recurring', icon: CalendarClock, permission: 'settings:manage' },
  { name: 'Settings', path: '/settings', icon: Settings, permission: 'settings:manage' },
];

function isPathActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function groupHasActiveChild(pathname: string, children: NavChild[]) {
  return children.some((child) => isPathActive(pathname, child.path));
}

export function Sidebar({ collapsed, isMobile, onCloseMobileMenu }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const navItems = useMemo(() => {
    return NAV_ITEMS.map((item) => {
      if (item.children) {
        const children = item.children.filter(
          (child) => !child.permission || hasPermission(child.permission)
        );
        return { ...item, children };
      }
      return item;
    }).filter((item) => {
      if (item.children) return item.children.length > 0;
      return !item.permission || hasPermission(item.permission);
    });
  }, [hasPermission]);

  const initiallyOpen = useMemo(() => {
    const open = new Set<string>();
    navItems.forEach((item) => {
      if (item.children && groupHasActiveChild(location.pathname, item.children)) {
        open.add(item.name);
      }
    });
    return open;
  }, [location.pathname, navItems]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(initiallyOpen);

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const linkClass = (active: boolean, extra?: string) =>
    cn(
      'group flex items-center w-full rounded-full text-sm font-medium transition-colors duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/80 hover:bg-muted hover:text-sidebar-foreground',
      extra
    );

  const renderItem = (item: NavItem) => {
    if (item.children) {
      const isOpen = openGroups.has(item.name) || groupHasActiveChild(location.pathname, item.children);
      const parentActive = groupHasActiveChild(location.pathname, item.children);

      if (collapsed && !isMobile) {
        return (
          <li key={item.name}>
            <button
              type="button"
              onClick={() => {
                const first = item.children?.[0];
                if (first) navigate(first.path);
              }}
              className={linkClass(parentActive, 'justify-center p-2.5')}
              title={item.name}
              aria-label={item.name}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </li>
        );
      }

      return (
        <li key={item.name}>
          <button
            type="button"
            onClick={() => toggleGroup(item.name)}
            className={linkClass(parentActive && !isOpen, 'justify-between px-3 py-2.5')}
            aria-expanded={isOpen}
          >
            <span className="flex items-center gap-3">
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>{item.name}</span>
            </span>
            <ChevronDown
              className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
          {isOpen && (
            <ul className="mt-1 space-y-0.5 pl-4">
              {item.children.map((child) => (
                <li key={child.path}>
                  <NavLink
                    to={child.path}
                    onClick={onCloseMobileMenu}
                    className={() =>
                      linkClass(isPathActive(location.pathname, child.path), 'px-3 py-2 gap-3')
                    }
                  >
                    <child.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    <span>{child.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </li>
      );
    }

    if (!item.path) return null;

    return (
      <li key={item.path}>
        <NavLink
          to={item.path}
          end={item.path === '/'}
          onClick={onCloseMobileMenu}
          title={collapsed && !isMobile ? item.name : undefined}
          className={() =>
            linkClass(
              isPathActive(location.pathname, item.path!),
              collapsed && !isMobile ? 'justify-center p-2.5' : 'px-3 py-2.5 gap-3'
            )
          }
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {(!collapsed || isMobile) && <span>{item.name}</span>}
        </NavLink>
      </li>
    );
  };

  if (isMobile) {
    return (
      <aside className="flex flex-col h-full bg-sidebar overflow-y-auto rounded-t-2xl">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-border rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-8 h-8" width={32} height={32} />
            <span className="font-semibold text-lg text-foreground">EasyBizInvoice</span>
          </div>
          {onCloseMobileMenu && (
            <button
              type="button"
              onClick={onCloseMobileMenu}
              className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        <nav className="flex-1 py-4 px-3">
          <ul className="space-y-1">{navItems.map(renderItem)}</ul>
        </nav>

        <AppVersion variant="mobile" />
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'bg-sidebar border-r border-border fixed inset-y-0 left-0 z-50 flex flex-col transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex items-center h-16 px-4', collapsed ? 'justify-center' : 'gap-2.5')}>
        <img src="/logo.png" alt="" className="w-7 h-7 shrink-0" width={28} height={28} />
        {!collapsed && (
          <span className="font-semibold text-[15px] text-foreground truncate">EasyBizInvoice</span>
        )}
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        <ul className="space-y-1">{navItems.map(renderItem)}</ul>
      </nav>

      <AppVersion collapsed={collapsed} variant="sidebar" />
    </aside>
  );
}
