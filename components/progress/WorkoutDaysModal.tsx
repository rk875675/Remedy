import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
} from 'react-native';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { hapticSelection } from '../../lib/haptics';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  requestPermissions,
  scheduleWorkoutReminders,
  cancelWorkoutReminders,
} from '../../lib/notifications';
import {
  dailyReminderDisabled,
  dailyReminderEnabled,
} from '../../lib/analytics/events/engagement';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateKey } from '../../lib/progress';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const STORAGE_WORKOUT_DAYS = 'remedy_workout_days';
export const STORAGE_WORKOUT_DAYS_SINCE = 'remedy_workout_days_since';
export const STORAGE_NOTIF = 'remedy_notifications_enabled';
export const STORAGE_NOTIF_TIME = 'remedy_notification_time';

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type WeekSession = {
  session_number: number;
  title: string;
  phase: string;
  estimated_minutes: number;
};

export type WorkoutDaysSave = {
  days: number[];
  notifEnabled: boolean;
  hour: number;
  minute: number;
};

function easeLayout() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      240,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ),
  );
}

export function equipmentLabel(tier: string | null): string {
  if (tier === 'gym') return 'Gym equipment';
  if (tier === 'bands_dumbbells') return 'Bands & dumbbells';
  if (tier === 'open_space') return 'No equipment';
  return '';
}

export function phaseColor(phase: string): string {
  if (phase === 'strength') return colors.primary;
  if (phase === 'mobility') return colors.secondary;
  if (phase === 'activation') return colors.warning;
  return colors.textSecondary;
}

export function formatTime12(h: number, m: number): string {
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const period = h < 12 ? 'AM' : 'PM';
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function WeekPlanList({ sessions }: { sessions: WeekSession[] }) {
  return (
    <>
      {sessions.map((s) => (
        <View key={s.session_number} style={planStyles.row}>
          <View style={[planStyles.dot, { backgroundColor: phaseColor(s.phase) }]} />
          <Text style={planStyles.title} numberOfLines={1}>
            {s.title}
          </Text>
          <Text style={planStyles.time}>~{s.estimated_minutes} min</Text>
        </View>
      ))}
    </>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (result: WorkoutDaysSave) => void;
  /** When opening from the Profile toggle, start with reminders on. */
  preferNotifOn?: boolean;
  weekSessions?: WeekSession[];
  sessionsPerWeek?: number;
  userEquipment?: string | null;
  initialDays?: number[];
  initialNotif?: boolean;
  initialHour?: number;
  initialMinute?: number;
  /** Opens the same edit-program screen as Profile → Edit your program. */
  onEditProgram?: () => void;
};

export function WorkoutDaysModal(props: Props) {
  // Body destructure (not parameter destructure): Hermes cannot close over
  // renamed parameter bindings inside nested functions — hydrate() crashed with
  // "Property 'weekSessionsProp' doesn't exist" and red-screened Home.
  const {
    visible,
    onClose,
    onSaved,
    preferNotifOn = false,
    weekSessions: weekSessionsProp,
    sessionsPerWeek: sessionsPerWeekProp,
    userEquipment: userEquipmentProp,
    initialDays,
    initialNotif,
    initialHour,
    initialMinute,
    onEditProgram,
  } = props;
  const { user } = useAuth();

  const [pendingDays, setPendingDays] = useState<number[]>([]);
  const [pendingNotif, setPendingNotif] = useState(false);
  const [pendingHour, setPendingHour] = useState(9);
  const [pendingMinute, setPendingMinute] = useState(0);
  const [weekSessions, setWeekSessions] = useState<WeekSession[]>([]);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [userEquipment, setUserEquipment] = useState<string | null>(null);
  // Snapshot of whether reminders were already on when the sheet opened.
  // preferNotifOn means the Profile toggle just flipped on — previous state is off.
  const notifWasEnabled = useRef(false);

  useEffect(() => {
    if (!visible) return;

    notifWasEnabled.current = !preferNotifOn && initialNotif === true;
    setPendingDays(initialDays ?? []);
    setPendingNotif(preferNotifOn || initialNotif === true);
    setPendingHour(initialHour ?? 9);
    setPendingMinute(initialMinute ?? 0);
    if (weekSessionsProp !== undefined) setWeekSessions(weekSessionsProp);
    if (sessionsPerWeekProp != null) setSessionsPerWeek(sessionsPerWeekProp);
    if (userEquipmentProp !== undefined) setUserEquipment(userEquipmentProp);

    void hydrate();
    // Only re-hydrate when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (weekSessionsProp !== undefined) setWeekSessions(weekSessionsProp);
    if (sessionsPerWeekProp != null) setSessionsPerWeek(sessionsPerWeekProp);
  }, [visible, weekSessionsProp, sessionsPerWeekProp]);

  async function hydrate() {
    const [storedDays, storedNotif, storedTime] = await Promise.all([
      AsyncStorage.getItem(STORAGE_WORKOUT_DAYS),
      AsyncStorage.getItem(STORAGE_NOTIF),
      AsyncStorage.getItem(STORAGE_NOTIF_TIME),
    ]);

    if (initialDays == null) {
      try {
        if (storedDays) setPendingDays(JSON.parse(storedDays) as number[]);
      } catch { /* ignore */ }
    }
    if (initialNotif == null && !preferNotifOn) {
      const storedOn = storedNotif === 'true';
      notifWasEnabled.current = storedOn;
      setPendingNotif(storedOn);
    }
    if (initialHour == null && storedTime) {
      try {
        const t = JSON.parse(storedTime) as { hour: number; minute: number };
        setPendingHour(t.hour);
        setPendingMinute(t.minute);
      } catch { /* ignore */ }
    }

    if (weekSessionsProp !== undefined) return;
    if (!user) return;

    const { data: up } = await supabase
      .from('user_programs')
      .select('active_plan_id, current_week')
      .eq('user_id', user.id)
      .single();

    const { data: answers } = await supabase
      .from('onboarding_answers')
      .select('equipment')
      .eq('user_id', user.id)
      .single();

    if (answers?.equipment) setUserEquipment(answers.equipment);

    if (!up?.active_plan_id) return;

    const [planRes, sessionsRes] = await Promise.all([
      supabase
        .from('user_program_plans')
        .select('sessions_per_week')
        .eq('id', up.active_plan_id)
        .eq('status', 'active')
        .single(),
      supabase
        .from('user_plan_sessions')
        .select('session_number, title, phase, estimated_minutes')
        .eq('plan_id', up.active_plan_id)
        .eq('week_number', up.current_week)
        .order('session_number'),
    ]);

    if (planRes.data) setSessionsPerWeek(planRes.data.sessions_per_week);
    if (!sessionsRes.error) setWeekSessions(sessionsRes.data ?? []);
  }

  function togglePendingDay(dayIndex: number) {
    hapticSelection();
    setPendingDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex],
    );
  }

  function stepTime(deltaMinutes: number) {
    hapticSelection();
    const total = pendingHour * 60 + pendingMinute + deltaMinutes;
    const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    setPendingHour(Math.floor(wrapped / 60));
    setPendingMinute(wrapped % 60);
  }

  async function save() {
    const sortedDays = [...pendingDays].sort((a, b) => a - b);

    await AsyncStorage.setItem(STORAGE_WORKOUT_DAYS, JSON.stringify(sortedDays));
    await AsyncStorage.setItem(STORAGE_WORKOUT_DAYS_SINCE, localDateKey(new Date()));
    await AsyncStorage.setItem(
      STORAGE_NOTIF_TIME,
      JSON.stringify({ hour: pendingHour, minute: pendingMinute }),
    );
    // Reflects what actually got scheduled, not what was asked for: writing 'true' before
    // knowing the permission outcome left the toggle on with no reminders behind it.
    let remindersOn = false;

    if (pendingNotif && user) {
      // Never let a permission/token failure abort the save — the day selection must
      // still persist and the sheet must still close.
      let granted = false;
      try {
        granted = await requestPermissions(user.id, 'workout_reminder');
      } catch {
        granted = false;
      }
      if (granted) {
        try {
          await scheduleWorkoutReminders(sortedDays, pendingHour, pendingMinute);
          remindersOn = true;
        } catch {
          remindersOn = false;
        }
      }
      if (remindersOn && !notifWasEnabled.current) {
        dailyReminderEnabled({
          hour: pendingHour,
          minute: pendingMinute,
          purpose: 'workout_reminder',
        });
      }
      if (!remindersOn) {
        Alert.alert(
          'Reminders are off',
          'Remedy needs notification permission to remind you. Turn on Notifications for Remedy in iOS Settings, then try again.',
        );
      }
    } else {
      await cancelWorkoutReminders();
      if (notifWasEnabled.current) {
        dailyReminderDisabled();
      }
    }

    await AsyncStorage.setItem(STORAGE_NOTIF, remindersOn ? 'true' : 'false');

    onSaved({
      days: sortedDays,
      notifEnabled: remindersOn,
      hour: pendingHour,
      minute: pendingMinute,
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={sheet.container}>
        <View style={sheet.handle} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={sheet.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={sheet.title}>Workout Days</Text>
          <View style={sheet.intro}>
            <Text style={sheet.subtitle}>
              Pick your {sessionsPerWeek} training day{sessionsPerWeek !== 1 ? 's' : ''}, one per session
            </Text>
            <Text style={sheet.dayCount}>
              {pendingDays.length} of {sessionsPerWeek} selected
            </Text>
          </View>

          <View style={sheet.dayBlock}>
            <View style={sheet.dayRow}>
              {DAY_LABELS.map((label, i) => {
                const selected = pendingDays.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[sheet.dayBubble, selected && sheet.dayBubbleSelected]}
                    onPress={() => togglePendingDay(i)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[sheet.dayBubbleLabel, selected && sheet.dayBubbleLabelSelected]}
                    >
                      {label.charAt(0)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {weekSessions.length > 0 && (
              <View style={sheet.planSection}>
                <Text style={sheet.planMeta}>
                  {weekSessions.length} session{weekSessions.length !== 1 ? 's' : ''}
                  {`  ·  ~${weekSessions.reduce((sum, s) => sum + s.estimated_minutes, 0)} min`}
                  {userEquipment ? `  ·  ${equipmentLabel(userEquipment)}` : ''}
                </Text>
                <WeekPlanList sessions={weekSessions} />
              </View>
            )}
          </View>

          <View style={sheet.divider} />

          <View style={sheet.notifRow}>
            <Text style={sheet.notifLabel}>Workout reminder</Text>
            <Switch
              value={pendingNotif}
              onValueChange={(v) => {
                hapticSelection();
                easeLayout();
                setPendingNotif(v);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={pendingNotif ? colors.surface : '#F4F4F4'}
            />
          </View>

          {pendingNotif && (
            <View style={sheet.timeRow}>
              <Text style={sheet.timeLabel}>Reminder time</Text>
              <View style={sheet.timeStepper}>
                <TouchableOpacity
                  style={sheet.timeStepBtn}
                  onPress={() => stepTime(-30)}
                  activeOpacity={0.7}
                >
                  <Text style={sheet.timeStepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={sheet.timeValue}>
                  {formatTime12(pendingHour, pendingMinute)}
                </Text>
                <TouchableOpacity
                  style={sheet.timeStepBtn}
                  onPress={() => stepTime(30)}
                  activeOpacity={0.7}
                >
                  <Text style={sheet.timeStepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {onEditProgram ? (
            <>
              <View style={sheet.divider} />
              <TouchableOpacity
                style={sheet.editProgramRow}
                onPress={() => {
                  hapticSelection();
                  onEditProgram();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Edit your program"
              >
                <View style={sheet.editProgramTextCol}>
                  <Text style={sheet.editProgramLabel}>Want to change your program?</Text>
                  <Text style={sheet.editProgramCaption}>
                    Pain, equipment, schedule, and goals
                  </Text>
                </View>
                <Text style={sheet.editProgramChevron}>›</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <View style={sheet.divider} />

          <TouchableOpacity
            style={[sheet.saveButton, pendingDays.length !== sessionsPerWeek && sheet.saveButtonDisabled]}
            onPress={save}
            activeOpacity={0.8}
            disabled={pendingDays.length !== sessionsPerWeek}
          >
            <Text style={sheet.saveButtonText}>
              {pendingDays.length === sessionsPerWeek
                ? 'Save'
                : pendingDays.length < sessionsPerWeek
                ? `Select ${sessionsPerWeek - pendingDays.length} more day${sessionsPerWeek - pendingDays.length === 1 ? '' : 's'}`
                : `Deselect ${pendingDays.length - sessionsPerWeek} day${pendingDays.length - sessionsPerWeek === 1 ? '' : 's'}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={sheet.cancelButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={sheet.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const planStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  time: {
    fontSize: 13,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

const sheet = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  intro: {
    marginBottom: 22,
    gap: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  dayCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  dayBlock: {
    marginBottom: 24,
    gap: 16,
  },
  planSection: {
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  planMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayBubbleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dayBubbleLabelSelected: {
    color: '#FFFFFF',
  },
  editProgramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 20,
  },
  editProgramTextCol: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  editProgramLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  editProgramCaption: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  editProgramChevron: {
    fontSize: 20,
    color: colors.textTertiary,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: 20,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  notifLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  timeLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeStepBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    lineHeight: 22,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    minWidth: 80,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
