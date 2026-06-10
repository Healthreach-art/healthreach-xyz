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
      appointment_messages: {
        Row: {
          appointment_id: string
          appointment_type: string
          body: string
          created_at: string
          id: string
          patient_id: string
          provider_id: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          appointment_id: string
          appointment_type: string
          body: string
          created_at?: string
          id?: string
          patient_id: string
          provider_id: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          appointment_id?: string
          appointment_type?: string
          body?: string
          created_at?: string
          id?: string
          patient_id?: string
          provider_id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: []
      }
      card_pins: {
        Row: {
          created_at: string
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          delivery_code: string | null
          delivery_verified_at: string | null
          distance_pay: number | null
          driver_id: string | null
          estimated_time: string | null
          failed_at: string | null
          failure_notes: string | null
          failure_photo_path: string | null
          failure_reason: string | null
          id: string
          is_demo: boolean
          order_group_id: string | null
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
          delivery_code?: string | null
          delivery_verified_at?: string | null
          distance_pay?: number | null
          driver_id?: string | null
          estimated_time?: string | null
          failed_at?: string | null
          failure_notes?: string | null
          failure_photo_path?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          order_group_id?: string | null
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
          delivery_code?: string | null
          delivery_verified_at?: string | null
          distance_pay?: number | null
          driver_id?: string | null
          estimated_time?: string | null
          failed_at?: string | null
          failure_notes?: string | null
          failure_photo_path?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          order_group_id?: string | null
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
            foreignKeyName: "deliveries_order_group_id_fkey"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
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
          distance_km: number | null
          expires_at: string
          id: string
          is_demo: boolean
          message: string | null
          offer_round: number
          order_id: string
          pharmacy_id: string
          status: Database["public"]["Enums"]["offer_status"]
          target_driver_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          declined_by?: string[]
          distance_km?: number | null
          expires_at?: string
          id?: string
          is_demo?: boolean
          message?: string | null
          offer_round?: number
          order_id: string
          pharmacy_id: string
          status?: Database["public"]["Enums"]["offer_status"]
          target_driver_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          declined_by?: string[]
          distance_km?: number | null
          expires_at?: string
          id?: string
          is_demo?: boolean
          message?: string | null
          offer_round?: number
          order_id?: string
          pharmacy_id?: string
          status?: Database["public"]["Enums"]["offer_status"]
          target_driver_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      doctor_appointments: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          consultation_fee: number
          created_at: string
          doctor_id: string
          doctor_notes: string
          family_member_id: string | null
          hospital_id: string
          id: string
          medical_aid_member_number: string | null
          medical_aid_provider: string | null
          mode: string
          patient_id: string
          payment_reference: string | null
          payment_status: string
          platform_fee: number
          reason: string
          scheduled_at: string
          status: string
          total_paid: number
          updated_at: string
          use_medical_aid: boolean
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          consultation_fee?: number
          created_at?: string
          doctor_id: string
          doctor_notes?: string
          family_member_id?: string | null
          hospital_id: string
          id?: string
          medical_aid_member_number?: string | null
          medical_aid_provider?: string | null
          mode?: string
          patient_id: string
          payment_reference?: string | null
          payment_status?: string
          platform_fee?: number
          reason?: string
          scheduled_at: string
          status?: string
          total_paid?: number
          updated_at?: string
          use_medical_aid?: boolean
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          consultation_fee?: number
          created_at?: string
          doctor_id?: string
          doctor_notes?: string
          family_member_id?: string | null
          hospital_id?: string
          id?: string
          medical_aid_member_number?: string | null
          medical_aid_provider?: string | null
          mode?: string
          patient_id?: string
          payment_reference?: string | null
          payment_status?: string
          platform_fee?: number
          reason?: string
          scheduled_at?: string
          status?: string
          total_paid?: number
          updated_at?: string
          use_medical_aid?: boolean
        }
        Relationships: []
      }
      doctor_availability: {
        Row: {
          created_at: string
          day_of_week: number
          doctor_id: string
          end_hour: number
          id: string
          is_active: boolean
          slot_minutes: number
          start_hour: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          doctor_id: string
          end_hour: number
          id?: string
          is_active?: boolean
          slot_minutes?: number
          start_hour: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          doctor_id?: string
          end_hour?: number
          id?: string
          is_active?: boolean
          slot_minutes?: number
          start_hour?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_documents: {
        Row: {
          created_at: string
          doctor_user_id: string
          hpcsa_cert_path: string | null
          hpcsa_number: string | null
          id: string
          id_document_path: string | null
          indemnity_path: string | null
          malpractice_cert_path: string | null
          malpractice_expires_at: string | null
          notes: string | null
          practice_letter_path: string | null
          qualification_paths: string[]
          rejection_reason: string | null
          submitted_at: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          doctor_user_id: string
          hpcsa_cert_path?: string | null
          hpcsa_number?: string | null
          id?: string
          id_document_path?: string | null
          indemnity_path?: string | null
          malpractice_cert_path?: string | null
          malpractice_expires_at?: string | null
          notes?: string | null
          practice_letter_path?: string | null
          qualification_paths?: string[]
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          doctor_user_id?: string
          hpcsa_cert_path?: string | null
          hpcsa_number?: string | null
          id?: string
          id_document_path?: string | null
          indemnity_path?: string | null
          malpractice_cert_path?: string | null
          malpractice_expires_at?: string | null
          notes?: string | null
          practice_letter_path?: string | null
          qualification_paths?: string[]
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      doctor_reviews: {
        Row: {
          appointment_id: string | null
          comment: string
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          stars: number
        }
        Insert: {
          appointment_id?: string | null
          comment?: string
          created_at?: string
          doctor_id: string
          id?: string
          patient_id: string
          stars: number
        }
        Update: {
          appointment_id?: string | null
          comment?: string
          created_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          stars?: number
        }
        Relationships: []
      }
      doctors: {
        Row: {
          accepted_medical_aids: string[]
          address: string
          bio: string
          city: string
          consultation_fee: number
          created_at: string
          full_name: string
          hospital_id: string | null
          id: string
          in_person_available: boolean
          is_active: boolean
          is_verified: boolean
          languages: string[]
          latitude: number | null
          longitude: number | null
          online_available: boolean
          phone_available: boolean
          photo_url: string
          practice_number: string
          qualifications: string
          rating_avg: number
          rating_count: number
          rejection_reason: string | null
          services_description: string | null
          services_tags: string[]
          specialty: string
          subspecialties: string[]
          updated_at: string
          user_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          accepted_medical_aids?: string[]
          address?: string
          bio?: string
          city?: string
          consultation_fee?: number
          created_at?: string
          full_name: string
          hospital_id?: string | null
          id?: string
          in_person_available?: boolean
          is_active?: boolean
          is_verified?: boolean
          languages?: string[]
          latitude?: number | null
          longitude?: number | null
          online_available?: boolean
          phone_available?: boolean
          photo_url?: string
          practice_number?: string
          qualifications?: string
          rating_avg?: number
          rating_count?: number
          rejection_reason?: string | null
          services_description?: string | null
          services_tags?: string[]
          specialty?: string
          subspecialties?: string[]
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          accepted_medical_aids?: string[]
          address?: string
          bio?: string
          city?: string
          consultation_fee?: number
          created_at?: string
          full_name?: string
          hospital_id?: string | null
          id?: string
          in_person_available?: boolean
          is_active?: boolean
          is_verified?: boolean
          languages?: string[]
          latitude?: number | null
          longitude?: number | null
          online_available?: boolean
          phone_available?: boolean
          photo_url?: string
          practice_number?: string
          qualifications?: string
          rating_avg?: number
          rating_count?: number
          rejection_reason?: string | null
          services_description?: string | null
          services_tags?: string[]
          specialty?: string
          subspecialties?: string[]
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
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
      e_prescriptions: {
        Row: {
          appointment_id: string
          body: string
          created_at: string
          doctor_id: string
          dosage: string | null
          hospital_id: string
          id: string
          instructions: string | null
          kind: string
          medication_name: string | null
          patient_id: string
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          appointment_id: string
          body?: string
          created_at?: string
          doctor_id: string
          dosage?: string | null
          hospital_id: string
          id?: string
          instructions?: string | null
          kind?: string
          medication_name?: string | null
          patient_id: string
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          appointment_id?: string
          body?: string
          created_at?: string
          doctor_id?: string
          dosage?: string | null
          hospital_id?: string
          id?: string
          instructions?: string | null
          kind?: string
          medication_name?: string | null
          patient_id?: string
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      family_members: {
        Row: {
          allergies: string | null
          avatar_url: string | null
          conditions: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          id_document_path: string | null
          id_number: string | null
          notes: string | null
          relationship: string
          selfie_with_id_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string | null
          avatar_url?: string | null
          conditions?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          id_document_path?: string | null
          id_number?: string | null
          notes?: string | null
          relationship?: string
          selfie_with_id_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string | null
          avatar_url?: string | null
          conditions?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          id_document_path?: string | null
          id_number?: string | null
          notes?: string | null
          relationship?: string
          selfie_with_id_path?: string | null
          updated_at?: string
          user_id?: string
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
          is_demo: boolean
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
          is_demo?: boolean
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
          is_demo?: boolean
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
          push_delivered: boolean
          push_order_placed: boolean
          push_orders: boolean
          push_out_for_delivery: boolean
          push_picked_up: boolean
          push_preparing: boolean
          push_ready: boolean
          sms_orders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_orders?: boolean
          email_promotions?: boolean
          push_delivered?: boolean
          push_order_placed?: boolean
          push_orders?: boolean
          push_out_for_delivery?: boolean
          push_picked_up?: boolean
          push_preparing?: boolean
          push_ready?: boolean
          sms_orders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_orders?: boolean
          email_promotions?: boolean
          push_delivered?: boolean
          push_order_placed?: boolean
          push_orders?: boolean
          push_out_for_delivery?: boolean
          push_picked_up?: boolean
          push_preparing?: boolean
          push_ready?: boolean
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
      order_group_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          at: string
          id: string
          note: string | null
          order_group_id: string
          source: string
          stage: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          at?: string
          id?: string
          note?: string | null
          order_group_id: string
          source?: string
          stage: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          at?: string
          id?: string
          note?: string | null
          order_group_id?: string
          source?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_group_events_order_group_id_fkey"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_groups: {
        Row: {
          created_at: string
          delivery_address: string | null
          delivery_code: string | null
          delivery_fee: number | null
          delivery_km: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          hidden_for_patient_at: string | null
          id: string
          notes: string | null
          patient_id: string
          pharmacy_id: string | null
          pickup_code: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          priority: boolean | null
          recipient_family_member_id: string | null
          recipient_name: string | null
          recipient_phone: string | null
          scheduled_for: string | null
          status: string
          subtotal: number | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_address?: string | null
          delivery_code?: string | null
          delivery_fee?: number | null
          delivery_km?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          hidden_for_patient_at?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          pharmacy_id?: string | null
          pickup_code?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          priority?: boolean | null
          recipient_family_member_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_address?: string | null
          delivery_code?: string | null
          delivery_fee?: number | null
          delivery_km?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          hidden_for_patient_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          pharmacy_id?: string | null
          pickup_code?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          priority?: boolean | null
          recipient_family_member_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
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
          assignment_radius_km: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          delivery_address: string | null
          delivery_fee: number
          delivery_km: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          hidden_for_patient_at: string | null
          id: string
          is_demo: boolean
          medication_id: string | null
          medication_name: string
          notes: string | null
          order_group_id: string | null
          patient_id: string
          pharmacy_assigned_at: string | null
          pharmacy_id: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          prescription_upload_id: string | null
          priority: boolean
          quantity: number
          recipient_family_member_id: string | null
          recipient_name: string | null
          recipient_phone: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          assignment_radius_km?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_fee?: number
          delivery_km?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          hidden_for_patient_at?: string | null
          id?: string
          is_demo?: boolean
          medication_id?: string | null
          medication_name: string
          notes?: string | null
          order_group_id?: string | null
          patient_id: string
          pharmacy_assigned_at?: string | null
          pharmacy_id?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          prescription_upload_id?: string | null
          priority?: boolean
          quantity?: number
          recipient_family_member_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          assignment_radius_km?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_fee?: number
          delivery_km?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          hidden_for_patient_at?: string | null
          id?: string
          is_demo?: boolean
          medication_id?: string | null
          medication_name?: string
          notes?: string | null
          order_group_id?: string | null
          patient_id?: string
          pharmacy_assigned_at?: string | null
          pharmacy_id?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          prescription_upload_id?: string | null
          priority?: boolean
          quantity?: number
          recipient_family_member_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
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
          {
            foreignKeyName: "orders_order_group_id_fkey"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_prescription_upload_id_fkey"
            columns: ["prescription_upload_id"]
            isOneToOne: false
            referencedRelation: "prescription_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_verifications: {
        Row: {
          created_at: string
          id_document_path: string | null
          id_number: string | null
          notes: string | null
          selfie_path: string | null
          selfie_with_id_path: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id_document_path?: string | null
          id_number?: string | null
          notes?: string | null
          selfie_path?: string | null
          selfie_with_id_path?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id_document_path?: string | null
          id_number?: string | null
          notes?: string | null
          selfie_path?: string | null
          selfie_with_id_path?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          transaction_fee: number | null
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
          transaction_fee?: number | null
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
          transaction_fee?: number | null
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
      pharmacy_appointments: {
        Row: {
          created_at: string
          family_member_id: string | null
          id: string
          mode: string
          patient_id: string
          pharmacist_notes: string | null
          pharmacy_id: string
          preferred_at: string
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          mode?: string
          patient_id: string
          pharmacist_notes?: string | null
          pharmacy_id: string
          preferred_at: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          mode?: string
          patient_id?: string
          pharmacist_notes?: string | null
          pharmacy_id?: string
          preferred_at?: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_appointments_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_branches: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          latitude: number
          longitude: number
          name: string
          pharmacy_id: string
          phone: string | null
          service_radius_km: number
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          latitude: number
          longitude: number
          name?: string
          pharmacy_id: string
          phone?: string | null
          service_radius_km?: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          latitude?: number
          longitude?: number
          name?: string
          pharmacy_id?: string
          phone?: string | null
          service_radius_km?: number
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_documents: {
        Row: {
          bank_confirmation_path: string | null
          business_reg_path: string | null
          created_at: string
          id: string
          license_path: string | null
          pharmacist_cert_path: string | null
          pharmacy_id: string
          premises_license_expires_at: string | null
          premises_license_number: string | null
          proof_of_address_path: string | null
          rejection_reason: string | null
          responsible_pharmacist_name: string | null
          responsible_pharmacist_sapc: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_certificates: Json
          submitted_at: string | null
          tax_cert_path: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          verified_services: string[]
        }
        Insert: {
          bank_confirmation_path?: string | null
          business_reg_path?: string | null
          created_at?: string
          id?: string
          license_path?: string | null
          pharmacist_cert_path?: string | null
          pharmacy_id: string
          premises_license_expires_at?: string | null
          premises_license_number?: string | null
          proof_of_address_path?: string | null
          rejection_reason?: string | null
          responsible_pharmacist_name?: string | null
          responsible_pharmacist_sapc?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_certificates?: Json
          submitted_at?: string | null
          tax_cert_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_services?: string[]
        }
        Update: {
          bank_confirmation_path?: string | null
          business_reg_path?: string | null
          created_at?: string
          id?: string
          license_path?: string | null
          pharmacist_cert_path?: string | null
          pharmacy_id?: string
          premises_license_expires_at?: string | null
          premises_license_number?: string | null
          proof_of_address_path?: string | null
          rejection_reason?: string | null
          responsible_pharmacist_name?: string | null
          responsible_pharmacist_sapc?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_certificates?: Json
          submitted_at?: string | null
          tax_cert_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_services?: string[]
        }
        Relationships: []
      }
      pharmacy_offers: {
        Row: {
          created_at: string
          distance_km: number
          expires_at: string
          id: string
          order_id: string
          patient_id: string
          pharmacy_id: string
          responded_at: string | null
          status: string
          tier_km: number
        }
        Insert: {
          created_at?: string
          distance_km: number
          expires_at?: string
          id?: string
          order_id: string
          patient_id: string
          pharmacy_id: string
          responded_at?: string | null
          status?: string
          tier_km: number
        }
        Update: {
          created_at?: string
          distance_km?: number
          expires_at?: string
          id?: string
          order_id?: string
          patient_id?: string
          pharmacy_id?: string
          responded_at?: string | null
          status?: string
          tier_km?: number
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_offers_order_id_fkey"
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
          dispense_token: string | null
          dispensed_at: string | null
          dispensed_by: string | null
          expires_at: string | null
          family_member_id: string | null
          file_path: string
          flagged: boolean
          fraud_score: number
          fraud_signals: Json
          id: string
          last_dispensed_at: string | null
          medication_id: string | null
          mime_type: string
          order_id: string | null
          patient_id: string
          pharmacist_notes: string | null
          pharmacy_id: string | null
          repeats_total: number
          repeats_used: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["prescription_upload_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispense_token?: string | null
          dispensed_at?: string | null
          dispensed_by?: string | null
          expires_at?: string | null
          family_member_id?: string | null
          file_path: string
          flagged?: boolean
          fraud_score?: number
          fraud_signals?: Json
          id?: string
          last_dispensed_at?: string | null
          medication_id?: string | null
          mime_type?: string
          order_id?: string | null
          patient_id: string
          pharmacist_notes?: string | null
          pharmacy_id?: string | null
          repeats_total?: number
          repeats_used?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["prescription_upload_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispense_token?: string | null
          dispensed_at?: string | null
          dispensed_by?: string | null
          expires_at?: string | null
          family_member_id?: string | null
          file_path?: string
          flagged?: boolean
          fraud_score?: number
          fraud_signals?: Json
          id?: string
          last_dispensed_at?: string | null
          medication_id?: string | null
          mime_type?: string
          order_id?: string | null
          patient_id?: string
          pharmacist_notes?: string | null
          pharmacy_id?: string | null
          repeats_total?: number
          repeats_used?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["prescription_upload_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_uploads_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
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
          appointments_enabled: boolean
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          avatar_url: string | null
          business_reg_number: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          id_number: string | null
          is_demo: boolean
          latitude: number | null
          license_expires_at: string | null
          license_number: string | null
          longitude: number | null
          medical_aid_member_number: string | null
          medical_aid_notes: string | null
          medical_aid_plan: string | null
          medical_aid_provider: string | null
          medical_aid_verification_status: string
          medical_aid_verified_at: string | null
          opening_hours: string
          organization_name: string | null
          pharmacist_council_number: string | null
          pharmacist_name: string | null
          phone: string | null
          responsible_pharmacist_phone: string | null
          service_radius_km: number
          services: string[]
          services_description: string | null
          services_tags: string[]
          tax_number: string | null
          updated_at: string
          user_id: string
          walkins_enabled: boolean
        }
        Insert: {
          address?: string | null
          appointments_enabled?: boolean
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          avatar_url?: string | null
          business_reg_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          is_demo?: boolean
          latitude?: number | null
          license_expires_at?: string | null
          license_number?: string | null
          longitude?: number | null
          medical_aid_member_number?: string | null
          medical_aid_notes?: string | null
          medical_aid_plan?: string | null
          medical_aid_provider?: string | null
          medical_aid_verification_status?: string
          medical_aid_verified_at?: string | null
          opening_hours?: string
          organization_name?: string | null
          pharmacist_council_number?: string | null
          pharmacist_name?: string | null
          phone?: string | null
          responsible_pharmacist_phone?: string | null
          service_radius_km?: number
          services?: string[]
          services_description?: string | null
          services_tags?: string[]
          tax_number?: string | null
          updated_at?: string
          user_id: string
          walkins_enabled?: boolean
        }
        Update: {
          address?: string | null
          appointments_enabled?: boolean
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          avatar_url?: string | null
          business_reg_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          is_demo?: boolean
          latitude?: number | null
          license_expires_at?: string | null
          license_number?: string | null
          longitude?: number | null
          medical_aid_member_number?: string | null
          medical_aid_notes?: string | null
          medical_aid_plan?: string | null
          medical_aid_provider?: string | null
          medical_aid_verification_status?: string
          medical_aid_verified_at?: string | null
          opening_hours?: string
          organization_name?: string | null
          pharmacist_council_number?: string | null
          pharmacist_name?: string | null
          phone?: string | null
          responsible_pharmacist_phone?: string | null
          service_radius_km?: number
          services?: string[]
          services_description?: string | null
          services_tags?: string[]
          tax_number?: string | null
          updated_at?: string
          user_id?: string
          walkins_enabled?: boolean
        }
        Relationships: []
      }
      ratings: {
        Row: {
          appointment_id: string | null
          appointment_type: string | null
          comment: string | null
          created_at: string
          id: string
          order_id: string | null
          patient_id: string
          stars: number
          target_id: string
          target_type: string
        }
        Insert: {
          appointment_id?: string | null
          appointment_type?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          patient_id: string
          stars: number
          target_id: string
          target_type: string
        }
        Update: {
          appointment_id?: string | null
          appointment_type?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          patient_id?: string
          stars?: number
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      saved_payment_methods: {
        Row: {
          authorization_code: string | null
          bank: string | null
          brand: string
          card_type: string | null
          country_code: string | null
          created_at: string
          email: string | null
          exp_month: number
          exp_year: number
          id: string
          is_default: boolean
          last4: string
          reusable: boolean
          signature: string | null
          user_id: string
        }
        Insert: {
          authorization_code?: string | null
          bank?: string | null
          brand: string
          card_type?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          exp_month: number
          exp_year: number
          id?: string
          is_default?: boolean
          last4: string
          reusable?: boolean
          signature?: string | null
          user_id: string
        }
        Update: {
          authorization_code?: string | null
          bank?: string | null
          brand?: string
          card_type?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          exp_month?: number
          exp_year?: number
          id?: string
          is_default?: boolean
          last4?: string
          reusable?: boolean
          signature?: string | null
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
      wallet_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          direction: string
          id: string
          note: string | null
          order_id: string | null
          paystack_reference: string | null
          reason: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          direction: string
          id?: string
          note?: string | null
          order_id?: string | null
          paystack_reference?: string | null
          reason: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          direction?: string
          id?: string
          note?: string | null
          order_id?: string | null
          paystack_reference?: string | null
          reason?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_cents: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
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
      pharmacy_directory: {
        Row: {
          address: string | null
          appointments_enabled: boolean | null
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          created_at: string | null
          full_name: string | null
          latitude: number | null
          longitude: number | null
          opening_hours: string | null
          organization_name: string | null
          phone: string | null
          services: string[] | null
          services_tags: string[] | null
          user_id: string | null
          walkins_enabled: boolean | null
        }
        Insert: {
          address?: string | null
          appointments_enabled?: boolean | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          created_at?: string | null
          full_name?: string | null
          latitude?: number | null
          longitude?: number | null
          opening_hours?: string | null
          organization_name?: string | null
          phone?: string | null
          services?: string[] | null
          services_tags?: string[] | null
          user_id?: string | null
          walkins_enabled?: boolean | null
        }
        Update: {
          address?: string | null
          appointments_enabled?: boolean | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          created_at?: string | null
          full_name?: string | null
          latitude?: number | null
          longitude?: number | null
          opening_hours?: string | null
          organization_name?: string | null
          phone?: string | null
          services?: string[] | null
          services_tags?: string[] | null
          user_id?: string | null
          walkins_enabled?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_delivery_offer_for_driver: {
        Args: { _driver_id: string; _offer_id: string }
        Returns: Json
      }
      accept_delivery_offer_safely: {
        Args: { _offer_id: string }
        Returns: Json
      }
      accept_pharmacy_offer: { Args: { _offer_id: string }; Returns: string }
      cancel_order_safely: {
        Args: { _order_id: string; _reason?: string }
        Returns: Json
      }
      claim_prescription_for_pharmacy: {
        Args: { _pharmacy_id: string; _upload_id: string }
        Returns: undefined
      }
      clear_patient_order_history: { Args: never; Returns: Json }
      consume_prescription_repeat: {
        Args: { _upload_id: string }
        Returns: string
      }
      decline_delivery_offer_for_driver: {
        Args: { _driver_id: string; _offer_id: string }
        Returns: Json
      }
      decline_delivery_offer_safely: {
        Args: { _offer_id: string }
        Returns: Json
      }
      decline_pharmacy_offer: {
        Args: { _offer_id: string }
        Returns: undefined
      }
      dispatch_ready_order_to_drivers: {
        Args: { _max_drivers?: number; _order_id: string; _radius_km?: number }
        Returns: Json
      }
      expire_pharmacy_licenses: { Args: never; Returns: Json }
      expire_stale_offers: { Args: never; Returns: undefined }
      find_pharmacies_near: {
        Args: { _lat: number; _lng: number; _max_km: number }
        Returns: {
          distance_km: number
          organization_name: string
          pharmacy_id: string
        }[]
      }
      find_pharmacy_with_all_meds: {
        Args: {
          _lat: number
          _lng: number
          _max_km?: number
          _med_ids: string[]
        }
        Returns: {
          distance_km: number
          has_all: boolean
          match_count: number
          pharmacy_id: string
        }[]
      }
      get_order_driver_contact: {
        Args: { _order_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          phone: string
          user_id: string
        }[]
      }
      get_order_group_timeline: {
        Args: { _group_id: string }
        Returns: {
          actor_id: string
          actor_name: string
          actor_role: string
          at: string
          id: string
          note: string
          source: string
          stage: string
        }[]
      }
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
      haversine_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      hide_order_group_for_patient: {
        Args: { _group_id: string }
        Returns: Json
      }
      is_order_participant: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      rebroadcast_unaccepted_delivery_orders: {
        Args: {
          _max_drivers?: number
          _max_orders?: number
          _radius_km?: number
        }
        Returns: Json
      }
      release_scheduled_orders: { Args: never; Returns: Json }
      resolve_actor_name: { Args: { _user_id: string }; Returns: string }
      wallet_credit: {
        Args: {
          _amount_cents: number
          _note?: string
          _order_id?: string
          _paystack_reference?: string
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      wallet_debit: {
        Args: {
          _amount_cents: number
          _note?: string
          _order_id?: string
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "patient"
        | "pharmacy"
        | "hospital"
        | "driver"
        | "admin"
        | "doctor"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | "under_review"
        | "expired"
      delivery_status:
        | "assigned"
        | "picked_up"
        | "in_transit"
        | "delivered"
        | "failed"
      offer_status: "open" | "accepted" | "declined" | "cancelled" | "expired"
      order_status:
        | "scheduled"
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
      app_role: [
        "patient",
        "pharmacy",
        "hospital",
        "driver",
        "admin",
        "doctor",
      ],
      approval_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
        "under_review",
        "expired",
      ],
      delivery_status: [
        "assigned",
        "picked_up",
        "in_transit",
        "delivered",
        "failed",
      ],
      offer_status: ["open", "accepted", "declined", "cancelled", "expired"],
      order_status: [
        "scheduled",
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
