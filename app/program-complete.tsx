import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';
import { hapticPrimaryAction, hapticSuccess } from '../lib/haptics';

export default function ProgramCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [totalSessions, setTotalSessions] = useState(0);
  const [daysActive, setDaysActive] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const iconScale = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    hapticSuccess();
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 4,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [iconScale]);

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

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 32 }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
        <Text style={styles.iconText}>🎉</Text>
      </Animated.View>

      <Text style={styles.heading}>Program Complete</Text>
      <Text style={styles.subheading}>
        You finished the Back Pain Relief Program.
      </Text>

      {loaded && (
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions{'\n'}Completed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{daysActive}</Text>
            <Text style={styles.statLabel}>Days{'\n'}Active</Text>
          </View>
        </View>
      )}

      <Text style={styles.congrats}>
        That&apos;s real work. Consistent movement is what changes things — and you showed up.
      </Text>

      <TouchableOpacity style={styles.primaryButton} onPress={handleRestart} activeOpacity={0.85}>
        <Text style={styles.primaryButtonText}>Restart Program</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleGoHome} activeOpacity={0.8}>
        <Text style={styles.secondaryButtonText}>Go to Home</Text>
      </TouchableOpacity>
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
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconText: {
    fontSize: 44,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  subheading: {
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
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
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 18,
  },
  statDivider: {
    width: 1,
    height: 52,
    backgroundColor: '#F0EBE7',
  },
  congrats: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 14,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
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
