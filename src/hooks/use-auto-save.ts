import { useEffect, useRef, useCallback } from 'react';
import { useToast } from './use-toast';

export interface AutoSaveData {
  formData: any;
  items: any[];
  timestamp: number;
  invoiceId?: string;
  mode: 'create' | 'edit';
}

export interface UseAutoSaveOptions {
  key: string;
  data: AutoSaveData;
  enabled?: boolean;
  interval?: number; // milliseconds
  onSave?: (data: AutoSaveData) => void;
  onRestore?: (data: AutoSaveData) => boolean; // return true if data was restored
}

export function useAutoSave({
  key,
  data,
  enabled = true,
  interval = 30000, // 30 seconds default
  onSave,
  onRestore
}: UseAutoSaveOptions) {
  const { toast } = useToast();
  const lastSavedData = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSaveTime = useRef<number>(0);
  const hasCheckedDraft = useRef<boolean>(false);
  
  // Generate storage key with user context
  const storageKey = `invoice-autosave-${key}`;
  
  /**
   * Save data to localStorage
   */
  const saveData = useCallback((dataToSave: AutoSaveData) => {
    try {
      const dataString = JSON.stringify(dataToSave);
      
      // Only save if data has actually changed
      if (dataString === lastSavedData.current) {
        return;
      }
      
      localStorage.setItem(storageKey, dataString);
      lastSavedData.current = dataString;
      lastSaveTime.current = Date.now();
      
      // Call optional callback
      onSave?.(dataToSave);
      
      // Show subtle success indicator (non-intrusive)
      console.log(`✅ Auto-saved invoice draft at ${new Date().toLocaleTimeString()}`);
      
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast({
        title: "Auto-save Warning",
        description: "Could not save draft automatically. Please save manually.",
        variant: "destructive",
      });
    }
  }, [storageKey, onSave, toast]);
  
  /**
   * Load saved data from localStorage
   */
  const loadSavedData = useCallback((): AutoSaveData | null => {
    try {
      const savedData = localStorage.getItem(storageKey);
      if (!savedData) return null;
      
      const parsedData: AutoSaveData = JSON.parse(savedData);
      
      // Validate data structure
      if (!parsedData.formData || !parsedData.items || !parsedData.timestamp) {
        return null;
      }
      
      // Check if data is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - parsedData.timestamp > maxAge) {
        clearSavedData();
        return null;
      }
      
      return parsedData;
    } catch (error) {
      console.error('Failed to load auto-saved data:', error);
      return null;
    }
  }, [storageKey]);
  
  /**
   * Clear saved data from localStorage
   */
  const clearSavedData = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      lastSavedData.current = '';
      console.log('🗑️ Auto-saved draft cleared');
    } catch (error) {
      console.error('Failed to clear auto-saved data:', error);
    }
  }, [storageKey]);
  
  /**
   * Restore data and notify parent component
   */
  const restoreData = useCallback(() => {
    const savedData = loadSavedData();
    if (!savedData) return false;
    
    const wasRestored = onRestore?.(savedData) ?? false;
    
    if (wasRestored) {
      toast({
        title: "Draft Restored",
        description: `Restored invoice draft from ${new Date(savedData.timestamp).toLocaleString()}`,
      });
    }
    
    return wasRestored;
  }, [loadSavedData, onRestore, toast]);
  
  /**
   * Check for existing draft on mount
   */
  useEffect(() => {
    // Only run once on mount - use sessionStorage to track across HMR and re-renders
    const sessionKey = `draft-checked-${key}`;
    const hasCheckedInSession = sessionStorage.getItem(sessionKey);
    
    if (!enabled || hasCheckedInSession || hasCheckedDraft.current) return;
    hasCheckedDraft.current = true;
    sessionStorage.setItem(sessionKey, 'true');
    
    const savedData = loadSavedData();
    if (savedData && data.mode === 'create') {
      // Only auto-restore for new invoices to avoid overwriting edits
      const shouldRestore = window.confirm(
        `Found a saved invoice draft from ${new Date(savedData.timestamp).toLocaleString()}.\n\nWould you like to restore this draft?`
      );
      
      if (shouldRestore) {
        restoreData();
      } else {
        clearSavedData();
      }
    }
  }, [enabled, data.mode, key, loadSavedData, restoreData, clearSavedData]); // Only run on mount
  
  /**
   * Auto-save effect
   */
  useEffect(() => {
    if (!enabled) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(() => {
      // Only auto-save if data has meaningful content
      const hasContent = data.formData?.invoiceNumber || 
                        data.formData?.customerId ||
                        data.items?.some(item => item.description || item.quantity > 0 || item.rate > 0);
      
      if (hasContent) {
        const dataToSave: AutoSaveData = {
          ...data,
          timestamp: Date.now()
        };
        saveData(dataToSave);
      }
    }, interval);
    
    // Cleanup timeout
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, enabled, interval, saveData]);
  
  /**
   * Save immediately on page unload
   */
  useEffect(() => {
    if (!enabled) return;
    
    const handleBeforeUnload = () => {
      const hasContent = data.formData?.invoiceNumber || 
                        data.formData?.customerId ||
                        data.items?.some(item => item.description || item.quantity > 0 || item.rate > 0);
      
      if (hasContent) {
        const dataToSave: AutoSaveData = {
          ...data,
          timestamp: Date.now()
        };
        // Use synchronous storage for page unload
        try {
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        } catch (error) {
          console.error('Failed to save on page unload:', error);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [data, enabled, storageKey]);
  
  return {
    saveData,
    loadSavedData,
    clearSavedData,
    restoreData,
    lastSaveTime: lastSaveTime.current
  };
}