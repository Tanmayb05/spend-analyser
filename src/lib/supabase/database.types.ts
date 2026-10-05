
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_insights": {
                  Row: {
                    "created_at": string,"id": string,"model": string | null,"result": NonNullable<Json>,"scope": NonNullable<Json>,"scope_key": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"model"?: string | null,"result": NonNullable<Json>,"scope": NonNullable<Json>,"scope_key": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"model"?: string | null,"result"?: NonNullable<Json>,"scope"?: NonNullable<Json>,"scope_key"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_usage": {
                  Row: {
                    "created_at": string,"feature": Database["public"]['Enums']["ai_feature"],"id": number,"tokens_in": number | null,"tokens_out": number | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"feature": Database["public"]['Enums']["ai_feature"],"id"?: never,"tokens_in"?: number | null,"tokens_out"?: number | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"feature"?: Database["public"]['Enums']["ai_feature"],"id"?: never,"tokens_in"?: number | null,"tokens_out"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"budgets": {
                  Row: {
                    "amount": number,"category_id": string,"effective_month": string,"id": string,"user_id": string
                  }
                  Insert: {
                    "amount": number,"category_id": string,"effective_month": string,"id"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string,"effective_month"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "archived": boolean,"color": string | null,"created_at": string,"description": string | null,"icon": string | null,"id": string,"is_core": boolean,"kind": Database["public"]['Enums']["category_kind"],"name": string,"sort_order": number,"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean,"color"?: string | null,"created_at"?: string,"description"?: string | null,"icon"?: string | null,"id"?: string,"is_core"?: boolean,"kind"?: Database["public"]['Enums']["category_kind"],"name": string,"sort_order"?: number,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean,"color"?: string | null,"created_at"?: string,"description"?: string | null,"icon"?: string | null,"id"?: string,"is_core"?: boolean,"kind"?: Database["public"]['Enums']["category_kind"],"name"?: string,"sort_order"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fx_rates": {
                  Row: {
                    "base": string,"date": string,"quote": string,"rate": number
                  }
                  Insert: {
                    "base": string,"date": string,"quote": string,"rate": number
                  }
                  Update: {
                    "base"?: string,"date"?: string,"quote"?: string,"rate"?: number
                  }
                  Relationships: [
                    
                  ]
                },"installments": {
                  Row: {
                    "amount_base": number,"due_date": string,"id": string,"plan_id": string,"seq": number,"user_id": string
                  }
                  Insert: {
                    "amount_base": number,"due_date": string,"id"?: string,"plan_id": string,"seq": number,"user_id"?: string
                  }
                  Update: {
                    "amount_base"?: number,"due_date"?: string,"id"?: string,"plan_id"?: string,"seq"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "installments_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "spread_plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"merchants": {
                  Row: {
                    "created_at": string,"default_category_id": string | null,"default_subcategory_id": string | null,"id": string,"name": string,"name_key": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"default_category_id"?: string | null,"default_subcategory_id"?: string | null,"id"?: string,"name": string,"name_key"?: never,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_category_id"?: string | null,"default_subcategory_id"?: string | null,"id"?: string,"name"?: string,"name_key"?: never,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "merchants_default_category_id_user_id_fkey"
      columns: ["default_category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "merchants_default_subcategory_id_fkey"
      columns: ["default_subcategory_id"]
isOneToOne: false
      referencedRelation: "subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_methods": {
                  Row: {
                    "archived": boolean,"id": string,"name": string,"sort_order": number,"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean,"id"?: string,"name": string,"sort_order"?: number,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean,"id"?: string,"name"?: string,"sort_order"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"people": {
                  Row: {
                    "archived": boolean,"id": string,"is_self": boolean,"name": string,"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean,"id"?: string,"is_self"?: boolean,"name": string,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean,"id"?: string,"is_self"?: boolean,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "ai_enabled": boolean,"base_currency": string,"created_at": string,"dashboard_mode": Database["public"]['Enums']["ledger_mode"],"date_format": string,"default_spread_months": number,"display_name": string | null,"id": string,"locale": string,"theme": string,"timezone": string,"updated_at": string,"week_start": number
                  }
                  Insert: {
                    "ai_enabled"?: boolean,"base_currency"?: string,"created_at"?: string,"dashboard_mode"?: Database["public"]['Enums']["ledger_mode"],"date_format"?: string,"default_spread_months"?: number,"display_name"?: string | null,"id": string,"locale"?: string,"theme"?: string,"timezone"?: string,"updated_at"?: string,"week_start"?: number
                  }
                  Update: {
                    "ai_enabled"?: boolean,"base_currency"?: string,"created_at"?: string,"dashboard_mode"?: Database["public"]['Enums']["ledger_mode"],"date_format"?: string,"default_spread_months"?: number,"display_name"?: string | null,"id"?: string,"locale"?: string,"theme"?: string,"timezone"?: string,"updated_at"?: string,"week_start"?: number
                  }
                  Relationships: [
                    
                  ]
                },"receipt_items": {
                  Row: {
                    "id": string,"item_category": string | null,"line_no": number,"merchant_id": string | null,"normalized_name": string | null,"purchased_at": string | null,"quantity": number | null,"raw_name": string,"receipt_id": string,"total_price": number | null,"transaction_id": string | null,"unit": string | null,"unit_price": number | null,"user_id": string
                  }
                  Insert: {
                    "id"?: string,"item_category"?: string | null,"line_no": number,"merchant_id"?: string | null,"normalized_name"?: string | null,"purchased_at"?: string | null,"quantity"?: number | null,"raw_name": string,"receipt_id": string,"total_price"?: number | null,"transaction_id"?: string | null,"unit"?: string | null,"unit_price"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "id"?: string,"item_category"?: string | null,"line_no"?: number,"merchant_id"?: string | null,"normalized_name"?: string | null,"purchased_at"?: string | null,"quantity"?: number | null,"raw_name"?: string,"receipt_id"?: string,"total_price"?: number | null,"transaction_id"?: string | null,"unit"?: string | null,"unit_price"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_items_merchant_id_user_id_fkey"
      columns: ["merchant_id","user_id"]
isOneToOne: false
      referencedRelation: "merchants"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "receipt_items_receipt_id_user_id_fkey"
      columns: ["receipt_id","user_id"]
isOneToOne: false
      referencedRelation: "receipts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "receipt_items_transaction_id_user_id_fkey"
      columns: ["transaction_id","user_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "created_at": string,"currency": string | null,"discount": number | null,"error": string | null,"extracted": Json | null,"file_name": string | null,"id": string,"merchant_name": string | null,"mime": string | null,"purchased_at": string | null,"sha256": string | null,"source_url": string | null,"status": Database["public"]['Enums']["receipt_status"],"storage_path": string | null,"subtotal": number | null,"tax": number | null,"total": number | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string | null,"discount"?: number | null,"error"?: string | null,"extracted"?: Json | null,"file_name"?: string | null,"id"?: string,"merchant_name"?: string | null,"mime"?: string | null,"purchased_at"?: string | null,"sha256"?: string | null,"source_url"?: string | null,"status"?: Database["public"]['Enums']["receipt_status"],"storage_path"?: string | null,"subtotal"?: number | null,"tax"?: number | null,"total"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string | null,"discount"?: number | null,"error"?: string | null,"extracted"?: Json | null,"file_name"?: string | null,"id"?: string,"merchant_name"?: string | null,"mime"?: string | null,"purchased_at"?: string | null,"sha256"?: string | null,"source_url"?: string | null,"status"?: Database["public"]['Enums']["receipt_status"],"storage_path"?: string | null,"subtotal"?: number | null,"tax"?: number | null,"total"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"spread_plans": {
                  Row: {
                    "created_at": string,"custom_schedule": boolean,"id": string,"installment_amount": number | null,"interest": number,"kind": Database["public"]['Enums']["plan_kind"],"months": number,"start_month": string,"transaction_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"custom_schedule"?: boolean,"id"?: string,"installment_amount"?: number | null,"interest"?: number,"kind": Database["public"]['Enums']["plan_kind"],"months": number,"start_month": string,"transaction_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"custom_schedule"?: boolean,"id"?: string,"installment_amount"?: number | null,"interest"?: number,"kind"?: Database["public"]['Enums']["plan_kind"],"months"?: number,"start_month"?: string,"transaction_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "spread_plans_transaction_id_user_id_fkey"
      columns: ["transaction_id","user_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"subcategories": {
                  Row: {
                    "archived": boolean,"category_id": string,"id": string,"name": string,"sort_order": number,"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean,"category_id": string,"id"?: string,"name": string,"sort_order"?: number,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean,"category_id"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcategories_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "amount": number,"base_amount": number | null,"category_id": string,"created_at": string,"currency": string,"date": string,"description": string | null,"fx_rate": number,"id": string,"merchant_id": string | null,"notes": string | null,"paid_by_id": string | null,"payment_method_id": string | null,"receipt_id": string | null,"source": Database["public"]['Enums']["txn_source"],"subcategory_id": string | null,"trip_id": string | null,"type": Database["public"]['Enums']["txn_type"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "amount": number,"base_amount"?: never,"category_id": string,"created_at"?: string,"currency"?: string,"date": string,"description"?: string | null,"fx_rate"?: number,"id"?: string,"merchant_id"?: string | null,"notes"?: string | null,"paid_by_id"?: string | null,"payment_method_id"?: string | null,"receipt_id"?: string | null,"source"?: Database["public"]['Enums']["txn_source"],"subcategory_id"?: string | null,"trip_id"?: string | null,"type": Database["public"]['Enums']["txn_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"base_amount"?: never,"category_id"?: string,"created_at"?: string,"currency"?: string,"date"?: string,"description"?: string | null,"fx_rate"?: number,"id"?: string,"merchant_id"?: string | null,"notes"?: string | null,"paid_by_id"?: string | null,"payment_method_id"?: string | null,"receipt_id"?: string | null,"source"?: Database["public"]['Enums']["txn_source"],"subcategory_id"?: string | null,"trip_id"?: string | null,"type"?: Database["public"]['Enums']["txn_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_merchant_id_user_id_fkey"
      columns: ["merchant_id","user_id"]
isOneToOne: false
      referencedRelation: "merchants"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_paid_by_id_user_id_fkey"
      columns: ["paid_by_id","user_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_payment_method_id_user_id_fkey"
      columns: ["payment_method_id","user_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_receipt_id_user_id_fkey"
      columns: ["receipt_id","user_id"]
isOneToOne: false
      referencedRelation: "receipts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_subcategory_id_category_id_fkey"
      columns: ["subcategory_id","category_id"]
isOneToOne: false
      referencedRelation: "subcategories"
      referencedColumns: ["id","category_id"]
    },{
      foreignKeyName: "transactions_trip_id_user_id_fkey"
      columns: ["trip_id","user_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "budget": number | null,"created_at": string,"end_date": string | null,"id": string,"include_mode": Database["public"]['Enums']["trip_mode"],"lump_category_id": string | null,"lump_date": string | null,"lump_spread_months": number | null,"name": string,"notes": string | null,"start_date": string | null,"user_id": string
                  }
                  Insert: {
                    "budget"?: number | null,"created_at"?: string,"end_date"?: string | null,"id"?: string,"include_mode"?: Database["public"]['Enums']["trip_mode"],"lump_category_id"?: string | null,"lump_date"?: string | null,"lump_spread_months"?: number | null,"name": string,"notes"?: string | null,"start_date"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "budget"?: number | null,"created_at"?: string,"end_date"?: string | null,"id"?: string,"include_mode"?: Database["public"]['Enums']["trip_mode"],"lump_category_id"?: string | null,"lump_date"?: string | null,"lump_spread_months"?: number | null,"name"?: string,"notes"?: string | null,"start_date"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_lump_category_id_user_id_fkey"
      columns: ["lump_category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "budgets_for":
{ Args: { "p_month": string }; Returns: {
              "amount": number,"category_id": string,"effective_month": string
            }[]
                           },
"consume_ai_quota":
{ Args: { "p_feature": Database["public"]['Enums']["ai_feature"],"p_global_daily_limit": number,"p_monthly_limit": number,"p_user": string }; Returns: {
              "remaining": number,"usage_id": number
            }[]
                           },
"import_bundle":
{ Args: { "p": Json }; Returns: Json
                           },
"ledger":
{ Args: { "p_from": string,"p_include_excluded_trips"?: boolean,"p_mode": Database["public"]['Enums']["ledger_mode"],"p_to": string }; Returns: {
              "amount": number,"category_id": string,"description": string,"entry_date": string,"income": number,"installment_count": number,"installment_seq": number,"is_core": boolean,"is_lump": boolean,"is_scheduled": boolean,"merchant_id": string,"merchant_name": string,"month": string,"orig_amount": number,"orig_currency": string,"paid_by_id": string,"payment_method_id": string,"plan_kind": Database["public"]['Enums']["plan_kind"],"receipt_id": string,"spend": number,"subcategory_id": string,"trip_id": string,"txn_id": string,"type": Database["public"]['Enums']["txn_type"]
            }[]
                           },
"merge_category":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"merge_merchant":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"rebase_currency":
{ Args: { "p_budget_rate"?: number,"p_new": string,"p_rates": Json }; Returns: number
                           },
"regen_installments":
{ Args: { "p_plan": string }; Returns: undefined
                           },
"save_transaction":
{ Args: { "p": Json }; Returns: string
                           },
"seed_user_defaults":
{ Args: { "p_user": string }; Returns: undefined
                           },
"set_budget":
{ Args: { "p_amount": number,"p_category": string,"p_month": string,"p_replace_future"?: boolean }; Returns: number
                           },
"user_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            "ai_feature": "analysis"|"parse_text"|"parse_receipt"|"transcribe","category_kind": "expense"|"income","ledger_mode": "normalized"|"cash","plan_kind": "spread"|"emi","receipt_status": "pending"|"parsed"|"failed","trip_mode": "excluded"|"lump_sum"|"itemized","txn_source": "manual"|"text"|"receipt"|"voice"|"import","txn_type": "expense"|"income"|"refund"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ai_feature": ["analysis", "parse_text", "parse_receipt", "transcribe"],"category_kind": ["expense", "income"],"ledger_mode": ["normalized", "cash"],"plan_kind": ["spread", "emi"],"receipt_status": ["pending", "parsed", "failed"],"trip_mode": ["excluded", "lump_sum", "itemized"],"txn_source": ["manual", "text", "receipt", "voice", "import"],"txn_type": ["expense", "income", "refund"]
          }
        }
} as const
