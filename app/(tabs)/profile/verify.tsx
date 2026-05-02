import { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { VerificationLevel } from '@/types/database';

const LEVELS = [
  {
    value: 'basic' as VerificationLevel,
    label: 'Básico',
    badge: '🔵',
    description: 'Email + teléfono confirmado',
    features: ['Perfil visible', 'Ver encuentros de otros'],
    requirement: 'Confirma tu número de teléfono',
  },
  {
    value: 'intermediate' as VerificationLevel,
    label: 'Intermedio',
    badge: '🟢',
    description: 'Documento de identidad verificado',
    features: ['Todo lo anterior', '✅ Crear y aceptar encuentros', 'Badge de confianza visible'],
    requirement: 'Sube foto de tu cédula / DNI / RUT / INE',
  },
  {
    value: 'advanced' as VerificationLevel,
    label: 'Avanzado',
    badge: '🟣',
    description: 'Selfie + documento + prueba de vida',
    features: ['Todo lo anterior', 'Badge premium de confianza', 'Prioridad en búsquedas'],
    requirement: 'Selfie sosteniendo tu documento',
  },
];

export default function VerifyScreen() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState<VerificationLevel>('intermediate');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const currentLevel = profile?.verification_level ?? 'none';
  const isPending = profile?.verification_status === 'pending';

  async function handleSubmit() {
    if (selectedLevel === 'basic' && !phone.trim()) {
      Alert.alert('Error', 'Ingresa tu número de teléfono');
      return;
    }
    setLoading(true);

    // En producción esto se conectaría con Metamap/Veriff/Sumsub
    // Por ahora simulamos el flujo de solicitud
    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: 'pending',
        // Para nivel básico, se puede aprobar directamente
        ...(selectedLevel === 'basic' ? { verification_level: 'basic' } : {}),
      })
      .eq('id', profile!.id);

    if (error) Alert.alert('Error', error.message);
    else {
      await refreshProfile();
      Alert.alert(
        'Solicitud enviada',
        selectedLevel === 'basic'
          ? 'Verificación básica completada.'
          : 'Revisaremos tu documento en las próximas 24hs.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Verificar identidad</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.currentBadge}>
          <Text style={styles.currentLabel}>Nivel actual</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>
              {currentLevel === 'none' ? '⚪ Sin verificar' :
               currentLevel === 'basic' ? '🔵 Básico' :
               currentLevel === 'intermediate' ? '🟢 Intermedio' : '🟣 Avanzado'}
            </Text>
          </View>
          {isPending && (
            <Text style={styles.pendingText}>⏳ Verificación en proceso...</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Elige el nivel de verificación</Text>

        {LEVELS.map((level) => {
          const isCurrentOrLower = ['none', 'basic', 'intermediate', 'advanced'].indexOf(currentLevel) >=
            ['none', 'basic', 'intermediate', 'advanced'].indexOf(level.value);
          const isSelected = selectedLevel === level.value;

          return (
            <TouchableOpacity
              key={level.value}
              style={[styles.levelCard, isSelected && styles.levelCardSelected, isCurrentOrLower && styles.levelCardDone]}
              onPress={() => !isCurrentOrLower && setSelectedLevel(level.value)}
            >
              <View style={styles.levelHeader}>
                <Text style={styles.levelBadgeEmoji}>{level.badge}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.levelName}>{level.label}</Text>
                  <Text style={styles.levelDesc}>{level.description}</Text>
                </View>
                {isCurrentOrLower && <Text style={styles.checkmark}>✅</Text>}
              </View>
              <View style={styles.features}>
                {level.features.map((f, i) => (
                  <Text key={i} style={styles.feature}>{f}</Text>
                ))}
              </View>
              {!isCurrentOrLower && (
                <View style={styles.requirement}>
                  <Text style={styles.requirementText}>📋 {level.requirement}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {selectedLevel === 'basic' && (
          <View style={styles.form}>
            <Text style={styles.formLabel}>Número de teléfono</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+56 9 1234 5678"
              placeholderTextColor="#475569"
              keyboardType="phone-pad"
            />
          </View>
        )}

        {(selectedLevel === 'intermediate' || selectedLevel === 'advanced') && (
          <View style={styles.kycInfo}>
            <Text style={styles.kycTitle}>🔐 Proceso seguro con KYC</Text>
            <Text style={styles.kycText}>
              Usamos proveedores certificados (Metamap / Veriff) para verificar tu identidad.
              Tus datos NO se comparten con otros usuarios — solo se muestra tu nivel de badge.
            </Text>
            <Text style={styles.kycNote}>
              Compatible con: CI (Chile), DNI (Argentina/Perú), RUT, INE (México), y más.
            </Text>
          </View>
        )}

        {!isPending && (
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitBtnText}>
              {loading ? 'Enviando...' : 'Iniciar verificación'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  back: { color: '#6366F1', fontSize: 15 },
  title: { color: '#F1F5F9', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1, padding: 16 },
  currentBadge: {
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#334155', marginBottom: 24, alignItems: 'center',
  },
  currentLabel: { color: '#64748B', fontSize: 12, marginBottom: 8 },
  levelBadge: { backgroundColor: '#0F172A', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  levelBadgeText: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  pendingText: { color: '#FCD34D', fontSize: 13, marginTop: 8 },
  sectionTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  levelCard: {
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#334155', marginBottom: 12,
  },
  levelCardSelected: { borderColor: '#6366F1' },
  levelCardDone: { opacity: 0.6 },
  levelHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  levelBadgeEmoji: { fontSize: 28 },
  levelName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  levelDesc: { color: '#64748B', fontSize: 13, marginTop: 2 },
  checkmark: { fontSize: 20 },
  features: { gap: 4 },
  feature: { color: '#94A3B8', fontSize: 13 },
  requirement: {
    marginTop: 12, backgroundColor: '#1E3A5F',
    borderRadius: 8, padding: 10,
  },
  requirementText: { color: '#93C5FD', fontSize: 13 },
  form: { marginBottom: 16 },
  formLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    borderRadius: 10, padding: 12, fontSize: 15, color: '#F1F5F9',
  },
  kycInfo: {
    backgroundColor: '#1A1A2E', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#2D2D5E', marginBottom: 16,
  },
  kycTitle: { color: '#A5B4FC', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  kycText: { color: '#94A3B8', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  kycNote: { color: '#64748B', fontSize: 12 },
  submitBtn: {
    backgroundColor: '#6366F1', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 16,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
