import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  forceRefresh, 
  clearAllCaches, 
  isVersionOutdated, 
  getCurrentVersion 
} from '@/utils/versionManager';

interface DeveloperToolsProps {
  isOpen: boolean;
  onClose: () => void;
}

const DeveloperTools: React.FC<DeveloperToolsProps> = ({ isOpen, onClose }) => {
  const [versionInfo, setVersionInfo] = useState(getCurrentVersion());
  const [isOutdated, setIsOutdated] = useState<boolean | null>(null);
  const [cacheInfo, setCacheInfo] = useState<string[]>([]);
  const [isClearing, setIsClearing] = useState(false);

  // Check version status
  useEffect(() => {
    if (isOpen) {
      checkVersionStatus();
      getCacheInfo();
    }
  }, [isOpen]);

  const checkVersionStatus = async () => {
    try {
      const outdated = await isVersionOutdated();
      setIsOutdated(outdated);
    } catch (error) {
      console.error('Failed to check version:', error);
      setIsOutdated(null);
    }
  };

  const getCacheInfo = async () => {
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        setCacheInfo(cacheNames);
      } catch (error) {
        console.error('Failed to get cache info:', error);
        setCacheInfo([]);
      }
    }
  };

  const handleClearCaches = async () => {
    setIsClearing(true);
    try {
      await clearAllCaches();
      await getCacheInfo(); // Refresh cache info
      console.log('✅ All caches cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear caches:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleForceRefresh = async () => {
    console.log('💪 Force refreshing application...');
    await forceRefresh();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold">🛠️ Developer Tools</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Version Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">📱 App Version</h3>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Version:</span>
                <Badge variant="outline">{versionInfo.version}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Build Hash:</span>
                <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                  {versionInfo.hash}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Build Time:</span>
                <span className="text-sm">
                  {new Date(versionInfo.buildTime).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Status:</span>
                <div className="flex items-center gap-2">
                  {isOutdated === true && (
                    <Badge variant="destructive">Outdated</Badge>
                  )}
                  {isOutdated === false && (
                    <Badge variant="default">Up to date</Badge>
                  )}
                  {isOutdated === null && (
                    <Badge variant="secondary">Unknown</Badge>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={checkVersionStatus}
                  >
                    🔄 Check
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Cache Management */}
          <div>
            <h3 className="text-lg font-semibold mb-3">🗄️ Cache Management</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  onClick={handleClearCaches}
                  disabled={isClearing}
                  variant="destructive"
                  className="flex-1"
                >
                  {isClearing ? '🔄 Clearing...' : '🧹 Clear All Caches'}
                </Button>
                <Button
                  onClick={handleForceRefresh}
                  variant="outline"
                  className="flex-1"
                >
                  🔥 Force Refresh
                </Button>
              </div>
              
              {cacheInfo.length > 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                  <p className="text-sm font-medium mb-2">Active Caches ({cacheInfo.length}):</p>
                  <div className="grid grid-cols-1 gap-1">
                    {cacheInfo.map((cacheName, index) => (
                      <code 
                        key={index} 
                        className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded block"
                      >
                        {cacheName}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h3 className="text-lg font-semibold mb-3">⚡ Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                🔄 Normal Reload
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                🔀 Hard Reload
              </Button>
              <Button
                variant="outline"
                onClick={() => localStorage.clear()}
              >
                📦 Clear LocalStorage
              </Button>
              <Button
                variant="outline"
                onClick={() => sessionStorage.clear()}
              >
                🎯 Clear SessionStorage
              </Button>
            </div>
          </div>

          {/* Environment Info */}
          <div>
            <h3 className="text-lg font-semibold mb-3">🌐 Environment</h3>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs space-y-1">
              <div><strong>User Agent:</strong> {navigator.userAgent}</div>
              <div><strong>SW Support:</strong> {'serviceWorker' in navigator ? '✅' : '❌'}</div>
              <div><strong>Cache API:</strong> {'caches' in window ? '✅' : '❌'}</div>
              <div><strong>Online:</strong> {navigator.onLine ? '🟢 Online' : '🔴 Offline'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeveloperTools;
