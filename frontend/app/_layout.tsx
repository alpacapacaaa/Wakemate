import { Figtree_700Bold, Figtree_900Black } from '@expo-google-fonts/figtree';
import {
  GothicA1_400Regular,
  GothicA1_500Medium,
  GothicA1_700Bold,
  GothicA1_800ExtraBold,
  GothicA1_900Black,
} from '@expo-google-fonts/gothic-a1';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppStateProvider } from '../lib/app-state';
import { fonts, colors, type } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Gothic A1 carries both Hangul and Latin, so headlines are heavy in Korean too. Figtree is kept
  // for clock digits only — see the note in lib/theme.ts.
  const [fontsLoaded] = useFonts({
    GothicA1_400Regular,
    GothicA1_500Medium,
    GothicA1_700Bold,
    GothicA1_800ExtraBold,
    GothicA1_900Black,
    Figtree_700Bold,
    Figtree_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <AppStateProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.numeric, fontSize: 16 },
          headerShadowVisible: false,
          headerBackTitle: '뒤로',
          contentStyle: { backgroundColor: colors.paper },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="room/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="room/join" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="join/[code]" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]/settings" options={{ headerShown: false, presentation: 'modal' }} />
        {/* Pushed, not presented: the colour has to reach the screen edges, and the iOS back
            swipe is the gesture people already expect for going back to the week. */}
        <Stack.Screen name="room/[id]/day/[weekday]" options={{ headerShown: false }} />
        <Stack.Screen name="alarm/[id]" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="record" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="ring/[roomId]" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </AppStateProvider>
  );
}
