import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Status = 'free' | 'active' | 'in_grace' | 'expired' | null | undefined;

function isProActive(status: Status): boolean {
  return status === 'active' || status === 'in_grace';
}

export function ProBadge({
  status, size = 'sm',
}: {
  status: Status;
  size?: 'sm' | 'md';
}) {
  if (!isProActive(status)) return null;
  const iconSize = size === 'md' ? 13 : 11;
  const fontSize = size === 'md' ? 11 : 10;
  const padH = size === 'md' ? 7 : 5;
  const padV = size === 'md' ? 3 : 2;
  return (
    <View style={[styles.badge, { paddingHorizontal: padH, paddingVertical: padV }]}>
      <Ionicons name="star" size={iconSize} color="#FACC15" />
      <Text style={[styles.text, { fontSize }]}>Pro</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.5)',
    borderRadius: 10,
  },
  text: { color: '#FACC15', fontWeight: '800', letterSpacing: 0.3 },
});
