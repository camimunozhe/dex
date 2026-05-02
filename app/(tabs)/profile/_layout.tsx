import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="verify" options={{ presentation: 'modal' }} />
      <Stack.Screen name="games" />
    </Stack>
  );
}
