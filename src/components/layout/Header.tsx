import React from 'react';
import { Menu, Search, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/StableAuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { CompanySwitcher } from '@/components/organisations/CompanySwitcher';

interface HeaderProps {
  toggleSidebar: () => void;
  isMobile: boolean;
}

export function Header({ toggleSidebar, isMobile }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const isInvoicePreview =
    location.pathname.includes('/invoices/new') || location.pathname.includes('/invoices/edit');

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account';

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: 'Signed out successfully',
      description: 'You have been logged out of your account.',
    });
    navigate('/login');
  };

  return (
    <header className="h-16 bg-background flex items-center px-4 md:px-8 sticky top-0 z-10">
      <button
        type="button"
        onClick={toggleSidebar}
        className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={isMobile ? 'Open menu' : 'Toggle sidebar'}
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} />
      </button>

      {isMobile && (
        <div className="flex-1 mx-2 flex justify-center">
          {isInvoicePreview ? (
            <h1 className="text-lg font-semibold">Invoice</h1>
          ) : (
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="" className="w-6 h-6" width={24} height={24} />
              <span className="text-lg font-semibold">EasyBizInvoice</span>
            </div>
          )}
        </div>
      )}

      {!isMobile && <div className="flex-1" />}

      <div className="flex items-center justify-end gap-1">
        {user && <CompanySwitcher compact={isMobile} />}
        <button
          type="button"
          className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Search"
        >
          <Search className="h-5 w-5" strokeWidth={1.5} />
        </button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-10 px-2 sm:px-3 font-medium">
                <div className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-semibold">
                  {user.email ? user.email.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
                </div>
                {!isMobile && (
                  <>
                    <span className="hidden md:block truncate max-w-[200px] text-sm">
                      {displayName}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" strokeWidth={1.5} />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
