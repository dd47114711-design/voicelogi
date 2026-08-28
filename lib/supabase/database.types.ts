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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          action: string
          created_at: string
          id: string
          occurred_at: string
          staff_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          occurred_at: string
          staff_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          occurred_at?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_slots: {
        Row: {
          department: string
          ended_at: string | null
          id: string
          opened_at: string
          site_id: string
        }
        Insert: {
          department: string
          ended_at?: string | null
          id?: string
          opened_at?: string
          site_id: string
        }
        Update: {
          department?: string
          ended_at?: string | null
          id?: string
          opened_at?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_slots_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean
          category: string
          created_at: string
          display_order: number
          furigana: string | null
          id: string
          name: string
          usage_count: number
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          display_order?: number
          furigana?: string | null
          id?: string
          name: string
          usage_count?: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          display_order?: number
          furigana?: string | null
          id?: string
          name?: string
          usage_count?: number
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          department: string
          display_order: number
          id: string
          name: string
          normal_vehicle_id: string | null
          retired_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          department: string
          display_order?: number
          id?: string
          name: string
          normal_vehicle_id?: string | null
          retired_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string
          display_order?: number
          id?: string
          name?: string
          normal_vehicle_id?: string | null
          retired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_normal_vehicle_id_fkey"
            columns: ["normal_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_placements: {
        Row: {
          assigned_vehicle_id: string | null
          slot_id: string | null
          staff_id: string
          updated_at: string
        }
        Insert: {
          assigned_vehicle_id?: string | null
          slot_id?: string | null
          staff_id: string
          updated_at?: string
        }
        Update: {
          assigned_vehicle_id?: string | null
          slot_id?: string | null
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_placements_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_placements_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "placement_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_placements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_placements: {
        Row: {
          slot_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          slot_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          slot_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_placements_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "placement_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_placements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          display_order: number
          id: string
          status: string
          vehicle_number: string
          vehicle_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          display_order?: number
          id?: string
          status?: string
          vehicle_number: string
          vehicle_type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          display_order?: number
          id?: string
          status?: string
          vehicle_number?: string
          vehicle_type?: string
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
