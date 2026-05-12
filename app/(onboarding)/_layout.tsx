import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' }, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="games" />
      <Stack.Screen name="regions" />
    </Stack>
  );
}
