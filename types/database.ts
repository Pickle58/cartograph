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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          commit_sha: string | null
          created_at: string
          failure_reason: string | null
          id: string
          organization_id: string
          project_id: string
          status: Database["public"]["Enums"]["analysis_status"]
        }
        Insert: {
          commit_sha?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          organization_id: string
          project_id: string
          status?: Database["public"]["Enums"]["analysis_status"]
        }
        Update: {
          commit_sha?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["analysis_status"]
        }
        Relationships: [
          {
            foreignKeyName: "analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_organization_id_project_id_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      edges: {
        Row: {
          analysis_id: string
          id: string
          kind: Database["public"]["Enums"]["import_kind"]
          organization_id: string
          source_file_id: string
          specifier: string
          target_file_id: string
        }
        Insert: {
          analysis_id: string
          id?: string
          kind: Database["public"]["Enums"]["import_kind"]
          organization_id: string
          source_file_id: string
          specifier: string
          target_file_id: string
        }
        Update: {
          analysis_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["import_kind"]
          organization_id?: string
          source_file_id?: string
          specifier?: string
          target_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_analysis_id_source_file_id_fkey"
            columns: ["analysis_id", "source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "edges_analysis_id_target_file_id_fkey"
            columns: ["analysis_id", "target_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "edges_organization_id_analysis_id_fkey"
            columns: ["organization_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "edges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      explanations: {
        Row: {
          analysis_id: string
          body: string
          created_at: string
          file_id: string
          id: string
          model: string
          organization_id: string
        }
        Insert: {
          analysis_id: string
          body: string
          created_at?: string
          file_id: string
          id?: string
          model: string
          organization_id: string
        }
        Update: {
          analysis_id?: string
          body?: string
          created_at?: string
          file_id?: string
          id?: string
          model?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explanations_analysis_id_file_id_fkey"
            columns: ["analysis_id", "file_id"]
            isOneToOne: true
            referencedRelation: "files"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "explanations_organization_id_analysis_id_fkey"
            columns: ["organization_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "explanations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_roles: {
        Row: {
          analysis_id: string
          file_id: string
          id: string
          organization_id: string
          role: string
          source: Database["public"]["Enums"]["file_role_source"]
        }
        Insert: {
          analysis_id: string
          file_id: string
          id?: string
          organization_id: string
          role: string
          source: Database["public"]["Enums"]["file_role_source"]
        }
        Update: {
          analysis_id?: string
          file_id?: string
          id?: string
          organization_id?: string
          role?: string
          source?: Database["public"]["Enums"]["file_role_source"]
        }
        Relationships: [
          {
            foreignKeyName: "file_roles_analysis_id_file_id_fkey"
            columns: ["analysis_id", "file_id"]
            isOneToOne: true
            referencedRelation: "files"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "file_roles_organization_id_analysis_id_fkey"
            columns: ["organization_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "file_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          analysis_id: string
          id: string
          organization_id: string
          path: string
          skip_reason: string | null
        }
        Insert: {
          analysis_id: string
          id?: string
          organization_id: string
          path: string
          skip_reason?: string | null
        }
        Update: {
          analysis_id?: string
          id?: string
          organization_id?: string
          path?: string
          skip_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_organization_id_analysis_id_fkey"
            columns: ["organization_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          analysis_id: string
          body: string
          created_at: string
          id: string
          model: string
          organization_id: string
        }
        Insert: {
          analysis_id: string
          body: string
          created_at?: string
          id?: string
          model: string
          organization_id: string
        }
        Update: {
          analysis_id?: string
          body?: string
          created_at?: string
          id?: string
          model?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_organization_id_analysis_id_fkey"
            columns: ["organization_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          repository: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          repository: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          repository?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          analysis_id: string
          file_id: string
          id: string
          method: string
          organization_id: string
          path: string
        }
        Insert: {
          analysis_id: string
          file_id: string
          id?: string
          method: string
          organization_id: string
          path: string
        }
        Update: {
          analysis_id?: string
          file_id?: string
          id?: string
          method?: string
          organization_id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_analysis_id_file_id_fkey"
            columns: ["analysis_id", "file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "routes_organization_id_analysis_id_fkey"
            columns: ["organization_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      analysis_status: "queued" | "running" | "complete" | "failed"
      file_role_source: "convention" | "ai"
      import_kind: "import" | "re-export" | "dynamic-import" | "require"
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
      analysis_status: ["queued", "running", "complete", "failed"],
      file_role_source: ["convention", "ai"],
      import_kind: ["import", "re-export", "dynamic-import", "require"],
    },
  },
} as const
