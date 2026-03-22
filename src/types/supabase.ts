export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          code: string;
          name: string;
          active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["stores"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["stores"]["Insert"]>;
      };
      products: {
        Row: {
          id: string;
          upc: string;
          b1_code: string | null;
          description: string;
          description_kr: string | null;
          unit: string | null;
          pack: number | null;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["products"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      weekly_submissions: {
        Row: {
          id: string;
          store_id: string;
          year: number;
          week: number;
          submitted_at: string | null;
          submitted_by: string | null;
          status: "draft" | "submitted";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["weekly_submissions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["weekly_submissions"]["Insert"]>;
      };
      inventory_entries: {
        Row: {
          id: string;
          submission_id: string;
          product_id: string;
          front_qty: number;
          back_qty: number;
          order_request: number;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["inventory_entries"]["Row"], "id" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["inventory_entries"]["Insert"]>;
      };
      store_users: {
        Row: {
          id: string;
          user_id: string;
          store_id: string;
          role: "manager" | "buyer" | "admin";
        };
        Insert: Omit<Database["public"]["Tables"]["store_users"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["store_users"]["Insert"]>;
      };
    };
  };
}
