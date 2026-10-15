import React, { useState, useEffect } from 'react';
import { getCurrentVersion } from '@/utils/versionManager';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface AppVersionProps {
  collapsed?: boolean;
  className?: string;
  variant?: 'sidebar' | 'mobile';
}

const AppVersion: React.FC<AppVersionProps> = ({ 
  collapsed = false, 
  className = '', 
  variant = 'sidebar' 
}) => {
  const [version, setVersion] = useState(() => getCurrentVersion());
  const [showDetails, setShowDetails] = useState(false);

  // Update version info periodically in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      const interval = setInterval(() => {
        setVersion(getCurrentVersion());
      }, 30000); // Update every 30 seconds in dev

      return () => clearInterval(interval);
    }
  }, []);

  const formatBuildTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (variant === 'mobile') {
    return (
      <div className={cn("px-6 py-3 border-t border-sidebar-border/10", className)}>
        <div 
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center">
              <Info className="w-3 h-3 text-muted-foreground" />
            </div>
            <span className="text-xs text-sidebar-foreground/50 font-medium">
              Version {version.version}
            </span>
          </div>
          <span className="text-xs text-sidebar-foreground/30">
            {import.meta.env.DEV ? 'DEV' : 'PROD'}
          </span>
        </div>
        
        {showDetails && (
          <div className="mt-3 pl-8 space-y-1 animate-in slide-in-from-top-2 duration-200">
            <div className="text-xs text-sidebar-foreground/40">
              Build: {version.hash.substring(0, 8)}
            </div>
            <div className="text-xs text-sidebar-foreground/40">
              {formatBuildTime(version.buildTime)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop sidebar version
  return (
    <div className={cn(
      "px-4 py-2 border-t border-sidebar-border/10 bg-sidebar/50",
      className
    )}>
      {!collapsed ? (
        <div 
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
              <Info className="w-3 h-3 text-muted-foreground" />
            </div>
            <span className="text-xs text-sidebar-foreground/50 font-medium group-hover:text-sidebar-foreground/70 transition-colors">
              v{version.version}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            {import.meta.env.DEV && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                DEV
              </span>
            )}
            <span className="text-xs text-sidebar-foreground/30 font-mono">
              {version.hash.substring(0, 6)}
            </span>
          </div>
        </div>
      ) : (
        <div 
          className="flex items-center justify-center cursor-pointer group"
          onClick={() => setShowDetails(!showDetails)}
          title={`Version ${version.version} (${version.hash.substring(0, 8)})`}
        >
          <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
            <Info className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      )}
      
      {showDetails && !collapsed && (
        <div className="mt-2 pl-7 space-y-1 animate-in slide-in-from-top-2 duration-200">
          <div className="text-xs text-sidebar-foreground/40">
            Build: {version.hash}
          </div>
          <div className="text-xs text-sidebar-foreground/40">
            {formatBuildTime(version.buildTime)}
          </div>
          <div className="text-xs text-sidebar-foreground/40">
            {import.meta.env.DEV ? 'Development' : 'Production'}
          </div>
        </div>
      )}
    </div>
  );
};

export default AppVersion;
