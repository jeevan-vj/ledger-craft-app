export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      business_profiles: {
        Row: {
          address: string | null
          bank_info: string | null
          city: string | null
          country: string | null
          created_at: string
          default_notes: string | null
          default_tax_rate: number | null
          default_terms: string | null
          email: string
          id: string
          invoice_number_format: string | null
          invoice_number_sequence: number | null
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          bank_info?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_notes?: string | null
          default_tax_rate?: number | null
          default_terms?: string | null
          email: string
          id?: string
          invoice_number_format?: string | null
          invoice_number_sequence?: number | null
          logo_url?: string | null
          name: string
          phone?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          bank_info?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_notes?: string | null
          default_tax_rate?: number | null
          default_terms?: string | null
          email?: string
          id?: string
          invoice_number_format?: string | null
          invoice_number_sequence?: number | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string
          id: string
          is_vip: boolean | null
          name: string
          phone: string | null
          state: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          id?: string
          is_vip?: boolean | null
          name: string
          phone?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          id?: string
          is_vip?: boolean | null
          name?: string
          phone?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          currency: string | null
          customer_id: string
          date: string
          discount: number | null
          due_date: string
          id: string
          invoice_number: string
          notes: string | null
          status: string
          subtotal: number
          tax_amount: number
          terms: string | null
          total: number
          updated_at: string
          user_id: string
          tax_inclusive: boolean | null
          tax_rate: number | null
          payment_status: string | null
          balance_due: number | null
          tax_breakdown: any | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_id: string
          date: string
          discount?: number | null
          due_date: string
          id?: string
          invoice_number: string
          notes?: string | null
          status: string
          subtotal: number
          tax_amount?: number
          terms?: string | null
          total: number
          updated_at?: string
          user_id: string
          tax_inclusive?: boolean | null
          tax_rate?: number | null
          payment_status?: string | null
          balance_due?: number | null
          tax_breakdown?: any | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_id?: string
          date?: string
          discount?: number | null
          due_date?: string
          id?: string
          invoice_number?: string
          notes?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          tax_inclusive?: boolean | null
          tax_rate?: number | null
          payment_status?: string | null
          balance_due?: number | null
          tax_breakdown?: any | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          enable_purchase_info: boolean
          enable_sale_info: boolean
          id: string
          name: string
          purchase_price: number | null
          sale_price: number | null
          tax_rate: number | null
          type: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          enable_purchase_info?: boolean
          enable_sale_info?: boolean
          id?: string
          name: string
          purchase_price?: number | null
          sale_price?: number | null
          tax_rate?: number | null
          type: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          enable_purchase_info?: boolean
          enable_sale_info?: boolean
          id?: string
          name?: string
          purchase_price?: number | null
          sale_price?: number | null
          tax_rate?: number | null
          type?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          rate: number
          tax: number | null
          total: number
          unit: string | null
          updated_at: string
          tax_inclusive: boolean | null
          taxable: boolean | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity: number
          rate: number
          tax?: number | null
          total: number
          unit?: string | null
          updated_at?: string
          tax_inclusive?: boolean | null
          taxable?: boolean | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          rate?: number
          tax?: number | null
          total?: number
          unit?: string | null
          updated_at?: string
          tax_inclusive?: boolean | null
          taxable?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_configurations: {
        Row: {
          id: string
          user_id: string
          country_code: string
          tax_type: 'GST' | 'VAT' | 'Sales_Tax'
          tax_rate: number
          tax_name: string
          applies_to_services: boolean
          applies_to_goods: boolean
          effective_from: string
          effective_to: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          country_code?: string
          tax_type: 'GST' | 'VAT' | 'Sales_Tax'
          tax_rate: number
          tax_name: string
          applies_to_services?: boolean
          applies_to_goods?: boolean
          effective_from: string
          effective_to?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          country_code?: string
          tax_type?: 'GST' | 'VAT' | 'Sales_Tax'
          tax_rate?: number
          tax_name?: string
          applies_to_services?: boolean
          applies_to_goods?: boolean
          effective_from?: string
          effective_to?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          user_id: string
          date: string
          description: string
          amount: number
          category: string
          supplier_name: string | null
          receipt_url: string | null
          tax_amount: number
          tax_rate: number
          tax_inclusive: boolean
          is_claimable: boolean
          is_capital_expense: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          description: string
          amount: number
          category: string
          supplier_name?: string | null
          receipt_url?: string | null
          tax_amount?: number
          tax_rate?: number
          tax_inclusive?: boolean
          is_claimable?: boolean
          is_capital_expense?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          description?: string
          amount?: number
          category?: string
          supplier_name?: string | null
          receipt_url?: string | null
          tax_amount?: number
          tax_rate?: number
          tax_inclusive?: boolean
          is_claimable?: boolean
          is_capital_expense?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          user_id: string
          invoice_id: string | null
          amount: number
          payment_date: string
          payment_method: string
          reference_number: string | null
          status: 'pending' | 'completed' | 'failed' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          invoice_id?: string | null
          amount: number
          payment_date: string
          payment_method?: string
          reference_number?: string | null
          status?: 'pending' | 'completed' | 'failed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          invoice_id?: string | null
          amount?: number
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          status?: 'pending' | 'completed' | 'failed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      tax_returns: {
        Row: {
          id: string
          user_id: string
          period_start: string
          period_end: string
          return_type: 'GST' | 'Income_Tax' | 'FBT' | 'PAYE'
          total_sales: number
          total_purchases: number
          gst_on_sales: number
          gst_on_purchases: number
          net_gst: number
          status: 'draft' | 'submitted' | 'approved' | 'rejected'
          ird_reference: string | null
          submitted_at: string | null
          return_data: any | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          period_start: string
          period_end: string
          return_type: 'GST' | 'Income_Tax' | 'FBT' | 'PAYE'
          total_sales?: number
          total_purchases?: number
          gst_on_sales?: number
          gst_on_purchases?: number
          net_gst?: number
          status?: 'draft' | 'submitted' | 'approved' | 'rejected'
          ird_reference?: string | null
          submitted_at?: string | null
          return_data?: any | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          period_start?: string
          period_end?: string
          return_type?: 'GST' | 'Income_Tax' | 'FBT' | 'PAYE'
          total_sales?: number
          total_purchases?: number
          gst_on_sales?: number
          gst_on_purchases?: number
          net_gst?: number
          status?: 'draft' | 'submitted' | 'approved' | 'rejected'
          ird_reference?: string | null
          submitted_at?: string | null
          return_data?: any | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_adjustments: {
        Row: {
          id: string
          user_id: string
          tax_return_id: string | null
          adjustment_type: 'bad_debt' | 'capital_goods' | 'correction' | 'other'
          description: string
          amount: number
          tax_impact: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tax_return_id?: string | null
          adjustment_type: 'bad_debt' | 'capital_goods' | 'correction' | 'other'
          description: string
          amount: number
          tax_impact?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tax_return_id?: string | null
          adjustment_type?: 'bad_debt' | 'capital_goods' | 'correction' | 'other'
          description?: string
          amount?: number
          tax_impact?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_adjustments_tax_return_id_fkey"
            columns: ["tax_return_id"]
            isOneToOne: false
            referencedRelation: "tax_returns"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
