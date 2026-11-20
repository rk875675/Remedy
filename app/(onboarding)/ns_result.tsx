import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Hl,
  HlClay,
  NsDial,
  ObFooter,
  ObScreen,
  PrimaryButton,
  RevealText,
  SourcesLink,
  SourcesSheet,
  ob,
  obType,
} from '../../components/onboarding/kit';
import { ONBOARDING_SOURCES } from '../../constants/onboardingSources';
import { useOnboarding } from '../../context/OnboardingContext';
import { nsLevelPreview } from '../../lib/intakeSummary';
import { useObStep } from '../../lib/onboardingFlow';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useReduceMotion } from '../../lib/useReduceMotion';

type NsLevel = 'low' | 'some' | 'high';

const CAPTION = 'This is a pattern check, not a diagnosis.';
const CONTINUE = 'Continue';
const CONTINUE_LOCK_MS = 600;
const RISE = 14;
const STEP_MS = 110;

function titleFor(level: NsLevel): ReactNode {
  const accent =
    level === 'high' ? (
      <HlClay>is turned up</HlClay>
    ) : level === 'some' ? (
      <Hl>is partly involved</Hl>
    ) : (
      <Hl>looks quiet</Hl>
    );
  return (
    <>
      Your nervous system{'\n'}
      {accent}
    </>
  );
}

function Rise({ delay, children }: { delay: number; children: ReactNode }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const anim = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (!ready || reduce === null) return;
    if (reduce) {
      anim.setValue(1);
      return;
    }
    const motion = Animated.timing(anim, {
      toValue: 1,
      duration: ob.motion.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => motion.stop();
  }, [ready, reduce, delay, anim]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [RISE, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function NsResultScreen() {
  const { height, width } = useWindowDimensions();
  const { chapter, progress, goNext } = useObStep('ns_result');
  const { intake } = useOnboarding();
  const tight = height < 700 || width < 360;
  const level = nsLevelPreview(intake);
  const [play, setPlay] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      setPlay(true);
      return () => setPlay(false);
    }, []),
  );

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function handleContinue() {
    if (lock.current) return;
    lock.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lock.current = false;
      timer.current = null;
    }, CONTINUE_LOCK_MS);
    goNext();
  }

  let order = 1;
  const nextDelay = () => {
    const delay = order * STEP_MS;
    order += 1;
    return delay;
  };

  return (
    <>
      <ObScreen
        testID="ns-result"
        chapter={chapter}
        progress={progress}
        contentStyle={styles.screen}
        footer={
          <ObFooter note={CAPTION}>
            <PrimaryButton testID="continue" label={CONTINUE} chevron onPress={handleContinue} />
          </ObFooter>
        }
      >
        <View style={[styles.column, tight ? styles.columnTight : null]}>
          <View style={[styles.hero, tight ? styles.heroTight : null]}>
            <NsDial level={level} play={play} size={tight ? 188 : 228} />
          </View>
          <Rise delay={nextDelay()}>
            <RevealText style={[styles.title, tight ? styles.titleTight : null]}>{titleFor(level)}</RevealText>
          </Rise>
          <Rise delay={nextDelay()}>
            <View style={styles.cardWrap}>
              <View style={styles.card}>
                <Text style={styles.org}>The Lancet, 2023</Text>
                <Text style={styles.study}>
                  RESTORE trial, 492 adults: retraining movement and beliefs about pain beat usual care
                </Text>
                <SourcesLink onPress={() => setSourcesOpen(true)} />
              </View>
            </View>
          </Rise>
        </View>
      </ObScreen>
      <SourcesSheet
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        items={[ONBOARDING_SOURCES.restore]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 8,
  },
  column: {
    alignItems: 'stretch',
    paddingTop: 12,
  },
  columnTight: {
    paddingTop: 4,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroTight: {
    marginBottom: 12,
  },
  title: {
    ...obType.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.1,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginBottom: 28,
  },
  titleTight: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    marginBottom: 18,
  },
  cardWrap: {
    alignSelf: 'center',
    width: '92%',
    borderRadius: 28,
    shadowColor: ob.color.accent,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  card: {
    backgroundColor: '#E5F6EB',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#C5E6D0',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  org: {
    ...obType.bodyStrong,
    fontSize: 16,
    lineHeight: 22,
  },
  study: {
    ...obType.caption,
    fontWeight: '400',
    marginTop: 4,
  },
});
