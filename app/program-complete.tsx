import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, serifFont } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';
import { hapticPrimaryAction, hapticCelebration } from '../lib/haptics';

export default function ProgramCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [totalSessions, setTotalSessions] = useState(0);
  const [daysActive, setDaysActive] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const iconScale = useRef(new Animated.Value(0)).current;
  const revealAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    // Three-beat celebration: light → medium → success.
    hapticCelebration();
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 4,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [iconScale]);

  useEffect(() => {
    if (!loaded) return;
    Animated.sequence([
      Animated.delay(200),
      Animated.stagger(
        80,
        revealAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  }, [loaded]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('session_completions')
      .select('completed_at')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) {
          setTotalSessions(data.length);
          const uniqueDays = new Set(data.map((c) => c.completed_at.slice(0, 10))).size;
          setDaysActive(uniqueDays);
        }
        setLoaded(true);
      });
  }, [user]);

  async function handleRestart() {
    hapticPrimaryAction();
    if (!user) return;
    await supabase
      .from('user_programs')
      .update({ current_week: 1, current_session: 1 })
      .eq('user_id', user.id);
    router.replace('/(tabs)');
  }

  function handleGoHome() {
    hapticPrimaryAction();
    router.replace('/(tabs)');
  }

  function revealStyle(index: number) {
    return {
      opacity: revealAnims[index],
      transform: [
        {
          translateY: revealAnims[index].interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
      ],
    };
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 32 }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>❋</Text>
        </View>
      </Animated.View>

      <Text style={styles.heading}>Program Complete</Text>
      <Text style={styles.subheading}>
        You finished the Back Pain Relief Program.
      </Text>

      {loaded && (
        <Animated.View style={[styles.statsCard, revealStyle(0)]}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions{'\n'}Completed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{daysActive}</Text>
            <Text style={styles.statLabel}>Days{'\n'}Active</Text>
          </View>
        </Animated.View>
      )}

      <Animated.Text style={[styles.congrats, revealStyle(1)]}>
        That&apos;s real work. Consistent movement is what changes things — and you showed up.
      </Animated.Text>

      <Animated.View style={[styles.buttonGroup, revealStyle(2)]}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleRestart} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>Restart Program</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleGoHome} activeOpacity={0.7}>
          <Text style={styles.secondaryButtonText}>Go to Home</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
  },
  content: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.circle,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
  },
  iconText: {
    fontSize: 42,
    color: '#FFFFFF',
    lineHeight: 50,
  },
  heading: {
    fontSize: 32,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 28,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    marginBottom: 32,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
    lineHeight: 20,
  },
  statDivider: {
    width: 1,
    height: 52,
    backgroundColor: colors.borderLight,
  },
  congrats: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    fontStyle: 'italic',
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  buttonGroup: {
    width: '100%',
  },
  primaryButton: {
    height: 56,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 14,
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    height: 52,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary,
  },
});
