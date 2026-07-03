import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../lib/theme';

import HomeScreen from '../screens/HomeScreen';
import DashboardScreen from '../screens/DashboardScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import WalletScreen from '../screens/WalletScreen';
import KYCScreen from '../screens/KYCScreen';
import EscrowConfirmScreen from '../screens/EscrowConfirmScreen';
import OwnerWithdrawScreen from '../screens/OwnerWithdrawScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ListingsScreen from '../screens/ListingsScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PersonalDetailsScreen from '../screens/PersonalDetailsScreen';
import ChatScreen from '../screens/ChatScreen';
import GlobalNotifier from '../components/GlobalNotifier';

import type { RootStackParamList, ListingsStackParamList, TabParamList } from './types';

const RootStack  = createNativeStackNavigator<RootStackParamList>();
const Tab        = createBottomTabNavigator<TabParamList>();
const ListStack  = createNativeStackNavigator<ListingsStackParamList>();

function ListingsStack() {
  return (
    <ListStack.Navigator screenOptions={{ headerShown: false }}>
      <ListStack.Screen name="ListingsFeed"   component={ListingsScreen} />
      <ListStack.Screen name="ListingDetail"  component={ListingDetailScreen} />
    </ListStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 62 + insets.bottom;
  const theme = useAppTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
          height: tabBarHeight,
          paddingBottom: insets.bottom + 10,
        },
        tabBarActiveTintColor: theme.navy,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, { outline: string; solid: string }> = {
            Home:          { outline: 'home-outline',              solid: 'home' },
            ListingsTab:   { outline: 'list-outline',              solid: 'list' },
            Activity:      { outline: 'pulse-outline',             solid: 'pulse' },
            Leaderboard:   { outline: 'trophy-outline',            solid: 'trophy' },
            Profile:       { outline: 'person-outline',            solid: 'person' },
          };
          const key = focused ? 'solid' : 'outline';
          return (
            <View style={focused ? [styles.tabIconActive, { borderColor: theme.gold }] : undefined}>
              <Ionicons name={icons[route.name][key] as any} size={20} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home"          component={DashboardScreen} />
      <Tab.Screen 
        name="ListingsTab"   
        component={ListingsStack}        
        options={{ title: 'Listings' }} 
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('ListingsTab', { screen: 'ListingsFeed' });
          },
        })}
      />
      <Tab.Screen name="Activity"      component={ActivityScreen}       options={{ title: 'Activity' }} />
      <Tab.Screen name="Leaderboard"   component={LeaderboardScreen} />
      <Tab.Screen name="Profile"       component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const theme = useAppTheme();
  
  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.background,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <RootStack.Screen name="Cover"    component={HomeScreen} />
        <RootStack.Screen name="Login"    component={LoginScreen} />
        <RootStack.Screen name="Register" component={RegisterScreen} />
        <RootStack.Screen name="Main"          component={MainTabs} options={{ animation: 'fade' }} />
        <RootStack.Screen name="CreateListing" component={CreateListingScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="Wallet"        component={WalletScreen} options={{ animation: 'slide_from_right' }} />
        <RootStack.Screen name="KYC"           component={KYCScreen}         options={{ animation: 'slide_from_right' }} />
        <RootStack.Screen name="EscrowConfirm"   component={EscrowConfirmScreen}   options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="OwnerWithdraw"   component={OwnerWithdrawScreen}   options={{ animation: 'slide_from_right' }} />
        <RootStack.Screen name="Notifications"   component={NotificationsScreen}   options={{ animation: 'slide_from_right' }} />
        <RootStack.Screen name="PersonalDetails" component={PersonalDetailsScreen} options={{ animation: 'slide_from_right' }} />
        <RootStack.Screen name="Chat"            component={ChatScreen}            options={{ animation: 'slide_from_right' }} />
      </RootStack.Navigator>
      <GlobalNotifier />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabIconActive: {
    borderBottomWidth: 2,
    paddingBottom: 2,
  },
});
