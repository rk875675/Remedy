import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { hapticPrimaryAction, hapticSelection } from '../lib/haptics';
import { colors, serifFont } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';

type Suggestion = 'progress' | 'hold';

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

// Weekly hybrid ramp. After the last session of a week, compute a suggestion from the
// pain check-in trend and let the user confirm in one tap. The decision is persisted;
// a DB trigger (migration 016) applies the intensity change to next week's snapshot.
export default function WeeklyRampScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ week?: string }>();
  // Validate/coerce the route param; default to week 1 on anything malformed.
  const week = z.coerce.number().int().min(1).max(52).catch(1).parse(params.week);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion>('progress');
  const [painDelta, setPainDelta] = useState<number | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data: up } = await supabase
        .from('user_programs')
        .select('active_plan_id')
        .eq('user_id', user.id)
        .single();
      const pid = up?.active_plan_id ?? null;
      if (!pid) {
        if (!cancelled) {
          setPlanId(null);
          setLoading(false);
        }
        return;
      }

      // Sessions resolved for the completed week.
      const { data: weekSessions } = await supabase
        .from('user_plan_sessions')
        .select('id')
        .eq('plan_id', pid)
        .eq('week_number', week);
      const sessionIds = (weekSessions ?? []).map((s) => s.id);

      let before: number[] = [];
      let after: number[] = [];
      if (sessionIds.length > 0) {
        const { data: comps } = await supabase
          .from('session_completions')
          .select('id, completed_at')
          .eq('user_id', user.id)
          .in('plan_session_id', sessionIds);
        const compIds = (comps ?? []).map((c) => c.id);

        if (compIds.length > 0) {
          const { data: afterRows } = await supabase
            .from('pain_checkins')
            .select('score')
            .eq('user_id', user.id)
            .eq('type', 'after')
            .in('session_completion_id', compIds);
          after = (afterRows ?? []).map((r) => r.score);

          const times = (comps ?? []).map((c) => new Date(c.completed_at).getTime());
          const minISO = new Date(Math.min(...times) - 6 * 3600 * 1000).toISOString();
          const maxISO = new Date(Math.max(...times)).toISOString();
          const { data: beforeRows } = await supabase
            .from('pain_checkins')
            .select('score')
            .eq('user_id', user.id)
            .eq('type', 'before')
            .gte('recorded_at', minISO)
            .lte('recorded_at', maxISO);
          before = (beforeRows ?? []).map((r) => r.score);
        }
      }

      const avgBefore = avg(before);
      const avgAfter = avg(after);
      let delta: number | null = null;
      let suggested: Suggestion = 'progress';
      if (avgBefore !== null && avgAfter !== null) {
        delta = Math.round((avgBefore - avgAfter) * 10) / 10;
        // Progress when sessions are not worsening pain and baseline isn't severe.
        suggested = avgAfter <= avgBefore + 0.5 && avgBefore <= 7 ? 'progress' : 'hold';
      }

      if (!cancelled) {
        setPlanId(pid);
        setPainDelta(delta);
        setSuggestion(suggested);
        setLoading(false);
        if (!tracked.current) {
          tracked.current = true;
          trackEvent('weekly_ramp_suggested', { week, suggestion: suggested, pain_delta: delta });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, week]);

  async function confirm(decision: Suggestion) {
    if (!user || !planId || submitting) return;
    hapticPrimaryAction();
    setSubmitting(true);

    await supabase.from('user_weekly_ramp_decisions').insert({
      plan_id: planId,
      user_id: user.id,
      week_number: week,
      suggestion,
      decision,
      pain_delta: painDelta,
    });

    trackEvent('weekly_ramp_confirmed', { week, suggestion, decision, pain_delta: painDelta });
    router.replace('/(tabs)');
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // No active plan (shouldn't happen) — just continue.
  if (!planId) {
    router.replace('/(tabs)');
    return null;
  }

  const progressRecommended = suggestion === 'progress';
  const deltaLine =
    painDelta !== null
      ? painDelta > 0
        ? `Your pain dropped an average of ${painDelta} points per session this week.`
        : painDelta === 0
          ? 'Your pain held steady across sessions this week.'
          : 'Your pain ticked up slightly this week.'
      : 'Nice work completing the week.';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>WEEK {week} COMPLETE</Text>
        <Text style={styles.title}>Ready for next week?</Text>
        <Text style={styles.body}>{deltaLine}</Text>

        <View style={styles.recCard}>
          <Text style={styles.recLabel}>Our suggestion</Text>
          <Text style={styles.recValue}>
            {progressRecommended ? 'Increase intensity' : 'Stay at your current level'}
          </Text>
          <Text style={styles.recHint}>
            {progressRecommended
              ? 'You are responding well — a small bump in reps and load will keep you progressing.'
              : 'We will keep next week at the same intensity so your body can keep adapting.'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => confirm('progress')}
          disabled={submitting}
        >
          <Text style={styles.buttonPrimaryText}>
            Progress{progressRecommended ? ' (Recommended)' : ''}
          </Text>
        </Pressable>
        <Pressable
          style={styles.buttonGhost}
          onPress={() => {
            hapticSelection();
            confirm('hold');
          }}
          disabled={submitting}
        >
          <Text style={styles.buttonGhostText}>
            Stay at current level{!progressRecommended ? ' (Recommended)' : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    marginBottom: 28,
  },
  recCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 22,
    ...shadows.low,
  },
  recLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  recValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  recHint: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  footer: {
    gap: 12,
  },
  button: {
    height: 56,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  buttonPrimaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonGhost: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhostText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
