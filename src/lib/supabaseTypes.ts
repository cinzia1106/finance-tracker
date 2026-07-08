export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'virtual';
export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'confirmed' | 'needs_review';
export type TransactionSource = 'manual' | 'import';
export type ImportBatchStatus = 'uploaded' | 'processing' | 'completed' | 'failed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          note: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: AccountType;
          note?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: AccountType;
          note?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          to_account_id: string | null;
          account_name: string;
          to_account_name: string | null;
          import_batch_id: string | null;
          date: string;
          type: TransactionType;
          amount: number;
          category: string;
          note: string;
          tags: string[];
          status: TransactionStatus;
          source: TransactionSource;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id?: string | null;
          to_account_id?: string | null;
          account_name?: string;
          to_account_name?: string | null;
          import_batch_id?: string | null;
          date: string;
          type: TransactionType;
          amount: number;
          category?: string;
          note?: string;
          tags?: string[];
          status?: TransactionStatus;
          source?: TransactionSource;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string | null;
          to_account_id?: string | null;
          account_name?: string;
          to_account_name?: string | null;
          import_batch_id?: string | null;
          date?: string;
          type?: TransactionType;
          amount?: number;
          category?: string;
          note?: string;
          tags?: string[];
          status?: TransactionStatus;
          source?: TransactionSource;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          status: ImportBatchStatus;
          file_name: string | null;
          row_count: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          status?: ImportBatchStatus;
          file_name?: string | null;
          row_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string;
          status?: ImportBatchStatus;
          file_name?: string | null;
          row_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sync_events: {
        Row: {
          id: string;
          user_id: string;
          event_type: string;
          entity_table: string;
          entity_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_type: string;
          entity_table: string;
          entity_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_type?: string;
          entity_table?: string;
          entity_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      account_type: AccountType;
      transaction_type: TransactionType;
      transaction_status: TransactionStatus;
      transaction_source: TransactionSource;
      import_batch_status: ImportBatchStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
