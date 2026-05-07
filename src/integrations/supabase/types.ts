export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      complaints: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          description: string
          id: string
          order_id: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          base_pay: number | null
          created_at: string
          delivery_address: string | null
          distance_pay: number | null
          driver_id: string | null
          estimated_time: string | null
          failed_at: string | null
          failure_notes: string | null
          failure_photo_path: string | null
          failure_reason: string | null
          id: string
          order_id: string
          peak_bonus: number | null
          pickup_address: string | null
          pickup_code: string | null
          pickup_verified_at: string | null
          proof_of_delivery: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          tip: number | null
          updated_at: string
        }
        Insert: {
          base_pay?: number | null
          created_at?: string
          delivery_address?: string | null
          distance_pay?: number | null
          driver_id?: string | null
          estimated_time?: string | null
          failed_at?: string | null
          failure_notes?: string | null
          failure_photo_path?: string | null
          failure_reason?: string | null
          id?: string
          order_id: string
          peak_bonus?: number | null
          pickup_address?: string | null
          pickup_code?: string | null
          pickup_verified_at?: string | null
          proof_of_delivery?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          tip?: number | null
          updated_at?: string
        }
        Update: {
          base_pay?: number | null
          created_at?: string
          delivery_address?: string | null
          distance_pay?: number | null
          driver_id?: string | null
          estimated_time?: string | null
          failed_at?: string | null
          failure_notes?: string | null
          failure_photo_path?: string | null
          failure_reason?: string | null
          id?: string
          order_id?: string
          peak_bonus?: number | null
          pickup_address?: string | null
          pickup_code?: string | null
          pickup_verified_at?: string | null
          proof_of_delivery?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          tip?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_offers: {
        Row: {
          accepted_by: string | null
          created_at: string
          declined_by: string[]
          expires_at: string
          id: string
          message: string | null
          order_id: string
          pharmacy_id: string
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          declined_by?: string[]
          expires_at?: string
          id?: string
          message?: string | null
          order_id: string
          pharmacy_id: string
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          declined_by?: string[]
          expires_at?: string
          id?: string
          message?: string | null
          order_id?: string
          pharmacy_id?: string
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
        }
        Relationships: []
      }
      driver_bank_accounts: {
        Row: {
          account_holder: string
          account_number: string
          account_type: string | null
          bank_name: string
          branch_code: string | null
          created_at: string
          driver_id: string
          id: string
          is_default: boolean
        }
        Insert: {
          account_holder: string
          account_number: string
          account_type?: string | null
          bank_name: string
          branch_code?: string | null
          created_at?: string
          driver_id: string
          id?: string
          is_default?: boolean
        }
        Update: {
          account_holder?: string
          account_number?: string
          account_type?: string | null
          bank_name?: string
          branch_code?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          is_default?: boolean
        }
        Relationships: []
      }
      driver_documents: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          id_document_path: string | null
          license_path: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string | null
          submitted_at: string | null
          updated_at: string
          vehicle_photo_path: string | null
          vehicle_registration: string | null
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          id_document_path?: string | null
          license_path?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          submitted_at?: string | null
          updated_at?: string
          vehicle_photo_path?: string | null
          vehicle_registration?: string | null
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          id_document_path?: string | null
          license_path?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          submitted_at?: string | null
          updated_at?: string
          vehicle_photo_path?: string | null
          vehicle_registration?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          driver_id: string
          heading: number | null
          lat: number
          lng: number
          order_id: string | null
          speed: number | null
          updated_at: string
        }
        Insert: {
          driver_id: string
          heading?: number | null
          lat: number
          lng: number
          order_id?: string | null
          speed?: number | null
          updated_at?: string
        }
        Update: {
          driver_id?: string
          heading?: number | null
          lat?: number
          lng?: number
          order_id?: string | null
          speed?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      driver_payouts: {
        Row: {
          amount: number
          created_at: string
          driver_id: string
          id: string
          method: string
          notes: string | null
          paid_at: string | null
          reference: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          driver_id: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          driver_id?: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_status: {
        Row: {
          break_reason: string | null
          driver_id: string
          last_ping_at: string
          status: string
          updated_at: string
        }
        Insert: {
          break_reason?: string | null
          driver_id: string
          last_ping_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          break_reason?: string | null
          driver_id?: string
          last_ping_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      medication_reminders: {
        Row: {
          active: boolean
          created_at: string
          days_supply: number | null
          dosage: string | null
          frequency: string
          id: string
          is_chronic: boolean
          medication_name: string
          next_refill_date: string | null
          notes: string | null
          time_of_day: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_supply?: number | null
          dosage?: string | null
          frequency?: string
          id?: string
          is_chronic?: boolean
          medication_name: string
          next_refill_date?: string | null
          notes?: string | null
          time_of_day?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_supply?: number | null
          dosage?: string | null
          frequency?: string
          id?: string
          is_chronic?: boolean
          medication_name?: string
          next_refill_date?: string | null
          notes?: string | null
          time_of_day?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          batch_number: string | null
          category: string | null
          created_at: string
          description: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          name: string
          pharmacy_id: string
          price: number
          requires_prescription: boolean | null
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          name: string
          pharmacy_id: string
          price?: number
          requires_prescription?: boolean | null
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          name?: string
          pharmacy_id?: string
          price?: number
          requires_prescription?: boolean | null
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_orders: boolean
          email_promotions: boolean
          push_orders: boolean
          sms_orders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_orders?: boolean
          email_promotions?: boolean
          push_orders?: boolean
          sms_orders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_orders?: boolean
          email_promotions?: boolean
          push_orders?: boolean
          sms_orders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          category: string
          channel: string
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          category?: string
          channel?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          channel?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          delivery_address: string | null
          delivery_fee: number
          id: string
          medication_id: string | null
          medication_name: string
          notes: string | null
          patient_id: string
          pharmacy_id: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_address?: string | null
          delivery_fee?: number
          id?: string
          medication_id?: string | null
          medication_name: string
          notes?: string | null
          patient_id: string
          pharmacy_id: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_address?: string | null
          delivery_fee?: number
          id?: string
          medication_id?: string | null
          medication_name?: string
          notes?: string | null
          patient_id?: string
          pharmacy_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          delivery_fee: number | null
          driver_amount: number | null
          failure_reason: string | null
          id: string
          invoice_number: string | null
          order_id: string
          patient_id: string
          payment_method: string
          pharmacy_amount: number | null
          pharmacy_id: string | null
          platform_fee: number | null
          provider: string | null
          refund_amount: number | null
          refund_status: string | null
          retry_count: number | null
          status: Database["public"]["Enums"]["payment_status"]
          subtotal: number | null
          total_paid: number | null
          transaction_ref: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          delivery_fee?: number | null
          driver_amount?: number | null
          failure_reason?: string | null
          id?: string
          invoice_number?: string | null
          order_id: string
          patient_id: string
          payment_method?: string
          pharmacy_amount?: number | null
          pharmacy_id?: string | null
          platform_fee?: number | null
          provider?: string | null
          refund_amount?: number | null
          refund_status?: string | null
          retry_count?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          subtotal?: number | null
          total_paid?: number | null
          transaction_ref?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_fee?: number | null
          driver_amount?: number | null
          failure_reason?: string | null
          id?: string
          invoice_number?: string | null
          order_id?: string
          patient_id?: string
          payment_method?: string
          pharmacy_amount?: number | null
          pharmacy_id?: string | null
          platform_fee?: number | null
          provider?: string | null
          refund_amount?: number | null
          refund_status?: string | null
          retry_count?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          subtotal?: number | null
          total_paid?: number | null
          transaction_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          notes: string | null
          prescription_upload_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          notes?: string | null
          prescription_upload_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          prescription_upload_id?: string
        }
        Relationships: []
      }
      prescription_uploads: {
        Row: {
          created_at: string
          expires_at: string | null
          file_path: string
          flagged: boolean
          id: string
          medication_id: string | null
          mime_type: string
          order_id: string | null
          patient_id: string
          pharmacist_notes: string | null
          pharmacy_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["prescription_upload_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          file_path: string
          flagged?: boolean
          id?: string
          medication_id?: string | null
          mime_type?: string
          order_id?: string | null
          patient_id: string
          pharmacist_notes?: string | null
          pharmacy_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["prescription_upload_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          file_path?: string
          flagged?: boolean
          id?: string
          medication_id?: string | null
          mime_type?: string
          order_id?: string | null
          patient_id?: string
          pharmacist_notes?: string | null
          pharmacy_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["prescription_upload_status"]
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          created_at: string
          doctor_name: string
          dosage: string | null
          hospital_id: string
          id: string
          is_active: boolean | null
          medication_name: string
          notes: string | null
          patient_id: string
        }
        Insert: {
          created_at?: string
          doctor_name?: string
          dosage?: string | null
          hospital_id: string
          id?: string
          is_active?: boolean | null
          medication_name: string
          notes?: string | null
          patient_id: string
        }
        Update: {
          created_at?: string
          doctor_name?: string
          dosage?: string | null
          hospital_id?: string
          id?: string
          is_active?: boolean | null
          medication_name?: string
          notes?: string | null
          patient_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          organization_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          organization_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          organization_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          patient_id: string
          stars: number
          target_id: string
          target_type: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          patient_id: string
          stars: number
          target_id: string
          target_type: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          patient_id?: string
          stars?: number
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      saved_payment_methods: {
        Row: {
          brand: string
          created_at: string
          exp_month: number
          exp_year: number
          id: string
          is_default: boolean
          last4: string
          user_id: string
        }
        Insert: {
          brand: string
          created_at?: string
          exp_month: number
          exp_year: number
          id?: string
          is_default?: boolean
          last4: string
          user_id: string
        }
        Update: {
          brand?: string
          created_at?: string
          exp_month?: number
          exp_year?: number
          id?: string
          is_default?: boolean
          last4?: string
          user_id?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          label: string
          lat: number | null
          lng: number | null
          notes: string | null
          street: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          street: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          street?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      medications_public: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          in_stock: boolean | null
          name: string | null
          pharmacy_id: string | null
          price: number | null
          requires_prescription: boolean | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          in_stock?: never
          name?: string | null
          pharmacy_id?: string | null
          price?: number | null
          requires_prescription?: boolean | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          in_stock?: never
          name?: string | null
          pharmacy_id?: string | null
          price?: number | null
          requires_prescription?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      expire_stale_offers: { Args: never; Returns: undefined }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_order_participant: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "patient" | "pharmacy" | "hospital" | "driver" | "admin"
      approval_status: "pending" | "approved" | "rejected"
      delivery_status:
        | "assigned"
        | "picked_up"
        | "in_transit"
        | "delivered"
        | "failed"
      offer_status: "open" | "accepted" | "declined" | "cancelled" | "expired"
      order_status:
        | "pending"
        | "accepted"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      prescription_upload_status:
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
        | "reupload_requested"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["patient", "pharmacy", "hospital", "driver", "admin"],
      approval_status: ["pending", "approved", "rejected"],
      delivery_status: [
        "assigned",
        "picked_up",
        "in_transit",
        "delivered",
        "failed",
      ],
      offer_status: ["open", "accepted", "declined", "cancelled", "expired"],
      order_status: [
        "pending",
        "accepted",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_status: ["pending", "completed", "failed", "refunded"],
      prescription_upload_status: [
        "pending",
        "approved",
        "rejected",
        "expired",
        "reupload_requested",
      ],
    },
  },
} as const
