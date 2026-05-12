import { Tabs, useRouter } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ focused, label, icon }: { focused: boolean; label: string; icon: IoniconName }) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons name={icon} size={22} color={focused ? '#6366F1' : '#64748B'} />
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: '#0F172A' },
      }}
    >
      <Tabs.Screen
        name="collection"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Colección" icon={focused ? 'albums' : 'albums-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="meetups"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Explorar" icon={focused ? 'search' : 'search-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="encuentros"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Intercambios" icon={focused ? 'swap-horizontal' : 'swap-horizontal-outline'} />
          ),
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.replace('/(tabs)/encuentros');
          },
        })}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Perfil" icon={focused ? 'person' : 'person-outline'} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1E293B',
    borderTopWidth: 0,
    elevation: 0,
    height: 70,
    paddingTop: 6,
    paddingBottom: 8,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 70,
  },
  label: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
  },
  labelActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
});
