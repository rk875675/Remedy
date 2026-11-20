import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { shadows } from '../../../constants/shadows';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob, obType } from './tokens';

const APP_ICON = require('../../../assets/icon.png');

type NotificationMockProps = {
  title: string;
  body: string;
  time?: string;
};

/** Fake lock-screen banner. Slides down once the screen transition has finished. */
export function NotificationMock({ title, body, time = 'now' }: NotificationMockProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const ty = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      ty.setValue(0);
      opacity.setValue(1);
      return;
    }
    if (!ready) return;
    Animated.parallel([
      Animated.spring(ty, {
        toValue: 0,
        tension: ob.motion.spring.tension,
        friction: ob.motion.spring.friction,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ob.motion.base,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduce, ready, ty, opacity]);

  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${body}`}
      style={[styles.card, { opacity, transform: [{ translateY: ty }] }]}
    >
      <Image source={APP_ICON} style={styles.icon} />
      <View style={styles.copy}>
        <View style={styles.meta}>
          <Text style={styles.brand}>REMEDY</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {body}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    ...shadows.medium,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brand: {
    ...obType.micro,
    color: ob.color.inkSoft,
  },
  time: {
    ...obType.caption,
  },
  title: {
    ...obType.bodyStrong,
  },
  body: {
    ...obType.caption,
  },
});
