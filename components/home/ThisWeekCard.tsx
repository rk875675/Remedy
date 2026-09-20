import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import {
  DAY_LABELS,
  WeekPlanList,
  equipmentLabel,
  type WeekSession,
} from '../progress/WorkoutDaysModal';
import { todayDayIndex } from '../../lib/workoutDays';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { weeklyMindsetLine } from '../../constants/mindset';

export const STORAGE_WEEK_PLAN_COLLAPSED = 'remedy_week_plan_collapsed';

type Props = {
  workoutDays: number[];
  displayWeekDays: boolean[];
  weekSessions: WeekSession[];
  sessionsPerWeek: number;
  sessionsThisWeek: number;
  userEquipment: string | null;
  weekPlanCollapsed: boolean;
  onToggleCollapsed: () => void;
  onEditDays: () => void;
  showReminderNudge?: boolean;
  onReminderNudgePress?: () => void;
  weekNumber?: number;
};

/** Compact current-week schedule for Home. */
export function ThisWeekCard({
  workoutDays,
  displayWeekDays,
  weekSessions,
  sessionsPerWeek,
  sessionsThisWeek,
  userEquipment,
  weekPlanCollapsed,
  onToggleCollapsed,
  onEditDays,
  showReminderNudge = false,
  onReminderNudgePress,
  weekNumber,
}: Props) {
  const weekSessionCount = weekSessions.length > 0 ? weekSessions.length : sessionsPerWeek;
  const weekMinutes = weekSessions.reduce((sum, s) => sum + s.estimated_minutes, 0);
  const mindsetLine = weekNumber != null ? weeklyMindsetLine(weekNumber) : null;
  return (
    <View style={[styles.wrap, showReminderNudge && styles.wrapWithNudge]}>
      {showReminderNudge && onReminderNudgePress ? (
        <ReminderNudgeTab onPress={onReminderNudgePress} />
      ) : null}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>This Week</Text>
          <TouchableOpacity
            onPress={onEditDays}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={workoutDays.length > 0 ? 'Edit workout days' : 'Set workout days'}
          >
            <Text style={styles.editLink}>
              {workoutDays.length > 0 ? 'Edit days' : 'Set days'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.count, mindsetLine ? styles.countWithMindset : null]}
          accessibilityLabel={`${sessionsThisWeek} of ${sessionsPerWeek} sessions this week`}
        >
          {sessionsThisWeek}
          <Text style={styles.countDim}> of {sessionsPerWeek} sessions</Text>
        </Text>

        {mindsetLine ? <Text style={styles.mindset}>{mindsetLine}</Text> : null}

        <View style={styles.weekRow}>
          {DAY_LABELS.map((label, i) => {
            const todayIdx = todayDayIndex();
            const isCompleted = displayWeekDays[i];
            const isScheduled = workoutDays.includes(i);
            const isPlanned = !isCompleted && isScheduled && i >= todayIdx;
            const isMissed = !isCompleted && isScheduled && i < todayIdx;
            return (
              <View key={i} style={styles.dayCol}>
                <View
                  style={[
                    styles.dayCircle,
                    isPlanned && styles.dayCirclePlanned,
                    isMissed && styles.dayCircleMissed,
                    isCompleted && styles.dayCircleFilled,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayInsideLabel,
                      isPlanned && styles.dayInsideLabelPlanned,
                      isMissed && styles.dayInsideLabelMissed,
                      isCompleted && styles.dayInsideLabelFilled,
                    ]}
                  >
                    {label.charAt(0)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {weekSessions.length > 0 && (
          <View style={styles.weekPlanSection}>
            <TouchableOpacity
              style={styles.planTab}
              onPress={onToggleCollapsed}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}
              accessibilityRole="button"
              accessibilityLabel={weekPlanCollapsed ? "Show this week's sessions" : "Hide this week's sessions"}
            >
              <Ionicons
                name={weekPlanCollapsed ? 'chevron-down' : 'chevron-up'}
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
            {!weekPlanCollapsed && (
              <View style={styles.weekPlanBody}>
                <Text style={styles.weekPlanMeta}>
                  {weekSessionCount} sessions/week
                  {weekMinutes > 0 ? `  ·  ~${weekMinutes} min` : ''}
                  {userEquipment ? `  ·  ${equipmentLabel(userEquipment)}` : ''}
                </Text>
                <WeekPlanList sessions={weekSessions} />
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function ReminderNudgeTab({ onPress }: { onPress: () => void }) {
  const float = useRef(new Animated.Value(0)).current;
  const ready = useAfterTransition();

  useEffect(() => {
    if (!ready) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -4,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, ready]);

  return (
    <Animated.View
      style={[styles.nudgeTab, { transform: [{ translateY: float }] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.nudgeTabInner}
        accessibilityRole="button"
        accessibilityLabel="Set up your reminders"
      >
        <Ionicons name="notifications-outline" size={13} color={colors.primary} />
        <Text style={styles.nudgeTabText}>Set up reminders</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  wrapWithNudge: {
    paddingTop: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16,
    ...shadows.low,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  editLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  count: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    fontVariant: ['tabular-nums'],
  },
  countWithMindset: {
    marginBottom: 8,
  },
  countDim: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  mindset: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 18,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekPlanSection: {
    marginTop: 12,
    alignItems: 'center',
  },
  planTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  weekPlanBody: {
    width: '100%',
    marginTop: 6,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 12,
  },
  weekPlanMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.circle,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCirclePlanned: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  dayCircleMissed: {
    backgroundColor: colors.secondaryMuted,
    borderColor: colors.secondaryMuted,
  },
  dayCircleFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayInsideLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayInsideLabelPlanned: {
    color: colors.primary,
  },
  dayInsideLabelMissed: {
    color: colors.secondary,
  },
  dayInsideLabelFilled: {
    color: '#FFFFFF',
  },
  nudgeTab: {
    position: 'absolute',
    top: 0,
    left: 16,
    zIndex: 2,
  },
  nudgeTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.circle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    ...shadows.medium,
  },
  nudgeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.2,
  },
});
