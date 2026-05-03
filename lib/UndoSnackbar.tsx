import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function UndoSnackbar({ visible, message, onUndo, bottomOffset = 100 }: {
  visible: boolean;
  message: string;
  onUndo: () => void;
  bottomOffset?: number;
}) {
  if (!visible) return null;
  return (
    <View style={[styles.snackbar, { bottom: bottomOffset }]}>
      <Ionicons name="trash-outline" size={18} color="#94A3B8" />
      <Text style={styles.snackbarText}>{message}</Text>
      <TouchableOpacity onPress={onUndo} style={styles.snackbarBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.snackbarBtnText}>Deshacer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  snackbarText: { flex: 1, color: '#F1F5F9', fontSize: 14, fontWeight: '500' },
  snackbarBtn: { paddingHorizontal: 4 },
  snackbarBtnText: { color: '#6366F1', fontSize: 14, fontWeight: '700' },
});
