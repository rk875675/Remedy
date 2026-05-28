export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  push_token: string | null;
  is_dev: boolean;
  created_at: string;
};

export type OnboardingAnswers = {
  id: string;
  user_id: string;
  pain_location: 'upper' | 'middle' | 'lower' | 'all';
  pain_duration: 'acute' | 'subacute' | 'chronic';
  pain_type: 'stiffness' | 'ache' | 'sharp' | 'multiple';
  activity_level: 'sedentary' | 'light' | 'active' | 'athlete';
  pain_trigger: 'sitting' | 'bending' | 'standing' | 'morning' | 'exercise';
  main_goal: 'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility';
  completed_at: string | null;
  created_at: string;
};

export type Program = {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  sessions_per_week: number;
  target_activity_levels: string[];
  difficulty: string | null;
  created_at: string;
};

export type ProgramSession = {
  id: string;
  program_id: string;
  week_number: number;
  session_number: number;
  title: string;
  duration_minutes: number;
};

export type Exercise = {
  id: string;
  name: string;
  description: string | null;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  video_url: string | null;
  cloudflare_stream_id: string | null;
  instructions: string | null;
  created_at: string;
};

export type SessionExercise = {
  id: string;
  session_id: string;
  exercise_id: string;
  order_index: number;
};

export type UserProgram = {
  id: string;
  user_id: string;
  program_id: string;
  started_at: string | null;
  current_week: number;
  current_session: number;
};

export type SessionCompletion = {
  id: string;
  user_id: string;
  program_session_id: string;
  completed_at: string;
  duration_seconds: number | null;
};

export type PainCheckin = {
  id: string;
  user_id: string;
  session_completion_id: string | null;
  score: number;
  type: 'before' | 'after';
  recorded_at: string;
};

export type Entitlement = {
  id: string;
  user_id: string;
  is_premium: boolean;
  subscription_status: 'none' | 'trial' | 'active' | 'cancelled' | 'expired' | 'dev_trial';
  product_id: string | null;
  original_transaction_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

export type BillingEvent = {
  id: string;
  user_id: string;
  event_type:
    | 'trial_started'
    | 'subscription_started'
    | 'subscription_renewed'
    | 'subscription_cancelled'
    | 'refund'
    | 'restored';
  product_id: string | null;
  transaction_id: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Supabase client generic type
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          display_name?: string | null;
          email?: string | null;
          push_token?: string | null;
          is_dev?: boolean;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
          email?: string | null;
          push_token?: string | null;
          is_dev?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      onboarding_answers: {
        Row: OnboardingAnswers;
        Insert: {
          id?: string;
          user_id: string;
          pain_location: OnboardingAnswers['pain_location'];
          pain_duration: OnboardingAnswers['pain_duration'];
          pain_type: OnboardingAnswers['pain_type'];
          activity_level: OnboardingAnswers['activity_level'];
          pain_trigger: OnboardingAnswers['pain_trigger'];
          main_goal: OnboardingAnswers['main_goal'];
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          pain_location?: OnboardingAnswers['pain_location'];
          pain_duration?: OnboardingAnswers['pain_duration'];
          pain_type?: OnboardingAnswers['pain_type'];
          activity_level?: OnboardingAnswers['activity_level'];
          pain_trigger?: OnboardingAnswers['pain_trigger'];
          main_goal?: OnboardingAnswers['main_goal'];
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      programs: {
        Row: Program;
        Insert: {
          id?: string;
          name: string;
          description: string;
          duration_weeks: number;
          sessions_per_week: number;
          target_activity_levels: string[];
          difficulty?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          duration_weeks?: number;
          sessions_per_week?: number;
          target_activity_levels?: string[];
          difficulty?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      program_sessions: {
        Row: ProgramSession;
        Insert: {
          id?: string;
          program_id: string;
          week_number: number;
          session_number: number;
          title: string;
          duration_minutes: number;
        };
        Update: {
          program_id?: string;
          week_number?: number;
          session_number?: number;
          title?: string;
          duration_minutes?: number;
        };
        Relationships: [];
      };
      exercises: {
        Row: Exercise;
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          sets?: number | null;
          reps?: number | null;
          duration_seconds?: number | null;
          rest_seconds?: number;
          video_url?: string | null;
          cloudflare_stream_id?: string | null;
          instructions?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          sets?: number | null;
          reps?: number | null;
          duration_seconds?: number | null;
          rest_seconds?: number;
          video_url?: string | null;
          cloudflare_stream_id?: string | null;
          instructions?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      session_exercises: {
        Row: SessionExercise;
        Insert: {
          id?: string;
          session_id: string;
          exercise_id: string;
          order_index: number;
        };
        Update: {
          session_id?: string;
          exercise_id?: string;
          order_index?: number;
        };
        Relationships: [];
      };
      user_programs: {
        Row: UserProgram;
        Insert: {
          id?: string;
          user_id: string;
          program_id: string;
          started_at?: string | null;
          current_week?: number;
          current_session?: number;
        };
        Update: {
          program_id?: string;
          started_at?: string | null;
          current_week?: number;
          current_session?: number;
        };
        Relationships: [];
      };
      session_completions: {
        Row: SessionCompletion;
        Insert: {
          id?: string;
          user_id: string;
          program_session_id: string;
          completed_at?: string;
          duration_seconds?: number | null;
        };
        Update: {
          completed_at?: string;
          duration_seconds?: number | null;
        };
        Relationships: [];
      };
      pain_checkins: {
        Row: PainCheckin;
        Insert: {
          id?: string;
          user_id: string;
          session_completion_id?: string | null;
          score: number;
          type: PainCheckin['type'];
          recorded_at?: string;
        };
        Update: {
          session_completion_id?: string | null;
          score?: number;
          type?: PainCheckin['type'];
          recorded_at?: string;
        };
        Relationships: [];
      };
      entitlements: {
        Row: Entitlement;
        Insert: {
          id?: string;
          user_id: string;
          is_premium?: boolean;
          subscription_status?: Entitlement['subscription_status'];
          product_id?: string | null;
          original_transaction_id?: string | null;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          is_premium?: boolean;
          subscription_status?: Entitlement['subscription_status'];
          product_id?: string | null;
          original_transaction_id?: string | null;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_events: {
        Row: BillingEvent;
        Insert: {
          id?: string;
          user_id: string;
          event_type: BillingEvent['event_type'];
          product_id?: string | null;
          transaction_id?: string | null;
          idempotency_key: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          event_type?: BillingEvent['event_type'];
          product_id?: string | null;
          transaction_id?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
