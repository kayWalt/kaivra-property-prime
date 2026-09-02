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
      admin_audit_events: {
        Row: {
          action: string
          actor: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          project_id: string | null
          subject_user: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          project_id?: string | null
          subject_user?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          project_id?: string | null
          subject_user?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      adviser_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          error_detail: string | null
          full_name: string | null
          id: string
          invited_by: string | null
          phone: string | null
          project_ids: string[]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          error_detail?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          project_ids?: string[]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          error_detail?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          project_ids?: string[]
          status?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          categories: Json
          enabled: boolean
          escalation_enabled: boolean
          id: boolean
          support_email: string
          support_hours: string
          support_phone: string
          updated_at: string
          welcome_message: string
          whatsapp_enabled: boolean
          whatsapp_number: string
        }
        Insert: {
          categories?: Json
          enabled?: boolean
          escalation_enabled?: boolean
          id?: boolean
          support_email?: string
          support_hours?: string
          support_phone?: string
          updated_at?: string
          welcome_message?: string
          whatsapp_enabled?: boolean
          whatsapp_number?: string
        }
        Update: {
          categories?: Json
          enabled?: boolean
          escalation_enabled?: boolean
          id?: boolean
          support_email?: string
          support_hours?: string
          support_phone?: string
          updated_at?: string
          welcome_message?: string
          whatsapp_enabled?: boolean
          whatsapp_number?: string
        }
        Relationships: []
      }
      application_documents: {
        Row: {
          application_id: string
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["doc_kind"]
          label: string | null
          mime_type: string | null
          payment_id: string | null
          size_bytes: number | null
        }
        Insert: {
          application_id: string
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          label?: string | null
          mime_type?: string | null
          payment_id?: string | null
          size_bytes?: number | null
        }
        Update: {
          application_id?: string
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          label?: string | null
          mime_type?: string | null
          payment_id?: string | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "application_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          action: string
          actor: string | null
          actor_name: string | null
          application_id: string
          created_at: string
          detail: string | null
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_name?: string | null
          application_id: string
          created_at?: string
          detail?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_name?: string | null
          application_id?: string
          created_at?: string
          detail?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_payments: {
        Row: {
          amount: number
          application_id: string
          bank: string | null
          cash_details: string | null
          created_at: string
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string | null
          payment_account_id: string | null
          payment_account_snapshot: Json | null
          payment_reference: string
          reference: string | null
          rejection_reason: string | null
          sender: string | null
          status: Database["public"]["Enums"]["payment_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount?: number
          application_id: string
          bank?: string | null
          cash_details?: string | null
          created_at?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string | null
          payment_account_id?: string | null
          payment_account_snapshot?: Json | null
          payment_reference?: string
          reference?: string | null
          rejection_reason?: string | null
          sender?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          application_id?: string
          bank?: string | null
          cash_details?: string | null
          created_at?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string | null
          payment_account_id?: string | null
          payment_account_snapshot?: Json | null
          payment_reference?: string
          reference?: string | null
          rejection_reason?: string | null
          sender?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_payments_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "developer_payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          adviser_id: string | null
          application_method: string
          contact: Json
          created_at: string
          created_by: string | null
          current_step: number
          declaration_accepted: boolean
          id: string
          investment: Json
          investor_id: string
          legacy_reference: string | null
          payment_info: Json
          personal: Json
          project_id: string | null
          property_id: string | null
          reference: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          adviser_id?: string | null
          application_method?: string
          contact?: Json
          created_at?: string
          created_by?: string | null
          current_step?: number
          declaration_accepted?: boolean
          id?: string
          investment?: Json
          investor_id: string
          legacy_reference?: string | null
          payment_info?: Json
          personal?: Json
          project_id?: string | null
          property_id?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          adviser_id?: string | null
          application_method?: string
          contact?: Json
          created_at?: string
          created_by?: string | null
          current_step?: number
          declaration_accepted?: boolean
          id?: string
          investment?: Json
          investor_id?: string
          legacy_reference?: string | null
          payment_info?: Json
          personal?: Json
          project_id?: string | null
          property_id?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_enquiries: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string
          full_name: string
          handled: boolean
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string
          phone: string | null
          reference: string
          source_page: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email: string
          full_name: string
          handled?: boolean
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message: string
          phone?: string | null
          reference: string
          source_page?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string
          full_name?: string
          handled?: boolean
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string
          phone?: string | null
          reference?: string
          source_page?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      correction_request_documents: {
        Row: {
          correction_request_id: string
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          correction_request_id: string
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          correction_request_id?: string
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correction_request_documents_correction_request_id_fkey"
            columns: ["correction_request_id"]
            isOneToOne: false
            referencedRelation: "correction_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          admin_note: string | null
          admin_response: string | null
          application_id: string | null
          applied_at: string | null
          applied_by: string | null
          created_at: string
          current_value: string | null
          field_label: string
          id: string
          investor_id: string
          investor_response: string | null
          reason: string
          reference: string | null
          requested_value: string
          resolution_details: string | null
          resolved_at: string | null
          resolved_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          section: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_note?: string | null
          admin_response?: string | null
          application_id?: string | null
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          current_value?: string | null
          field_label: string
          id?: string
          investor_id: string
          investor_response?: string | null
          reason: string
          reference?: string | null
          requested_value: string
          resolution_details?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section: string
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_note?: string | null
          admin_response?: string | null
          application_id?: string | null
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          current_value?: string | null
          field_label?: string
          id?: string
          investor_id?: string
          investor_response?: string | null
          reason?: string
          reference?: string | null
          requested_value?: string
          resolution_details?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_payment_accounts: {
        Row: {
          account_last4: string | null
          account_name: string
          account_number: string
          archived_at: string | null
          bank_name: string
          created_at: string
          created_by: string | null
          description: string | null
          developer_name: string
          id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_last4?: string | null
          account_name: string
          account_number: string
          archived_at?: string | null
          bank_name: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          developer_name: string
          id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_last4?: string | null
          account_name?: string
          account_number?: string
          archived_at?: string | null
          bank_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          developer_name?: string
          id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inspection_appointments: {
        Row: {
          admin_note: string | null
          application_id: string | null
          assigned_adviser: string | null
          attendee_count: number
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          email: string | null
          id: string
          investor_id: string
          legacy_reference: string | null
          notes: string | null
          phone: string | null
          project_id: string | null
          property_id: string | null
          reference: string | null
          reminder_day_sent_at: string | null
          reminder_hour_sent_at: string | null
          scheduled_date: string
          scheduled_time: string
          status: Database["public"]["Enums"]["inspection_status"]
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          application_id?: string | null
          assigned_adviser?: string | null
          attendee_count?: number
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          email?: string | null
          id?: string
          investor_id: string
          legacy_reference?: string | null
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          property_id?: string | null
          reference?: string | null
          reminder_day_sent_at?: string | null
          reminder_hour_sent_at?: string | null
          scheduled_date: string
          scheduled_time: string
          status?: Database["public"]["Enums"]["inspection_status"]
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          application_id?: string | null
          assigned_adviser?: string | null
          attendee_count?: number
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          email?: string | null
          id?: string
          investor_id?: string
          legacy_reference?: string | null
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          property_id?: string | null
          reference?: string | null
          reminder_day_sent_at?: string | null
          reminder_hour_sent_at?: string | null
          scheduled_date?: string
          scheduled_time?: string
          status?: Database["public"]["Enums"]["inspection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_appointments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_appointments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_appointments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_account_audit_log: {
        Row: {
          action: string
          admin_email: string | null
          admin_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_values: Json | null
          payment_account_id: string | null
          previous_values: Json | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_values?: Json | null
          payment_account_id?: string | null
          previous_values?: Json | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_values?: Json | null
          payment_account_id?: string | null
          previous_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_account_audit_log_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "developer_payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          investor_code: string | null
          legacy_investor_code: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          investor_code?: string | null
          legacy_investor_code?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          investor_code?: string | null
          legacy_investor_code?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_advisers: {
        Row: {
          adviser_id: string
          created_at: string
          project_id: string
        }
        Insert: {
          adviser_id: string
          created_at?: string
          project_id: string
        }
        Update: {
          adviser_id?: string
          created_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_advisers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          banks: Json
          created_at: string
          currency: string
          description: string
          gallery_images: Json
          hero_image: string | null
          id: string
          is_active: boolean
          location: string
          name: string
          payment_plans: Json
          project_code: string
          self_registration_open: boolean
          updated_at: string
        }
        Insert: {
          banks?: Json
          created_at?: string
          currency?: string
          description?: string
          gallery_images?: Json
          hero_image?: string | null
          id?: string
          is_active?: boolean
          location?: string
          name: string
          payment_plans?: Json
          project_code?: string
          self_registration_open?: boolean
          updated_at?: string
        }
        Update: {
          banks?: Json
          created_at?: string
          currency?: string
          description?: string
          gallery_images?: Json
          hero_image?: string | null
          id?: string
          is_active?: boolean
          location?: string
          name?: string
          payment_plans?: Json
          project_code?: string
          self_registration_open?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          created_at: string
          description: string
          id: string
          image_urls: Json
          is_active: boolean
          name: string
          payment_plan: string
          project_id: string
          property_code: string
          property_type: string
          size_label: string
          unit_price: number
          units_available: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          image_urls?: Json
          is_active?: boolean
          name: string
          payment_plan?: string
          project_id: string
          property_code?: string
          property_type?: string
          size_label?: string
          unit_price?: number
          units_available?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_urls?: Json
          is_active?: boolean
          name?: string
          payment_plan?: string
          project_id?: string
          property_code?: string
          property_type?: string
          size_label?: string
          unit_price?: number
          units_available?: number
        }
        Relationships: [
          {
            foreignKeyName: "properties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          read_at: string | null
          ticket_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          read_at?: string | null
          ticket_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          read_at?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          application_id: string | null
          assigned_to: string | null
          category: string
          channel: string
          closed_at: string | null
          created_at: string
          id: string
          investor_id: string
          last_message_at: string
          message: string
          priority: string
          project_id: string | null
          reference: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          application_id?: string | null
          assigned_to?: string | null
          category?: string
          channel?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          investor_id: string
          last_message_at?: string
          message: string
          priority?: string
          project_id?: string | null
          reference?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          application_id?: string | null
          assigned_to?: string | null
          category?: string
          channel?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          investor_id?: string
          last_message_at?: string
          message?: string
          priority?: string
          project_id?: string | null
          reference?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "super_admin" | "admin" | "adviser" | "investor"
      application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "payment_verification"
        | "approved"
        | "rejected"
        | "requires_correction"
      doc_kind: "passport" | "signature" | "proof_of_payment" | "additional"
      inspection_status:
        | "requested"
        | "confirmed"
        | "rescheduled"
        | "completed"
        | "cancelled"
        | "no_show"
      payment_method:
        | "bank_transfer"
        | "bank_deposit"
        | "pos"
        | "cash"
        | "other"
      payment_status: "pending" | "verified" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "admin", "adviser", "investor"],
      application_status: [
        "draft",
        "submitted",
        "under_review",
        "payment_verification",
        "approved",
        "rejected",
        "requires_correction",
      ],
      doc_kind: ["passport", "signature", "proof_of_payment", "additional"],
      inspection_status: [
        "requested",
        "confirmed",
        "rescheduled",
        "completed",
        "cancelled",
        "no_show",
      ],
      payment_method: ["bank_transfer", "bank_deposit", "pos", "cash", "other"],
      payment_status: ["pending", "verified", "rejected"],
    },
  },
} as const
