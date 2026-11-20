import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton } from './PrimaryButton';
import { obType } from './tokens';

type SourceItem = {
  title: string;
  detail: string;
};

type SourcesSheetProps = {
  visible: boolean;
  onClose: () => void;
  items: SourceItem[];
};

/** Citation list in a sheet, with a soft Close button. */
export function SourcesSheet({ visible, onClose, items }: SourcesSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.list}>
        {items.map((item, index) => (
          <View key={`${item.title}-${index}`} style={styles.item}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.detail}>{item.detail}</Text>
          </View>
        ))}
        <PrimaryButton label="Close" onPress={onClose} variant="soft" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 16,
    paddingTop: 4,
  },
  item: {
    gap: 2,
  },
  title: {
    ...obType.bodyStrong,
  },
  detail: {
    ...obType.caption,
  },
});
