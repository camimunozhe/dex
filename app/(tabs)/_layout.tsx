import { Tabs } from 'expo-router';
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
            <TabIcon focused={focused} label="Explorar" icon={focused ? 'compass' : 'compass-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="encuentros"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Encuentros" icon={focused ? 'calendar' : 'calendar-outline'} />
          ),
        }}
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
    borderTopColor: '#334155',
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 8,
  },
  iconContainer: {
    alignItems: 'center',
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
