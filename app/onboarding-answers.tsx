import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  BackHandler,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { answersViewed } from '../lib/analytics/events/engagement';
import { onboardingAnswersInputSchema } from '../lib/schemas';
import {
  applyStatusCopy,
  flushPendingProgramApply,
  saveProgramAnswers,
} from '../lib/applyProgramAnswers';
import { colors } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';
import { hapticWarning, hapticSelection } from '../lib/haptics';
import { OptionCard } from '../components/onboarding/OptionCard';
import {
  PROGRAM_ANSWER_ROWS,
  durationOptionIdFor,
  editorOptionsFor,
  formatProgramAnswer,
  type ProgramAnswerKey,
} from '../constants/onboardingQuestions';
import type { OnboardingAnswersInput } from '../lib/schemas';
import type { OnboardingAnswers } from '../types/database';

type Draft = OnboardingAnswersInput;

function toDraft(row: OnboardingAnswers): Draft | null {
  const parsed = onboardingAnswersInputSchema.safeParse({
    pain_location: row.pain_location,
    pain_duration: row.pain_duration,
    pain_type: row.pain_type,
    activity_level: row.activity_level,
    pain_trigger: row.pain_trigger,
    equipment: row.equipment,
    main_goal: row.main_goal,
    sessions_per_week_preference: row.sessions_per_week_preference,
  });
  return parsed.success ? parsed.data : null;
}

function normalizeDraft(d: Draft): Draft {
  return {
    ...d,
    pain_type: [...d.pain_type].sort(),
    pain_trigger: [...d.pain_trigger].sort(),
    main_goal: [...d.main_goal].sort(),
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return JSON.stringify(normalizeDraft(a)) === JSON.stringify(normalizeDraft(b));
}

function draftValue(draft: Draft, key: ProgramAnswerKey): unknown {
  return draft[key];
}

const SHEET_SLIDE_DISTANCE = 280;

export default function OnboardingAnswersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingApplyWeek, setPendingApplyWeek] = useState<number | null>(null);

  const [editorKey, setEditorKey] = useState<ProgramAnswerKey | null>(null);
  const [sheetPresented, setSheetPresented] = useState(false);
  const [multiBuffer, setMultiBuffer] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(SHEET_SLIDE_DISTANCE)).current;
  const sheetClosing = useRef(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const confirmScale = useRef(new Animated.Value(0.94)).current;
  const confirmClosing = useRef(false);

  const dirty = saved !== null && draft !== null && !draftsEqual(saved, draft);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from('onboarding_answers').select('*').eq('user_id', user.id).single(),
      supabase
        .from('user_programs')
        .select('pending_apply_week')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]).then(([answersRes, programRes]) => {
      const parsed = answersRes.data ? toDraft(answersRes.data) : null;
      setSaved(parsed);
      setDraft(parsed);
      setPendingApplyWeek(programRes.data?.pending_apply_week ?? null);
      setLoading(false);
    });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      answersViewed({ source_screen: 'profile' });
      // Don't refetch while editing — a blur/refocus (app backgrounded, modal)
      // would wipe in-progress draft changes.
      if (!editing) load();
    }, [load, editing]),
  );

  function discardAndLeave() {
    setEditing(false);
    setEditorKey(null);
    setDraft(saved);
    router.back();
  }

  function requestExit() {
    if (!editing || !dirty) {
      discardAndLeave();
      return;
    }
    Alert.alert('Exit without saving?', 'Your changes will be discarded. Your current program stays as it is.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: discardAndLeave },
    ]);
  }

  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit();
      return true;
    });
    return () => sub.remove();
  }, [editing, dirty, saved]);

  function handleEdit() {
    hapticWarning();
    setEditConfirmOpen(true);
  }

  useEffect(() => {
    if (!editConfirmOpen) return;
    confirmClosing.current = false;
    confirmOpacity.setValue(0);
    confirmScale.setValue(0.94);
    Animated.parallel([
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(confirmScale, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [editConfirmOpen, confirmOpacity, confirmScale]);

  function closeEditConfirm(after?: () => void) {
    if (!editConfirmOpen || confirmClosing.current) return;
    confirmClosing.current = true;
    Animated.parallel([
      Animated.timing(confirmOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(confirmScale, {
        toValue: 0.96,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      confirmClosing.current = false;
      if (!finished) return;
      setEditConfirmOpen(false);
      after?.();
    });
  }

  function openEditor(key: ProgramAnswerKey) {
    if (!editing || !draft) return;
    hapticSelection();
    const row = PROGRAM_ANSWER_ROWS.find((r) => r.key === key);
    if (row?.multi) {
      const current = draft[key];
      setMultiBuffer(Array.isArray(current) ? current.map(String) : []);
    } else if (key === 'pain_duration') {
      const id = durationOptionIdFor(draft.pain_duration);
      setPendingId(id);
      setPendingValue(draft.pain_duration);
    } else if (key === 'sessions_per_week_preference') {
      const value = String(draft.sessions_per_week_preference);
      setPendingId(value);
      setPendingValue(value);
    } else {
      const value = String(draftValue(draft, key));
      setPendingId(value);
      setPendingValue(value);
    }
    setEditorKey(key);
    setSheetPresented(true);
  }

  function closeEditor() {
    if (!sheetPresented || sheetClosing.current) return;
    sheetClosing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslate, {
        toValue: SHEET_SLIDE_DISTANCE,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      sheetClosing.current = false;
      if (!finished) return;
      setSheetPresented(false);
      setEditorKey(null);
    });
  }

  useEffect(() => {
    if (!sheetPresented) return;
    sheetClosing.current = false;
    backdropOpacity.setValue(0);
    sheetTranslate.setValue(SHEET_SLIDE_DISTANCE);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslate, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [sheetPresented, backdropOpacity, sheetTranslate]);

  function applySingle(key: ProgramAnswerKey, optionId: string, value: string) {
    if (!draft) return;
    if (key === 'sessions_per_week_preference') {
      setDraft({ ...draft, sessions_per_week_preference: Number(value) });
    } else if (key === 'pain_duration') {
      setDraft({
        ...draft,
        pain_duration: value as Draft['pain_duration'],
      });
    } else if (key === 'pain_location') {
      setDraft({ ...draft, pain_location: value as Draft['pain_location'] });
    } else if (key === 'activity_level') {
      setDraft({ ...draft, activity_level: value as Draft['activity_level'] });
    } else if (key === 'equipment') {
      setDraft({ ...draft, equipment: value as Draft['equipment'] });
    }
  }

  function toggleMulti(value: string) {
    setMultiBuffer((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function commitMulti() {
    if (!draft || !editorKey) return;
    if (multiBuffer.length === 0) {
      Alert.alert('Pick at least one', 'Select one or more options to continue.');
      return;
    }
    if (editorKey === 'pain_type') {
      setDraft({ ...draft, pain_type: multiBuffer as Draft['pain_type'] });
    } else if (editorKey === 'pain_trigger') {
      setDraft({ ...draft, pain_trigger: multiBuffer as Draft['pain_trigger'] });
    } else if (editorKey === 'main_goal') {
      setDraft({ ...draft, main_goal: multiBuffer as Draft['main_goal'] });
    }
  }

  function saveEditor() {
    if (!editorKey || !draft) return;
    if (editorRow?.multi) {
      if (multiBuffer.length === 0) {
        Alert.alert('Pick at least one', 'Select one or more options to continue.');
        return;
      }
      commitMulti();
    } else {
      if (pendingValue == null || pendingId == null) return;
      applySingle(editorKey, pendingId, pendingValue);
    }
    closeEditor();
  }

  async function handleSave() {
    if (!user || !draft || !dirty) return;
    const parsed = onboardingAnswersInputSchema.safeParse(draft);
    if (!parsed.success) {
      Alert.alert('Incomplete answers', 'Please fill in every answer before saving.');
      return;
    }
    hapticWarning();
    setSaving(true);
    const savedResult = await saveProgramAnswers(parsed.data);
    if (!savedResult.ok) {
      setSaving(false);
      Alert.alert('Could not save', savedResult.error);
      return;
    }
    if (savedResult.data.apply_now) {
      const flushed = await flushPendingProgramApply();
      if (flushed === 'failed') {
        setSaving(false);
        Alert.alert(
          'Answers saved',
          'We could not update this week yet. We will try again the next time you open Home.',
        );
        setSaved(parsed.data);
        setPendingApplyWeek(savedResult.data.pending_apply_week);
        setEditing(false);
        return;
      }
    }
    setSaved(parsed.data);
    setDraft(parsed.data);
    setPendingApplyWeek(savedResult.data.pending_apply_week);
    setSaving(false);
    setEditing(false);
    Alert.alert('Saved', applyStatusCopy(savedResult.data));
  }

  const editorRow = editorKey ? PROGRAM_ANSWER_ROWS.find((r) => r.key === editorKey) : null;
  const editorOptions =
    editorKey && draft ? editorOptionsFor(editorKey, draftValue(draft, editorKey)) : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={editing ? requestExit : () => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.navSide}
        >
          <Text style={styles.navSideText}>{editing ? 'Exit' : '‹ Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Your Program</Text>
        <View style={styles.navSide}>
          {!editing && draft && (
            <TouchableOpacity onPress={handleEdit} activeOpacity={0.7} style={styles.navAction}>
              <Text style={styles.navActionText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (editing ? 140 : 32) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : !draft ? (
          <Text style={styles.empty}>No answers found.</Text>
        ) : (
          <>
            <Text style={styles.explainer}>
              {editing
                ? 'Tap any row to change it. Save at the bottom when you\u2019re done \u2014 or Exit to leave without saving.'
                : 'These choices shape your program. You can change them anytime.'}
            </Text>

            <View style={styles.card}>
              {PROGRAM_ANSWER_ROWS.map((row, idx) => (
                <React.Fragment key={row.key}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => openEditor(row.key)}
                    activeOpacity={editing ? 0.7 : 1}
                    disabled={!editing}
                  >
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <View style={styles.rowValueWrap}>
                      <Text style={styles.rowValue}>
                        {formatProgramAnswer(row.key, draftValue(draft, row.key))}
                      </Text>
                      {editing && <Text style={styles.rowChevron}>›</Text>}
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>

            {pendingApplyWeek !== null && (
              <Text style={styles.cooldownHint}>
                Your plan updates at the start of week {pendingApplyWeek}. This week stays as it is.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {editing && draft && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[
              styles.rebuildButton,
              (!dirty || saving) && styles.rebuildButtonDisabled,
            ]}
            onPress={() => {
              void handleSave();
            }}
            activeOpacity={0.85}
            disabled={!dirty || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.rebuildText}>Save answers</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={requestExit} activeOpacity={0.7} style={styles.exitLink}>
            <Text style={styles.exitLinkText}>Exit without saving</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={editConfirmOpen}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={() => closeEditConfirm()}
      >
        <View style={styles.confirmRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.modalDim, { opacity: confirmOpacity }]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeEditConfirm()} />
          <Animated.View
            style={[
              styles.confirmCard,
              {
                opacity: confirmOpacity,
                transform: [{ scale: confirmScale }],
              },
            ]}
          >
            <Text style={styles.confirmTitle}>Edit your program?</Text>
            <Text style={styles.confirmBody}>
              Your current week stays. We\u2019ll apply bigger changes at the start of your next week.
            </Text>
            <TouchableOpacity
              style={styles.modalDone}
              onPress={() => closeEditConfirm(() => setEditing(true))}
              activeOpacity={0.85}
            >
              <Text style={styles.modalDoneText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => closeEditConfirm()}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={sheetPresented}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={closeEditor}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View
            pointerEvents="none"
            style={[styles.modalDim, { opacity: backdropOpacity }]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditor} />
          <Animated.View
            style={[
              styles.modalSheet,
              {
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY: sheetTranslate }],
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editorRow?.label ?? 'Edit'}</Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalOptions}>
                {editorOptions.map((opt) => {
                  const selected = editorRow?.multi
                    ? multiBuffer.includes(opt.value)
                    : pendingId === opt.id;
                  return (
                    <OptionCard
                      key={opt.id}
                      label={opt.label}
                      subtitle={opt.subtitle}
                      badge={opt.badge}
                      selected={selected}
                      onPress={() => {
                        if (editorRow?.multi) {
                          toggleMulti(opt.value);
                        } else {
                          setPendingId(opt.id);
                          setPendingValue(opt.value);
                        }
                      }}
                    />
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.modalDone} onPress={saveEditor} activeOpacity={0.85}>
              <Text style={styles.modalDoneText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={closeEditor} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  navSide: {
    width: 72,
  },
  navSideText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  navAction: {
    alignSelf: 'flex-end',
  },
  navActionText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'right',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 40,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: 20,
    ...shadows.low,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  rowValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginLeft: 12,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  rowChevron: {
    fontSize: 18,
    color: colors.textTertiary,
    marginLeft: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 20,
  },
  explainer: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  cooldownHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 8,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  rebuildButton: {
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    ...shadows.low,
  },
  rebuildButtonDisabled: {
    opacity: 0.45,
  },
  rebuildText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exitLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  exitLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 30, 0.36)',
  },
  confirmRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    ...shadows.low,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 10,
    maxHeight: '82%',
    ...shadows.low,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalOptions: {
    gap: 12,
    paddingBottom: 12,
  },
  modalDone: {
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
