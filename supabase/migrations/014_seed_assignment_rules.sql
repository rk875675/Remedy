-- 014_seed_assignment_rules.sql
-- Seed v1 of the versioned assignment rules config (Layer 3).
--
-- This is the single extensible knob that maps onboarding answers -> scoring weights,
-- filters and modifiers. Adding a future onboarding question only requires adding a
-- new key under "answers" here (plus a column + a UI screen) — no exercise/template
-- reseed and no engine rewrite.
--
-- JSON cannot hold comments, so the clinical rationale + calibration notes live in the
-- SQL comments below and in the "_notes" string fields inside the payload.
--
-- // HUMAN INPUT NEEDED: exact duration_weeks ranges after PT research.
-- // RESEARCH: all effectiveness/intensity/frequency numbers below are clinically
--    plausible placeholders (non-specific low back pain rehab progressions, e.g.
--    NICE NG59, McGill stabilization, graded activity). Calibrate with a PT before launch.

INSERT INTO public.assignment_rules (version, is_active, notes, rules)
VALUES (
  1,
  true,
  'v1 seed — placeholder PT scores, calibrate before launch',
  $${
    "global": {
      "_notes": "Program length scales with chronicity; acute starts shortest and gentlest.",
      "duration_weeks": { "acute": 4, "subacute": 5, "chronic": 6 },
      "bodyweight_only_early_weeks": 2,
      "early_weeks": 2,
      "scoring": {
        "_notes": "Linear score = sum(weight_i * feature_i). Highest score wins each slot.",
        "effectiveness": 2.0,
        "pain_area_match": 3.0,
        "goal_weight": 2.5,
        "trigger_match": 1.5,
        "pain_type_pref": 1.0,
        "usefulness": 0.5,
        "phase_match": 1.5
      }
    },

    "activity_level": {
      "type": "routing",
      "_notes": "Activity level changes INTENSITY (reps/rest/fatigue budget), not the program tree. Sedentary+gym is still allowed gym equipment but stays conservative.",
      "intensity_multiplier": { "sedentary": 0.8, "light": 0.95, "active": 1.1, "athlete": 1.2 },
      "rest_multiplier":      { "sedentary": 1.2, "light": 1.05, "active": 0.95, "athlete": 0.85 },
      "fatigue_budget":       { "sedentary": 8,   "light": 10,   "active": 13,   "athlete": 16 }
    },

    "pain_duration": {
      "type": "routing",
      "_notes": "Acute = lower starting reps/rest, later strength. Chronic = earlier strengthening (graded activity for persistent LBP).",
      "starting_intensity_offset": { "acute": -1, "subacute": 0, "chronic": 0 },
      "strength_phase_start_fraction": { "acute": 0.5, "subacute": 0.4, "chronic": 0.25 },
      "bubble": {
        "acute": "We will start gentler and shorter, building up as you progress.",
        "subacute": "We will balance relief now with steady strengthening as you improve.",
        "chronic": "We will include more strengthening earlier to build lasting relief."
      }
    },

    "pain_location": {
      "type": "routing",
      "_notes": "Filter to exercises whose pain_areas include the user area or general. all = bias upper in first half of week, lower in second half.",
      "area_filter": { "upper": ["upper","general"], "middle": ["middle","general"], "lower": ["lower","general"], "all": ["upper","middle","lower","general"] },
      "all_week_bias": { "first_half": "upper", "second_half": "lower" },
      "contraindications": [
        {
          "_notes": "Lower-area + sharp/acute: avoid loaded spinal flexion in the early weeks (disc-sensitive presentations).",
          "when": { "pain_location": ["lower"], "pain_type": ["sharp"], "pain_duration": ["acute"] },
          "exclude_aggravates": ["flexion_loaded"],
          "apply_until_week_fraction": 0.5
        }
      ],
      "title_focus": { "upper": "Upper Back", "middle": "Mid Back", "lower": "Lower Back", "all": "Full Back" }
    },

    "pain_type": {
      "type": "routing",
      "_notes": "stiffness -> mobility-weighted; ache -> balanced; sharp -> stability-first + bodyweight-only early + exclude flexion_loaded early; multiple -> conservative union (safest set).",
      "phase_emphasis": {
        "stiffness": { "mobility": 0.2 },
        "ache": {},
        "sharp": { "activation": 0.2, "strength": -0.1 },
        "multiple": { "activation": 0.1, "strength": -0.1 }
      },
      "require_pain_types_safe": { "sharp": true, "multiple": true, "stiffness": false, "ache": false },
      "sharp_bodyweight_only_early": true,
      "exclude_aggravates_early": { "sharp": ["flexion_loaded"], "multiple": ["flexion_loaded","extension_loaded","impact"] },
      "bubble": {
        "sharp": "Early sessions avoid aggravating movements; loading increases gradually.",
        "multiple": "We will keep early sessions to the safest movements, then progress carefully."
      }
    },

    "pain_trigger": {
      "type": "routing",
      "_notes": "SECONDARY. Swap 1-2 exercises per session from pools tagged for the trigger. PT rationale documented per trigger.",
      "swap_per_session": 2,
      "emphasis": {
        "sitting":  { "_notes": "Prolonged sitting -> tight hip flexors, kyphotic load. Emphasize hip flexor lengthening, thoracic extension, glute activation.", "movement_patterns": ["hip_mobility","thoracic_mobility","glute_activation"] },
        "bending":  { "_notes": "Flexion-intolerant -> teach hip hinge, avoid loaded flexion early.", "movement_patterns": ["hip_hinge","glute_activation"], "exclude_aggravates_early": ["flexion_loaded"] },
        "morning":  { "_notes": "Morning stiffness -> bias gentle mobility in the first session of the week.", "movement_patterns": ["lumbar_mobility","thoracic_mobility"], "first_session_mobility_bias": true },
        "exercise": { "_notes": "Aggravated by activity -> gradual loading progression (not sport-specific in V1).", "movement_patterns": ["core_activation","posterior_chain_strength"] },
        "standing": { "_notes": "Standing intolerance -> postural endurance / stability.", "movement_patterns": ["spinal_stability","glute_activation"] }
      }
    },

    "main_goal": {
      "type": "routing",
      "_notes": "IMPACT question. Shifts slot weighting + load progression. Conflicts (e.g. return_to_exercise + sharp + acute) lean into goal but start safest; the weekly ramp controls progression.",
      "goal_key_for_weight": { "reduce_pain": "reduce_pain", "return_to_exercise": "return_to_exercise", "sleep": "sleep", "mobility": "mobility" },
      "phase_emphasis": {
        "reduce_pain": { "recovery": 0.15, "strength": -0.1 },
        "return_to_exercise": { "strength": 0.15 },
        "mobility": { "mobility": 0.2, "strength": -0.15 },
        "sleep": { "recovery": 0.1, "mobility": 0.05 }
      },
      "load_progression_accel_after_week": { "return_to_exercise": 2 },
      "title_focus": { "reduce_pain": "Pain Relief", "return_to_exercise": "Strength & Return", "sleep": "Recovery", "mobility": "Mobility" },
      "bubble": {
        "reduce_pain": "We will keep intensity conservative and prioritize relief.",
        "return_to_exercise": "We will progress toward heavier loading once your pain allows.",
        "sleep": "We will add gentle recovery and stretching emphasis.",
        "mobility": "We will prioritize range-of-motion work and ease into strength."
      }
    },

    "equipment": {
      "type": "routing",
      "_notes": "HARD FILTER. Tier hierarchy open_space < bands_dumbbells < gym. Never assign above tier; fall back to replacement pool (same movement_pattern + area + equal-or-lower intensity).",
      "tier_rank": { "open_space": 0, "bands_dumbbells": 1, "gym": 2 },
      "subtitle_when": { "open_space": "Bodyweight" },
      "bubble": {
        "open_space": "Your plan uses bodyweight exercises only — no weights required.",
        "bands_dumbbells": "Your plan uses bands and light dumbbells where helpful.",
        "gym": "Your plan can use full gym equipment as you progress."
      }
    },

    "sessions_per_week_preference": {
      "type": "routing",
      "_notes": "NEW (q8). Recommended default from activity_level x pain_duration. Distribute sessions across the week; avoid consecutive days for acute users.",
      "recommendation": {
        "sedentary": { "acute": 3, "subacute": 3, "chronic": 3 },
        "light":     { "acute": 3, "subacute": 3, "chronic": 4 },
        "active":    { "acute": 3, "subacute": 4, "chronic": 4 },
        "athlete":   { "acute": 4, "subacute": 4, "chronic": 5 }
      },
      "options": [2, 3, 4, 5],
      "avoid_consecutive_for": ["acute"],
      "bubble": {
        "2": "Lighter schedule — we will keep sessions efficient on your workout days.",
        "3": "A balanced, sustainable rhythm for steady progress.",
        "4": "A consistent cadence to build strength and mobility faster.",
        "5": "An ambitious schedule — we will manage fatigue across the week."
      }
    }
  }$$::jsonb
);
