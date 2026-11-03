import { supabase } from './supabaseClient';
import { toContractTheme } from '@/features/business-profile/theme';
import { OnboardingData, BusinessTheme } from '@/types/onboarding';
import { objectsApi } from '@/features/storage/api/objectsApi';
import {
  businessProfileApi,
  businessProfileApiEnabled,
} from '@/features/business-profile/api/businessProfileApi';
import {
  LogoUploadError,
  logoFailureMessage,
  prepareLogoFile,
  type PickedLogo,
} from '@/features/business-profile/logoFile';

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
  phone?: string | null;
  website?: string | null;
  taxId?: string | null;
  country?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  defaultTaxRate?: number | null;
  gstRegistrationStatus?: 'unknown' | 'registered' | 'not_registered';
  defaultTerms?: string | null;
  defaultNotes?: string | null;
  invoiceNumberFormat?: string;
  invoiceNumberSequence?: number;
  quoteNumberFormat?: string;
  quoteNumberSequence?: number;
  quoteValidityDays?: number;
  defaultQuoteKind?: 'quote' | 'estimate';
  logoUri?: string;
  logo?: PickedLogo;
  theme?: BusinessTheme;
}

function keptText(value: string | null | undefined, current?: string | null): string | null {
  if (value === undefined) return current ?? null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

class BusinessProfileService {
  // Create business profile from onboarding data
  async createBusinessProfile(data: OnboardingData): Promise<BusinessProfile> {
    try {
      if (businessProfileApiEnabled()) {
        let logoUrl: string | null = null;
        if (data.logoUri) {
          try {
            logoUrl = await this.uploadLogo(data.logoUri);
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
          logoUrl = await this.uploadLogo(data.logoUri);
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
  async updateBusinessProfile(updates: BusinessProfileUpdate): Promise<BusinessProfile> {
    try {
      if (businessProfileApiEnabled()) {
        const current = await businessProfileApi.get();
        let logoUrl = current?.logoUrl ?? null;
        if (updates.logo || updates.logoUri) {
          logoUrl = await this.uploadLogo(updates.logo ?? updates.logoUri!);
        }

        const name = updates.businessName ?? current?.name;
        const email = updates.businessEmail ?? current?.email;
        if (!name || !email) {
          throw new Error('Business name and email are required');
        }

        return businessProfileApi.upsert({
          name,
          email,
          phone: keptText(updates.phone, current?.phone),
          website: keptText(updates.website, current?.website),
          taxId: keptText(updates.taxId, current?.taxId),
          country: updates.country ?? current?.country ?? 'NZ',
          address: keptText(updates.address, current?.address),
          city: keptText(updates.city, current?.city),
          state: keptText(updates.state, current?.state),
          zip: keptText(updates.zip, current?.zip),
          invoiceNumberFormat: updates.invoiceNumberFormat ?? current?.invoiceNumberFormat ?? null,
          invoiceNumberSequence: updates.invoiceNumberSequence ?? current?.invoiceNumberSequence ?? undefined,
          quoteNumberFormat: updates.quoteNumberFormat ?? current?.quoteNumberFormat ?? 'QUO-{YYYY}-{SEQ}',
          quoteNumberSequence: updates.quoteNumberSequence ?? current?.quoteNumberSequence ?? 1,
          quoteValidityDays: updates.quoteValidityDays ?? current?.quoteValidityDays ?? 30,
          defaultQuoteKind: updates.defaultQuoteKind ?? current?.defaultQuoteKind ?? 'quote',
          defaultTaxRate: updates.defaultTaxRate !== undefined ? updates.defaultTaxRate : (current?.defaultTaxRate ?? null),
          gstRegistrationStatus: updates.gstRegistrationStatus ?? current?.gstRegistrationStatus ?? 'unknown',
          defaultTerms: keptText(updates.defaultTerms, current?.defaultTerms),
          defaultNotes: keptText(updates.defaultNotes, current?.defaultNotes),
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
      if (updates.logo || updates.logoUri) {
        logoUrl = await this.uploadLogo(updates.logo ?? updates.logoUri!);
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

  /**
   * Read, resize, and store a logo. Object storage checks the type and size.
   * The profile stores a data URL because `/api/objects` requires the session
   * cookie, which invoice HTML and React Native Image cannot send.
   */
  async uploadLogo(source: string | PickedLogo): Promise<string> {
    const asset = typeof source === 'string' ? { uri: source } : source;
    let prepared;
    try {
      prepared = await prepareLogoFile(asset);
    } catch (error) {
      if (error instanceof LogoUploadError) throw error;
      throw new LogoUploadError(logoFailureMessage(error));
    }
    try {
      await objectsApi.upload({
        kind: 'logo',
        filename: prepared.filename,
        contentType: prepared.contentType,
        contentBase64: prepared.contentBase64,
      });
    } catch (error) {
      throw new LogoUploadError(logoFailureMessage(error));
    }
    return `data:${prepared.contentType};base64,${prepared.contentBase64}`;
  }

  // Transform snake_case database response to camelCase
  private transformToBusinessProfile(data: any): BusinessProfile {
    
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
    
    return profile;
  }
}

export const businessProfileService = new BusinessProfileService();

