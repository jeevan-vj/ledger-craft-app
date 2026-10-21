import { supabase } from './supabaseClient';
import { toContractTheme } from '@/features/business-profile/theme';
import { OnboardingData, BusinessTheme } from '@/types/onboarding';
import { decode } from 'base64-arraybuffer';
import { objectsApi, storageApiEnabled } from '@/features/storage/api/objectsApi';
import {
  businessProfileApi,
  businessProfileApiEnabled,
} from '@/features/business-profile/api/businessProfileApi';

export interface BusinessProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  country: string;
  invoiceNumberFormat: string;
  invoiceNumberSequence: number;
  quoteNumberFormat?: string;
  quoteNumberSequence?: number;
  quoteValidityDays?: number;
  defaultQuoteKind?: 'quote' | 'estimate';
  defaultTaxRate?: number;
  gstRegistrationStatus?: 'unknown' | 'registered' | 'not_registered';
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  taxId?: string;
  website?: string;
  defaultTerms?: string;
  defaultNotes?: string;
  bankInfo?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  logoUrl?: string;
  theme?: BusinessTheme;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfileUpdate {
  businessName?: string;
  businessEmail?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  country?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  defaultTaxRate?: number;
  gstRegistrationStatus?: 'unknown' | 'registered' | 'not_registered';
  defaultTerms?: string;
  defaultNotes?: string;
  invoiceNumberFormat?: string;
  invoiceNumberSequence?: number;
  quoteNumberFormat?: string;
  quoteNumberSequence?: number;
  quoteValidityDays?: number;
  defaultQuoteKind?: 'quote' | 'estimate';
  logoUri?: string;
  theme?: BusinessTheme;
}

class BusinessProfileService {
  // Create business profile from onboarding data
  async createBusinessProfile(data: OnboardingData): Promise<BusinessProfile> {
    try {
      if (businessProfileApiEnabled()) {
        let logoUrl: string | null = null;
        if (data.logoUri) {
          try {
            logoUrl = await this.uploadLogo(data.logoUri, 'session');
          } catch (error) {
            console.warn('Logo upload failed - continuing without logo:', error);
          }
        }

        return businessProfileApi.upsert({
          name: data.businessName,
          email: data.businessEmail,
          country: data.country,
          invoiceNumberFormat: data.invoiceNumberFormat,
          defaultTaxRate: data.defaultTaxRate ?? null,
          gstRegistrationStatus: data.gstRegistrationStatus,
          phone: data.phone ?? null,
          address: data.address ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          zip: data.zip ?? null,
          logoUrl,
          theme: toContractTheme(data.theme),
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload logo if provided (optional)
      let logoUrl: string | null = null;
      if (data.logoUri) {
        try {
          logoUrl = await this.uploadLogo(data.logoUri, user.id);
          if (!logoUrl) {
            console.warn('Logo upload skipped - continuing without logo');
          }
        } catch (error) {
          console.warn('Logo upload failed - continuing without logo:', error);
          // Continue without logo - it's optional
        }
      }

      // Prepare data for insertion (using snake_case for database)
      // Note: Web app stores theme as JSON, not individual columns
      const profileData = {
        user_id: user.id,
        name: data.businessName,
        email: data.businessEmail,
        country: data.country,
        invoice_number_format: data.invoiceNumberFormat,
        invoice_number_sequence: 0,
        default_tax_rate: data.defaultTaxRate,
        gst_registration_status: data.gstRegistrationStatus,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        logo_url: logoUrl,
      };

      const { data: profile, error } = await supabase
        .from('business_profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        console.error('Error creating business profile:', error);
        throw error;
      }

      return this.transformToBusinessProfile(profile);
    } catch (error) {
      console.error('Error in createBusinessProfile:', error);
      throw error;
    }
  }

  // Get business profile for current user
  async getBusinessProfile(): Promise<BusinessProfile | null> {
    try {
      if (businessProfileApiEnabled()) {
        return businessProfileApi.get();
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching business profile:', error);
        throw error;
      }

      return data ? this.transformToBusinessProfile(data) : null;
    } catch (error) {
      console.error('Error in getBusinessProfile:', error);
      throw error;
    }
  }

  // Update business profile
  async updateBusinessProfile(
    updates: BusinessProfileUpdate & Partial<OnboardingData>
  ): Promise<BusinessProfile> {
    try {
      if (businessProfileApiEnabled()) {
        const current = await businessProfileApi.get();
        let logoUrl = current?.logoUrl ?? null;
        if (updates.logoUri) {
          try {
            logoUrl = await this.uploadLogo(updates.logoUri, 'session');
          } catch (error) {
            console.warn('Logo upload failed:', error);
          }
        }

        const name = updates.businessName ?? current?.name;
        const email = updates.businessEmail ?? current?.email;
        if (!name || !email) {
          throw new Error('Business name and email are required');
        }

        return businessProfileApi.upsert({
          name,
          email,
          phone: updates.phone ?? current?.phone ?? null,
          website: updates.website ?? current?.website ?? null,
          taxId: updates.taxId ?? current?.taxId ?? null,
          country: updates.country ?? current?.country ?? 'NZ',
          address: updates.address ?? current?.address ?? null,
          city: updates.city ?? current?.city ?? null,
          state: updates.state ?? current?.state ?? null,
          zip: updates.zip ?? current?.zip ?? null,
          invoiceNumberFormat: updates.invoiceNumberFormat ?? current?.invoiceNumberFormat ?? null,
          invoiceNumberSequence: updates.invoiceNumberSequence ?? current?.invoiceNumberSequence ?? undefined,
          quoteNumberFormat: updates.quoteNumberFormat ?? current?.quoteNumberFormat ?? 'QUO-{YYYY}-{SEQ}',
          quoteNumberSequence: updates.quoteNumberSequence ?? current?.quoteNumberSequence ?? 1,
          quoteValidityDays: updates.quoteValidityDays ?? current?.quoteValidityDays ?? 30,
          defaultQuoteKind: updates.defaultQuoteKind ?? current?.defaultQuoteKind ?? 'quote',
          defaultTaxRate: updates.defaultTaxRate ?? current?.defaultTaxRate ?? null,
          gstRegistrationStatus: updates.gstRegistrationStatus ?? current?.gstRegistrationStatus ?? 'unknown',
          defaultTerms: updates.defaultTerms ?? current?.defaultTerms ?? null,
          defaultNotes: updates.defaultNotes ?? current?.defaultNotes ?? null,
          logoUrl,
          theme: updates.theme
            ? toContractTheme(updates.theme)
            : current?.theme
              ? toContractTheme(current.theme)
              : null,
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload new logo if provided
      let logoUrl: string | null = null;
      if (updates.logoUri) {
        try {
          logoUrl = await this.uploadLogo(updates.logoUri, user.id);
        } catch (error) {
          console.warn('Logo upload failed:', error);
          // Continue without logo update
        }
      }

      // Prepare update data (using snake_case for database)
      const updateData: any = {};
      
      // Basic info
      if (updates.businessName !== undefined) updateData.name = updates.businessName;
      if (updates.businessEmail !== undefined) updateData.email = updates.businessEmail;
      if (updates.phone !== undefined) updateData.phone = updates.phone;
      if (updates.website !== undefined) updateData.website = updates.website;
      if (updates.taxId !== undefined) updateData.tax_id = updates.taxId;
      if (updates.country !== undefined) updateData.country = updates.country;
      
      // Address
      if (updates.address !== undefined) updateData.address = updates.address;
      if (updates.city !== undefined) updateData.city = updates.city;
      if (updates.state !== undefined) updateData.state = updates.state;
      if (updates.zip !== undefined) updateData.zip = updates.zip;
      
      // Invoice settings
      if (updates.invoiceNumberFormat !== undefined) updateData.invoice_number_format = updates.invoiceNumberFormat;
      if (updates.invoiceNumberSequence !== undefined) updateData.invoice_number_sequence = updates.invoiceNumberSequence;
      if (updates.defaultTaxRate !== undefined) updateData.default_tax_rate = updates.defaultTaxRate;
      if (updates.gstRegistrationStatus !== undefined) updateData.gst_registration_status = updates.gstRegistrationStatus;
      
      // Preferences
      if (updates.defaultTerms !== undefined) updateData.default_terms = updates.defaultTerms;
      if (updates.defaultNotes !== undefined) updateData.default_notes = updates.defaultNotes;
      
      // Theme (stored as JSON in database)
      if (updates.theme !== undefined) {
        updateData.primary_color = updates.theme.primary;
        updateData.secondary_color = updates.theme.secondary;
        updateData.accent_color = updates.theme.accent;
      }
      
      // Logo
      if (logoUrl) updateData.logo_url = logoUrl;

      const { data: profile, error } = await supabase
        .from('business_profiles')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating business profile:', error);
        throw error;
      }

      return this.transformToBusinessProfile(profile);
    } catch (error) {
      console.error('Error in updateBusinessProfile:', error);
      throw error;
    }
  }

  // Upload logo to Supabase Storage
  async uploadLogo(uri: string, userId: string): Promise<string | null> {
    try {
      // Fetch the file from the URI
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = base64data.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const base64 = await base64Promise;
      const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';

      if (storageApiEnabled()) {
        const dto = await objectsApi.upload({
          kind: 'logo',
          filename: `${userId}-logo.${ext}`,
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          contentBase64: base64,
        });
        return dto.url;
      }

      const fileName = `business-logos/${userId}-logo.${ext}`;

      // Convert base64 to ArrayBuffer
      const arrayBuffer = decode(base64);

      // Upload to Supabase Storage (using 'business-assets' bucket like web app)
      const { data, error } = await supabase.storage
        .from('business-assets')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (error) {
        console.warn('Logo upload failed:', error.message);
        // Return null instead of throwing - logo is optional
        return null;
      }

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('business-assets')
        .getPublicUrl(fileName);

      return publicData.publicUrl;
    } catch (error) {
      console.warn('Error in uploadLogo:', error);
      // Return null instead of throwing - logo is optional
      return null;
    }
  }

  // Transform snake_case database response to camelCase
  private transformToBusinessProfile(data: any): BusinessProfile {
    console.log('📸 Raw data from database:', data);
    console.log('📸 logo_url from database:', data.logo_url);
    
    // Reconstruct theme if color data exists
    let theme: BusinessTheme | undefined;
    if (data.primary_color || data.secondary_color || data.accent_color) {
      theme = toContractTheme({
        primary: data.primary_color,
        secondary: data.secondary_color,
        accent: data.accent_color,
      });
    }

    const profile = {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      email: data.email,
      country: data.country,
      invoiceNumberFormat: data.invoice_number_format,
      invoiceNumberSequence: data.invoice_number_sequence,
      defaultTaxRate: data.default_tax_rate,
      gstRegistrationStatus: data.gst_registration_status ?? 'unknown',
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      phone: data.phone,
      taxId: data.tax_id,
      website: data.website,
      defaultTerms: data.default_terms,
      defaultNotes: data.default_notes,
      bankInfo: data.bank_info,
      logoUrl: data.logo_url,
      theme: theme,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    console.log('📸 Transformed profile.logoUrl:', profile.logoUrl);
    return profile;
  }
}

export const businessProfileService = new BusinessProfileService();

