import { Stack } from 'expo-router';

export default function MeetupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
