export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  push_token: string | null;
  is_dev: boolean;
  created_at: string;
};

export type EquipmentTier = 'gym' | 'bands_dumbbells' | 'open_space';
export type ExercisePhase = 'mobility' | 'activation' | 'strength' | 'recovery';

export type PainType = 'stiffness' | 'ache' | 'sharp';
export type PainTrigger = 'sitting' | 'bending' | 'standing' | 'morning' | 'exercise' | 'other';
export type MainGoal = 'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility';

export type OnboardingAnswers = {
  id: string;
  user_id: string;
  pain_location: 'upper' | 'lower' | 'all';
  pain_duration: 'acute' | 'subacute' | 'chronic';
  pain_type: PainType[];
  activity_level: 'sedentary' | 'light' | 'active' | 'athlete';
  pain_trigger: PainTrigger[];
  equipment: EquipmentTier | null;
  main_goal: MainGoal[];
  sessions_per_week_preference: number | null;
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
  // Layer 1 — tagged catalog metadata (see migration 013)
  equipment_tier: EquipmentTier;
  pain_areas: string[];
  intensity_tier: number;
  movement_pattern: string;
  pain_types_safe: string[];
  triggers_addressed: string[];
  goals_weight: Record<string, number>;
  effectiveness: number;
  fatigue_cost: number;
  usefulness: number;
  aggravates: string[];
  phase: ExercisePhase;
  duration_minutes_est: number;
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
  active_plan_id: string | null;
};

export type SessionCompletion = {
  id: string;
  user_id: string;
  program_session_id: string | null;
  plan_session_id: string | null;
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
// Program personalization (migrations 013–015)
// ---------------------------------------------------------------------------

export type AssignmentRule = {
  id: string;
  version: number;
  is_active: boolean;
  rules: Record<string, unknown>;
  notes: string | null;
  created_at: string;
};

export type ProgramTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  week_phase_plan: Record<string, Record<string, number>>;
  is_active: boolean;
  created_at: string;
};

export type ProgramTemplateSession = {
  id: string;
  template_id: string;
  session_index: number;
  title_template: string;
  phase: ExercisePhase;
};

export type ProgramTemplateSlot = {
  id: string;
  template_session_id: string;
  slot_order: number;
  selection_criteria: Record<string, unknown>;
};

export type ExerciseReplacementGroup = {
  id: string;
  movement_pattern: string;
  exercise_id: string;
  priority: number;
};

export type UserProgramPlanStatus = 'active' | 'superseded' | 'preview';

export type UserProgramPlan = {
  id: string;
  user_id: string;
  template_id: string | null;
  rules_version: number;
  program_name: string;
  subtitle: string | null;
  tagline: string | null;
  duration_weeks: number;
  sessions_per_week: number;
  start_week: number;
  status: UserProgramPlanStatus;
  primary_focus: string | null;
  secondary_focus: string | null;
  created_at: string;
  superseded_at: string | null;
};

export type UserPlanSession = {
  id: string;
  plan_id: string;
  week_number: number;
  session_number: number;
  title: string;
  phase: string;
  estimated_minutes: number;
  intensity_tier: number;
};

export type UserPlanSessionExercise = {
  id: string;
  plan_session_id: string;
  exercise_id: string;
  order_index: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  load_tier: number;
};

export type UserWeeklyRampDecision = {
  id: string;
  plan_id: string;
  user_id: string;
  week_number: number;
  suggestion: 'progress' | 'hold';
  decision: 'progress' | 'hold';
  pain_delta: number | null;
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
          pain_type: PainType[];
          activity_level: OnboardingAnswers['activity_level'];
          pain_trigger: PainTrigger[];
          equipment?: OnboardingAnswers['equipment'];
          main_goal: MainGoal[];
          sessions_per_week_preference?: number | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          pain_location?: OnboardingAnswers['pain_location'];
          pain_duration?: OnboardingAnswers['pain_duration'];
          pain_type?: PainType[];
          activity_level?: OnboardingAnswers['activity_level'];
          pain_trigger?: PainTrigger[];
          equipment?: OnboardingAnswers['equipment'];
          main_goal?: MainGoal[];
          sessions_per_week_preference?: number | null;
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
          equipment_tier?: EquipmentTier;
          pain_areas?: string[];
          intensity_tier?: number;
          movement_pattern?: string;
          pain_types_safe?: string[];
          triggers_addressed?: string[];
          goals_weight?: Record<string, number>;
          effectiveness?: number;
          fatigue_cost?: number;
          usefulness?: number;
          aggravates?: string[];
          phase?: ExercisePhase;
          duration_minutes_est?: number;
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
          equipment_tier?: EquipmentTier;
          pain_areas?: string[];
          intensity_tier?: number;
          movement_pattern?: string;
          pain_types_safe?: string[];
          triggers_addressed?: string[];
          goals_weight?: Record<string, number>;
          effectiveness?: number;
          fatigue_cost?: number;
          usefulness?: number;
          aggravates?: string[];
          phase?: ExercisePhase;
          duration_minutes_est?: number;
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
        Relationships: [
          {
            foreignKeyName: 'session_exercises_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'program_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
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
          active_plan_id?: string | null;
        };
        Update: {
          program_id?: string;
          started_at?: string | null;
          current_week?: number;
          current_session?: number;
          active_plan_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_programs_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      session_completions: {
        Row: SessionCompletion;
        Insert: {
          id?: string;
          user_id: string;
          program_session_id?: string | null;
          plan_session_id?: string | null;
          completed_at?: string;
          duration_seconds?: number | null;
        };
        Update: {
          program_session_id?: string | null;
          plan_session_id?: string | null;
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
      assignment_rules: {
        Row: AssignmentRule;
        Insert: {
          id?: string;
          version: number;
          is_active?: boolean;
          rules: Record<string, unknown>;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          version?: number;
          is_active?: boolean;
          rules?: Record<string, unknown>;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      program_templates: {
        Row: ProgramTemplate;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description: string;
          week_phase_plan?: Record<string, Record<string, number>>;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          description?: string;
          week_phase_plan?: Record<string, Record<string, number>>;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      program_template_sessions: {
        Row: ProgramTemplateSession;
        Insert: {
          id?: string;
          template_id: string;
          session_index: number;
          title_template: string;
          phase: ExercisePhase;
        };
        Update: {
          template_id?: string;
          session_index?: number;
          title_template?: string;
          phase?: ExercisePhase;
        };
        Relationships: [];
      };
      program_template_slots: {
        Row: ProgramTemplateSlot;
        Insert: {
          id?: string;
          template_session_id: string;
          slot_order: number;
          selection_criteria?: Record<string, unknown>;
        };
        Update: {
          template_session_id?: string;
          slot_order?: number;
          selection_criteria?: Record<string, unknown>;
        };
        Relationships: [];
      };
      exercise_replacement_groups: {
        Row: ExerciseReplacementGroup;
        Insert: {
          id?: string;
          movement_pattern: string;
          exercise_id: string;
          priority?: number;
        };
        Update: {
          movement_pattern?: string;
          exercise_id?: string;
          priority?: number;
        };
        Relationships: [];
      };
      user_program_plans: {
        Row: UserProgramPlan;
        Insert: {
          id?: string;
          user_id: string;
          template_id?: string | null;
          rules_version: number;
          program_name: string;
          subtitle?: string | null;
          tagline?: string | null;
          duration_weeks: number;
          sessions_per_week: number;
          start_week?: number;
          status?: UserProgramPlanStatus;
          primary_focus?: string | null;
          secondary_focus?: string | null;
          created_at?: string;
          superseded_at?: string | null;
        };
        Update: {
          status?: UserProgramPlanStatus;
          program_name?: string;
          subtitle?: string | null;
          tagline?: string | null;
          superseded_at?: string | null;
        };
        Relationships: [];
      };
      user_plan_sessions: {
        Row: UserPlanSession;
        Insert: {
          id?: string;
          plan_id: string;
          week_number: number;
          session_number: number;
          title: string;
          phase: string;
          estimated_minutes?: number;
          intensity_tier?: number;
        };
        Update: {
          title?: string;
          phase?: string;
          estimated_minutes?: number;
          intensity_tier?: number;
        };
        Relationships: [];
      };
      user_plan_session_exercises: {
        Row: UserPlanSessionExercise;
        Insert: {
          id?: string;
          plan_session_id: string;
          exercise_id: string;
          order_index: number;
          sets?: number | null;
          reps?: number | null;
          duration_seconds?: number | null;
          rest_seconds?: number;
          load_tier?: number;
        };
        Update: {
          order_index?: number;
          sets?: number | null;
          reps?: number | null;
          duration_seconds?: number | null;
          rest_seconds?: number;
          load_tier?: number;
        };
        Relationships: [];
      };
      user_weekly_ramp_decisions: {
        Row: UserWeeklyRampDecision;
        Insert: {
          id?: string;
          plan_id: string;
          user_id: string;
          week_number: number;
          suggestion: 'progress' | 'hold';
          decision: 'progress' | 'hold';
          pain_delta?: number | null;
          created_at?: string;
        };
        Update: {
          decision?: 'progress' | 'hold';
          pain_delta?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
