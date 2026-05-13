import { Stack } from 'expo-router';

export default function EncuentrosLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
