import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background">
        <Header toggleSidebar={toggleMobileMenu} isMobile={true} />
        <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <DrawerContent className="h-[85vh] border-0 bg-transparent [&>div:first-child]:hidden">
            <div className="h-full">
              <Sidebar
                collapsed={false}
                isMobile={true}
                onCloseMobileMenu={() => setMobileMenuOpen(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>

        <main className="flex-1 overflow-auto px-4 py-6">
          <div className="mx-auto w-full max-w-[1120px] overflow-x-hidden">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar collapsed={sidebarCollapsed} isMobile={false} />
      <div
        className={cn(
          'flex flex-col flex-1 w-0 overflow-hidden transition-[margin] duration-200',
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        )}
      >
        <Header toggleSidebar={toggleSidebar} isMobile={false} />
        <main className="flex-1 overflow-auto px-8 py-8">
          <div className="mx-auto w-full max-w-[1120px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
