import { useEffect, useRef, useState } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  BottomSheet,
  NoteCard,
  ObFooter,
  ObScreen,
  OptionList,
  OptionRow,
  PrimaryButton,
  RevealText,
  TextLink,
  ob,
  obType,
} from '../../components/onboarding/kit';
import { MedicalDisclaimer } from '../../components/legal/MedicalDisclaimer';
import { Pet } from '../../components/pet/Pet';
import { useOnboarding } from '../../context/OnboardingContext';
import {
  onboardingClinicianExitConfirmed,
  onboardingDisclaimerConfirmed,
  onboardingDisclaimerViewed,
} from '../../lib/analytics/events/onboarding';
import { RED_FLAGS, type Intake } from '../../lib/intake';
import { recordLegalAcceptances } from '../../lib/legalAcceptance';
import { trackDecision, useObStep } from '../../lib/onboardingFlow';
import { useOnboardingPet } from '../../lib/useOnboardingPet';

type RedFlag = (typeof RED_FLAGS)[number];

const COPY = {
  title: 'One careful check.',
  body: 'Remedy is exercise guidance, not medical care. A few things need a clinician before any exercise plan.',
  caption: 'Any of these right now?',
  none: 'None of these',
  continue: 'Continue',
  later:
    'For later: if the first two ever appear, stop and get urgent care the same day.',
  urgentTitle: 'Please get this checked today',
  urgentBody:
    'Numbness in the saddle area, new bladder or bowel trouble, or a leg that is getting weaker can be signs of a serious nerve problem. Please contact a doctor or urgent care today, before starting any exercise plan. If you continue from here, Remedy cannot stop you.',
  clinicianTitle: 'Check with a clinician first',
  clinicianBody:
    'What you selected is worth showing a doctor before you start exercising. If you continue from here, Remedy cannot stop you.',
  ack: "I'll get it checked first",
  back: 'Go back',
} as const;

const ROWS: ReadonlyArray<{ value: RedFlag; label: string }> = [
  {
    value: 'saddle_bladder',
    label:
      'Numbness around the groin or inner thighs, or new trouble controlling your bladder or bowels',
  },
  { value: 'leg_weakness', label: 'New or worsening weakness in a leg or foot' },
  { value: 'fever_unwell', label: 'Fever or feeling unwell along with the back pain' },
  { value: 'trauma', label: 'Pain that started with a major fall or accident' },
  { value: 'cancer_history', label: 'A history of cancer' },
  { value: 'weight_loss', label: "Weight loss you can't explain" },
  {
    value: 'surgery_uncleared',
    label: 'Back surgery in the last 3 months, or not yet cleared to exercise',
  },
];

const PET_SIZE = 130;
const PET_SIZE_TIGHT = 96;

function knownFlags(value: readonly string[] | undefined, showSurgery: boolean): RedFlag[] {
  if (!value) return [];
  const allowed = new Set<string>(RED_FLAGS);
  return value.filter(
    (flag): flag is RedFlag =>
      allowed.has(flag) && (flag !== 'surgery_uncleared' || showSurgery),
  );
}

export default function SafetyScreen() {
  const { height } = useWindowDimensions();
  const { chapter, progress, goNext } = useObStep('safety');
  const { answers, intake, setIntake, setLocalAnswer } = useOnboarding();
  const { stage, name } = useOnboardingPet();
  const showSurgery =
    (intake.conditions?.includes('post_surgery') ?? false) || intake.onset === 'surgery';
  const rows = ROWS.filter((row) => row.value !== 'surgery_uncleared' || showSurgery);
  const userEdited = useRef(false);
  const lock = useRef(false);
  const enteredAt = useRef(Date.now());
  const [selected, setSelected] = useState<RedFlag[]>(() =>
    knownFlags(intake.red_flags, showSurgery),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const navigation = useNavigation();
  const focused = useIsFocused();
  // Set on blur, while this screen is still allowed to render. Coming back
  // reads it during render, because a focus effect never paints through the freeze.
  const release = useRef(false);

  useEffect(() => {
    navigation.setOptions({ freezeOnBlur: false });
  }, [navigation]);

  useEffect(() => {
    return navigation.addListener('blur', () => {
      if (!lock.current) return;
      release.current = true;
      lock.current = false;
      setWorking(false);
      setSheetOpen(false);
    });
  }, [navigation]);

  if (!focused && working) {
    release.current = true;
    lock.current = false;
    setWorking(false);
    setSheetOpen(false);
  } else if (focused && release.current) {
    release.current = false;
    lock.current = false;
    if (working) setWorking(false);
    if (sheetOpen) setSheetOpen(false);
  }

  useEffect(() => {
    if (userEdited.current) return;
    if (intake.red_flags === undefined) return;
    setSelected(knownFlags(intake.red_flags, showSurgery));
  }, [intake.red_flags, showSurgery]);

  const visible = knownFlags(selected, showSurgery);
  const urgent = visible.includes('saddle_bladder') || visible.includes('leg_weakness');
  const tight = height < 700;
  const petSize = tight ? PET_SIZE_TIGHT : PET_SIZE;
  const petLabel = name?.trim() ? name.trim() : 'Your armadillo';

  function toggle(flag: RedFlag) {
    userEdited.current = true;
    const next = selected.includes(flag)
      ? selected.filter((item) => item !== flag)
      : [...selected, flag];
    setSelected(next);
    setIntake('red_flags', next);
  }

  async function accept(flags: RedFlag[], acknowledged: boolean) {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setIntake('red_flags', flags);
    setIntake('red_flag_ack', acknowledged);
    setLocalAnswer('has_red_flag', flags.length > 0);
    setLocalAnswer('safety_accepted_at', new Date().toISOString());
    try {
      await recordLegalAcceptances(['disclaimer']);
    } catch {
      // The queue is best-effort. The step still continues.
    }
    trackDecision('safety_gate', acknowledged ? 'acknowledged' : 'none');
    if (acknowledged) {
      const elapsed = Math.max(0, Math.round(Date.now() - enteredAt.current));
      const tier = answers.equipment;
      try {
        if (tier === 'open_space' || tier === 'bands_dumbbells' || tier === 'gym') {
          onboardingDisclaimerViewed({ equipment_tier: tier });
          onboardingDisclaimerConfirmed({ equipment_tier: tier, time_on_step_ms: elapsed });
        }
        onboardingClinicianExitConfirmed({ step_key: 'safety', time_on_step_ms: elapsed });
      } catch {
        // Analytics must not block the step.
      }
    }
    goNext(flags.length);
  }

  return (
    <ObScreen
      testID="safety"
      chapter={chapter}
      progress={progress}
      contentStyle={styles.content}
      footer={
        <ObFooter>
          <PrimaryButton
            testID="continue"
            label={visible.length === 0 ? COPY.none : COPY.continue}
            disabled={working}
            onPress={() => {
              if (visible.length === 0) {
                void accept([], false);
                return;
              }
              setSheetOpen(true);
            }}
          />
          <MedicalDisclaimer />
        </ObFooter>
      }
    >
      <View style={styles.hero}>
        <View style={[styles.seat, { width: petSize, height: petSize }]}>
          <View
            pointerEvents="none"
            style={[
              styles.ground,
              {
                width: Math.round(petSize * 0.72),
                height: tight ? 12 : 16,
              },
            ]}
          />
          <Pet stage={stage} mood="doctor" size={petSize} accessibilityLabel={petLabel} />
        </View>
      </View>
      <RevealText style={styles.title}>{COPY.title}</RevealText>
      <Text style={styles.body}>{COPY.body}</Text>
      <Text style={styles.caption}>{COPY.caption}</Text>
      <OptionList>
        {rows.map((row) => (
          <OptionRow
            key={row.value}
            testID={`opt-${row.value}`}
            label={row.label}
            mode="multi"
            selected={visible.includes(row.value)}
            onPress={() => toggle(row.value)}
          />
        ))}
      </OptionList>
      <View style={styles.note}>
        <NoteCard tone="neutral" text={COPY.later} />
      </View>
      <BottomSheet visible={sheetOpen} dismissable={false}>
        <RevealText style={styles.sheetTitle}>{urgent ? COPY.urgentTitle : COPY.clinicianTitle}</RevealText>
        <Text style={styles.sheetBody}>{urgent ? COPY.urgentBody : COPY.clinicianBody}</Text>
        <PrimaryButton
          testID="safety-ack"
          label={COPY.ack}
          loading={working}
          onPress={() => void accept(visible, true)}
        />
        <View style={styles.sheetBack}>
          <TextLink
            label={COPY.back}
            onPress={() => {
              if (working) return;
              setSheetOpen(false);
            }}
          />
        </View>
      </BottomSheet>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 36,
  },
  hero: {
    alignItems: 'center',
    marginBottom: ob.space.md,
  },
  seat: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  ground: {
    position: 'absolute',
    bottom: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(28, 28, 30, 0.08)',
  },
  title: {
    ...obType.title,
    textAlign: 'center',
  },
  body: {
    ...obType.body,
    textAlign: 'center',
    color: ob.color.ink,
    marginTop: ob.space.sm,
  },
  caption: {
    ...obType.caption,
    marginTop: ob.space.lg,
    marginBottom: ob.space.sm,
  },
  note: {
    marginTop: ob.space.md,
  },
  sheetTitle: {
    ...obType.title,
    marginBottom: ob.space.sm,
  },
  sheetBody: {
    ...obType.body,
    color: ob.color.ink,
    marginBottom: ob.space.lg,
  },
  sheetBack: {
    marginTop: ob.space.xs,
  },
});
