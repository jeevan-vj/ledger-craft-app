// Invoice template types and definitions for mobile app
export type InvoiceTemplateId = 'classic' | 'modern' | 'minimal' | 'executive' | 'corporate' | 'modernpro';

export interface InvoiceTemplate {
  id: InvoiceTemplateId;
  name: string;
  description: string;
  preview: string;
}

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Traditional business invoice layout',
    preview: 'Classic vertical format with company details at top'
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Clean, contemporary design',
    preview: 'Sleek design with accent colors'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple and straightforward',
    preview: 'Minimalist layout focusing on essential information'
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Professional financial document style',
    preview: 'Sophisticated layout with refined typography and color scheme'
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Modern enterprise invoice format',
    preview: 'Contemporary design with bold header and structured layout'
  },
  {
    id: 'modernpro',
    name: 'Modern Pro',
    description: 'Visually striking, finance-professional modern invoice',
    preview: 'Gradient header, bold typography, modern layout, and subtle shadows'
  }
];

