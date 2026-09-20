import React, { useEffect } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../constants/colors';
import { LEGAL_EMAIL, PRIVACY_PUBLIC_URL, type LegalInline } from '../../constants/legalTerms';
import { PRIVACY_BLOCKS, PRIVACY_LAST_UPDATED } from '../../constants/legalPrivacy';
import { legalDocumentViewed } from '../../lib/analytics/events/engagement';

export default function PrivacyScreen() {
  const router = useRouter();

  // Fires on screen open (not only on the opener chips) so views are counted
  // even when the screen is reached via deep link or back-stack.
  useEffect(() => {
    legalDocumentViewed({ document: 'privacy', source_screen: 'legal_screen' });
  }, []);

  const onInlinePress = (link: NonNullable<LegalInline['link']>) => {
    if (link === 'privacy') {
      void Linking.openURL(PRIVACY_PUBLIC_URL);
      return;
    }
    void Linking.openURL(`mailto:${LEGAL_EMAIL}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: {PRIVACY_LAST_UPDATED}</Text>

        {PRIVACY_BLOCKS.map((block, index) => {
          if (block.type === 'h2') {
            return (
              <Text key={index} style={styles.heading}>
                {block.text}
              </Text>
            );
          }
          if (block.type === 'ul') {
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.body}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          }
          if ('parts' in block) {
            return (
              <Text key={index} style={styles.body}>
                {block.parts.map((part, partIndex) => {
                  const link = part.link;
                  if (link) {
                    return (
                      <Text
                        key={partIndex}
                        style={styles.link}
                        onPress={() => onInlinePress(link)}
                      >
                        {part.text}
                      </Text>
                    );
                  }
                  if (part.bold) {
                    return (
                      <Text key={partIndex} style={styles.bold}>
                        {part.text}
                      </Text>
                    );
                  }
                  return <Text key={partIndex}>{part.text}</Text>;
                })}
              </Text>
            );
          }
          return (
            <Text key={index} style={styles.body}>
              {block.text}
            </Text>
          );
        })}

        <TouchableOpacity
          onPress={() => void Linking.openURL(PRIVACY_PUBLIC_URL)}
          activeOpacity={0.7}
          style={styles.webLinkWrap}
        >
          <Text style={styles.webLink}>{PRIVACY_PUBLIC_URL.replace('https://', '')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 17,
    color: colors.primary,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  updated: {
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 20,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 28,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: 8,
    flex: 1,
  },
  bold: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
  },
  list: {
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingRight: 8,
  },
  bullet: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
    width: 18,
  },
  webLinkWrap: {
    marginTop: 36,
  },
  webLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
