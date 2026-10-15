
import { supabase } from '@/integrations/supabase/client';
import { objectsApi, storageApiEnabled } from '@/features/storage/api/objectsApi';

export const storageService = {
  async uploadFile(file: File, path: string): Promise<string | null> {
    if (storageApiEnabled()) {
      const kind = path.includes('logo') ? 'logo' : 'receipt';
      const uploaded = await objectsApi.uploadFile(file, kind);
      return uploaded?.url ?? null;
    }
    try {
      const { data, error } = await supabase.storage
        .from('business-assets')
        .upload(path, file);
      
      if (error) {
        throw error;
      }
      
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('business-assets')
        .getPublicUrl(path);
      
      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  },
  
  async deleteFile(path: string): Promise<boolean> {
    if (storageApiEnabled()) {
      return objectsApi.delete(path);
    }
    try {
      const { error } = await supabase.storage
        .from('business-assets')
        .remove([path]);
      
      return !error;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  },

  // Receipt-specific upload with better error handling
  async uploadReceipt(file: File, expenseId?: string): Promise<{ url: string; path: string } | null> {
    if (storageApiEnabled()) {
      return objectsApi.uploadFile(file, 'receipt');
    }
    try {
      // Generate unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = file.name.split('.').pop() || 'jpg';
      const fileName = expenseId 
        ? `receipt-${expenseId}-${timestamp}.${extension}`
        : `receipt-${timestamp}.${extension}`;
      const filePath = `receipts/${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('business-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        throw error;
      }
      
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('business-assets')
        .getPublicUrl(filePath);
      
      return {
        url: publicUrlData.publicUrl,
        path: filePath
      };
    } catch (error) {
      console.error('Error uploading receipt:', error);
      return null;
    }
  },

  // Delete receipt with path extraction
  async deleteReceipt(urlOrPath: string): Promise<boolean> {
    if (storageApiEnabled()) {
      return objectsApi.delete(urlOrPath);
    }
    try {
      let filePath = urlOrPath;
      
      // Extract path from URL if needed
      if (urlOrPath.includes('/storage/v1/object/public/business-assets/')) {
        filePath = urlOrPath.split('/storage/v1/object/public/business-assets/')[1];
      }
      
      const { error } = await supabase.storage
        .from('business-assets')
        .remove([filePath]);
      
      return !error;
    } catch (error) {
      console.error('Error deleting receipt:', error);
      return false;
    }
  },

  // Get file info and validate
  async getFileInfo(path: string): Promise<{ size: number; contentType: string; lastModified: string } | null> {
    try {
      const { data, error } = await supabase.storage
        .from('business-assets')
        .list(path.split('/').slice(0, -1).join('/'), {
          search: path.split('/').pop()
        });
      
      if (error || !data || data.length === 0) {
        return null;
      }
      
      const fileInfo = data[0];
      return {
        size: fileInfo.metadata?.size || 0,
        contentType: fileInfo.metadata?.mimetype || '',
        lastModified: fileInfo.updated_at || fileInfo.created_at
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      return null;
    }
  }
};
