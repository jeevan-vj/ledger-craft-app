import React, { useState, useEffect } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BusinessProfile, BusinessTheme, DEFAULT_BUSINESS_THEME } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload } from 'lucide-react';
import ThemePicker from '@/components/business/ThemePicker';
import { PageHeader } from '@/components/layout/PageHeader';
import { CompanyTeamPanel } from '@/components/organisations/CompanyTeamPanel';
import { PAYMENT_TERM_PRESETS, paymentTermCodeFromDays } from '@/features/invoices/paymentTerms';
import { CurrencyLocalizationSettings } from '@/components/settings/CurrencyLocalizationSettings';

const profileFormSchema = z.object({
  name: z.string().min(1, { message: "Business name is required" }),
  email: z.string().email({ message: "Please enter a valid email address" }),
  phone: z.string().optional(),
  website: z.string().optional(),
  taxId: z.string().optional(),
  defaultTaxRate: z.number().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().default('New Zealand'),
  bankAccountName: z.string().trim().max(200).optional(),
  bankAccountNumber: z.string().trim().max(100).optional(),
  defaultTerms: z.string().optional(),
  paymentTermDays: z.number().int().min(0).max(365).default(30),
  defaultNotes: z.string().optional(),
  invoiceNumberFormat: z.string().min(2, { message: "Format required" }).optional(),
  invoiceNumberSequence: z.number().optional(),
  quoteNumberFormat: z.string().min(1).max(40).default('QUO-{YYYY}-{SEQ}'),
  quoteNumberSequence: z.number().int().min(1).default(1),
  quoteValidityDays: z.number().int().min(1).max(365).default(30),
  defaultQuoteKind: z.enum(['quote', 'estimate']).default('quote'),
  logoFile: z.any().optional()
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const Settings = () => {
  const { businessProfile, isLoadingBusinessProfile, updateBusinessProfile, refreshBusinessProfile } = useAppData();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  const [previewLogoUrl, setPreviewLogoUrl] = useState<string | undefined>(businessProfile?.logoUrl || undefined);
  const [currentTheme, setCurrentTheme] = useState<BusinessTheme>(businessProfile?.theme || DEFAULT_BUSINESS_THEME);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: businessProfile?.name || '',
      email: businessProfile?.email || '',
      phone: businessProfile?.phone || '',
      website: businessProfile?.website || '',
      taxId: businessProfile?.taxId || '',
      defaultTaxRate: businessProfile?.defaultTaxRate || undefined,
      address: businessProfile?.address || '',
      city: businessProfile?.city || '',
      state: businessProfile?.state || '',
      zip: businessProfile?.zip || '',
      country: businessProfile?.country || 'New Zealand',
      bankAccountName: businessProfile?.bankAccountName || '',
      bankAccountNumber: businessProfile?.bankAccountNumber || '',
      defaultTerms: businessProfile?.defaultTerms || '',
      paymentTermDays: businessProfile?.paymentTermDays ?? 30,
      defaultNotes: businessProfile?.defaultNotes || '',
      invoiceNumberFormat: businessProfile?.invoiceNumberFormat || 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: businessProfile?.invoiceNumberSequence ?? 1,
      quoteNumberFormat: businessProfile?.quoteNumberFormat || 'QUO-{YYYY}-{SEQ}',
      quoteNumberSequence: businessProfile?.quoteNumberSequence ?? 1,
      quoteValidityDays: businessProfile?.quoteValidityDays ?? 30,
      defaultQuoteKind: businessProfile?.defaultQuoteKind ?? 'quote',
      logoFile: undefined,
    },
  });

  useEffect(() => {
    if (refreshBusinessProfile) {
      refreshBusinessProfile();
    }
  }, []);

  React.useEffect(() => {
    if (businessProfile && !isLoadingBusinessProfile) {
      form.reset({
        name: businessProfile.name || '',
        email: businessProfile.email || '',
        phone: businessProfile.phone || '',
        website: businessProfile.website || '',
        taxId: businessProfile.taxId || '',
        defaultTaxRate: businessProfile.defaultTaxRate || undefined,
        address: businessProfile.address || '',
        city: businessProfile.city || '',
        state: businessProfile.state || '',
        zip: businessProfile.zip || '',
        country: businessProfile.country || 'New Zealand',
        bankAccountName: businessProfile.bankAccountName || '',
        bankAccountNumber: businessProfile.bankAccountNumber || '',
        defaultTerms: businessProfile.defaultTerms || '',
        paymentTermDays: businessProfile.paymentTermDays ?? 30,
        defaultNotes: businessProfile.defaultNotes || '',
        invoiceNumberFormat: businessProfile.invoiceNumberFormat || 'INV-{YYYY}-{SEQ}',
        invoiceNumberSequence: businessProfile.invoiceNumberSequence ?? 1,
        quoteNumberFormat: businessProfile.quoteNumberFormat || 'QUO-{YYYY}-{SEQ}',
        quoteNumberSequence: businessProfile.quoteNumberSequence ?? 1,
        quoteValidityDays: businessProfile.quoteValidityDays ?? 30,
        defaultQuoteKind: businessProfile.defaultQuoteKind ?? 'quote',
        logoFile: undefined,
      });
      setPreviewLogoUrl(businessProfile.logoUrl || undefined);
      setCurrentTheme(businessProfile.theme || DEFAULT_BUSINESS_THEME);
    }
  }, [businessProfile, isLoadingBusinessProfile, form]);

  const onSubmit = async (data: ProfileFormValues) => {
    setIsSaving(true);
    try {
      let logoUrlToSave = businessProfile?.logoUrl || null;

      if (data.logoFile && data.logoFile.length > 0) {
        const file = data.logoFile[0] as File;
        logoUrlToSave = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read logo file'));
          reader.readAsDataURL(file);
        });
      }

      const profileData: BusinessProfile = {
        name: data.name,
        email: data.email,
        country: data.country,
        phone: data.phone || null,
        website: data.website || null,
        taxId: data.taxId || null,
        defaultTaxRate: data.defaultTaxRate as number | null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        bankAccountName: data.bankAccountName || null,
        bankAccountNumber: data.bankAccountNumber || null,
        defaultTerms: data.defaultTerms || null,
        paymentTermDays: data.paymentTermDays ?? 30,
        defaultNotes: data.defaultNotes || null,
        id: businessProfile?.id,
        invoiceNumberFormat: data.invoiceNumberFormat?.trim() || 'INV-{YYYY}-{SEQ}',
        invoiceNumberSequence: data.invoiceNumberSequence ?? 1,
        quoteNumberFormat: data.quoteNumberFormat?.trim() || 'QUO-{YYYY}-{SEQ}',
        quoteNumberSequence: data.quoteNumberSequence ?? 1,
        quoteValidityDays: data.quoteValidityDays ?? 30,
        defaultQuoteKind: data.defaultQuoteKind ?? 'quote',
        logoUrl: logoUrlToSave,
      };
      
      const updated = await updateBusinessProfile(profileData);
      toast({
        title: "Success",
        description: "Business profile updated successfully"
      });
      setPreviewLogoUrl(updated.logoUrl || undefined);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "Failed to update business profile",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      form.setValue("logoFile", e.target.files);
      const file = e.target.files[0];
      const previewUrl = URL.createObjectURL(file);
      setPreviewLogoUrl(previewUrl);
    }
  };

  const handleThemeChange = async (theme: BusinessTheme) => {
    try {
      setCurrentTheme(theme);
      
      if (businessProfile) {
        const updatedProfile = { ...businessProfile, theme };
        await updateBusinessProfile(updatedProfile);
        
        toast({
          title: "Success",
          description: "Theme updated successfully"
        });
      }
    } catch (error) {
      console.error("Error updating theme:", error);
      toast({
        title: "Error",
        description: "Failed to update theme",
        variant: "destructive"
      });
    }
  };

  if (isLoadingBusinessProfile) {
    return <div className="flex justify-center items-center h-64">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab}>
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList>
            <TabsTrigger value="profile">Business Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="team">Company & team</TabsTrigger>
            <TabsTrigger value="currency">Currency & locale</TabsTrigger>
          </TabsList>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <TabsContent value="profile" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Business Profile</CardTitle>
                  <CardDescription>
                    Update your business information that appears on your invoices
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2 flex flex-col items-start space-y-2">
                      <label htmlFor="logoUpload" className="cursor-pointer inline-flex items-center space-x-1">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Upload Logo</span>
                      </label>
                      <input
                        id="logoUpload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                      {previewLogoUrl && (
                        <img
                          src={previewLogoUrl}
                          alt="Business Logo Preview"
                          className="max-h-24 max-w-xs object-contain rounded border border-gray-300"
                        />
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Business Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your Business Name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contact@yourbusiness.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="(555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="www.yourbusiness.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="taxId"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Tax ID / VAT Number</FormLabel>
                          <FormControl>
                            <Input placeholder="12-3456789" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="defaultTaxRate"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Default Tax Rate (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="7.5"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem className="space-y-2 md:col-span-2">
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="100 Main Street" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Anytown" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input placeholder="ST" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="zip"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Zip Code</FormLabel>
                            <FormControl>
                              <Input placeholder="12345" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="invoiceNumberFormat"
                      render={({ field }) => (
                        <FormItem className="space-y-2 md:col-span-2">
                          <FormLabel>Invoice Number Format</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. INV-{YYYY}-{MM}-{DD}-{SEQ}" {...field} />
                          </FormControl>
                          <div className="text-xs text-muted-foreground">
                            Use <span className="font-mono">{'{YYYY}'}</span> for year, <span className="font-mono">{'{MM}'}</span> for month, <span className="font-mono">{'{DD}'}</span> for day, <span className="font-mono">{'{SEQ}'}</span> for sequence.<br />
                            Example: <span className="font-mono">INV-{'{YYYY}'}-{'{SEQ}'}</span> → <span className="font-mono">INV-2025-001</span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="invoiceNumberSequence"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Next Sequence Number</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              placeholder="1"
                              {...field}
                              onChange={e => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="md:col-span-2 space-y-4 rounded-lg border p-4">
                      <div>
                        <h3 className="font-semibold">Quotes and estimates</h3>
                        <p className="text-sm text-muted-foreground">Numbering and how long a new quote stays valid. Estimates use the same series.</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="quoteNumberFormat"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Quote number format</FormLabel>
                            <FormControl>
                              <Input placeholder="QUO-{YYYY}-{SEQ}" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Default QUO-{'{YYYY}'}-{'{SEQ}'}.</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid gap-4 md:grid-cols-3">
                        <FormField
                          control={form.control}
                          name="quoteNumberSequence"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Next quote number</FormLabel>
                              <FormControl>
                                <Input type="number" min={1} step={1} {...field} onChange={(event) => field.onChange(Number(event.target.value))} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="quoteValidityDays"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valid for (days)</FormLabel>
                              <FormControl>
                                <Input type="number" min={1} max={365} {...field} onChange={(event) => field.onChange(Number(event.target.value))} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="defaultQuoteKind"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default document</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger aria-label="Default quote kind">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="quote">Quote</SelectItem>
                                  <SelectItem value="estimate">Estimate</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="preferences" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Invoice Preferences</CardTitle>
                  <CardDescription>
                    Customize default settings for your invoices
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <fieldset className="space-y-4 rounded-lg border p-4">
                      <legend className="px-1 font-semibold">Bank transfer details</legend>
                      <p className="text-sm text-muted-foreground">Shown on invoices and PDFs. Leave blank to hide.</p>
                      <FormField control={form.control} name="bankAccountName" render={({ field }) => (
                        <FormItem><FormLabel>Account name</FormLabel><FormControl>
                          <Input {...field} maxLength={200} placeholder="e.g. Kauri Studio Ltd" />
                        </FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="bankAccountNumber" render={({ field }) => (
                        <FormItem><FormLabel>Account number</FormLabel><FormControl>
                          <Input {...field} type="text" maxLength={100} placeholder="e.g. 01-0123-0000123-00" />
                        </FormControl><FormMessage /></FormItem>
                      )} />
                    </fieldset>
                    <FormField
                      control={form.control}
                      name="paymentTermDays"
                      render={({ field }) => {
                        const code = paymentTermCodeFromDays(field.value ?? 30);
                        return (
                          <FormItem className="space-y-2">
                            <FormLabel>Payment terms</FormLabel>
                            <Select
                              value={code}
                              onValueChange={(value) => {
                                if (value === 'custom') {
                                  field.onChange(field.value ?? 30);
                                  return;
                                }
                                const preset = PAYMENT_TERM_PRESETS.find((item) => item.code === value);
                                if (preset) field.onChange(preset.days);
                              }}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="payment-term-days">
                                  <SelectValue placeholder="30 days" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PAYMENT_TERM_PRESETS.map((preset) => (
                                  <SelectItem key={preset.code} value={preset.code}>
                                    {preset.label}
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                            {code === 'custom' && (
                              <Input
                                type="number"
                                min={0}
                                max={365}
                                value={field.value ?? 30}
                                onChange={(event) => field.onChange(Number(event.target.value))}
                                aria-label="Custom payment term days"
                              />
                            )}
                            <p className="text-sm text-muted-foreground">
                              New invoices set due date to invoice date + this many days. You can still pick another date on the invoice.
                            </p>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="defaultTerms"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Default Payment Terms</FormLabel>
                          <FormControl>
                            <Input placeholder="Payment due within 30 days" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="defaultNotes"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Default Notes</FormLabel>
                          <FormControl>
                            <Input placeholder="Thank you for your business!" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="appearance" className="mt-4">
              <ThemePicker
                currentTheme={currentTheme}
                onThemeChange={handleThemeChange}
              />
            </TabsContent>
            
            {(activeTab === 'profile' || activeTab === 'preferences') && <div className="mt-6">
              <Button
                type="submit"
                className=""
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : "Save Changes"}
              </Button>
            </div>}
          </form>
        </Form>
        <TabsContent value="team" className="mt-4"><CompanyTeamPanel /></TabsContent>
        <TabsContent value="currency" className="mt-4"><CurrencyLocalizationSettings /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
