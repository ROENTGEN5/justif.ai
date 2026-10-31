import { useAuth } from "../../lib/auth";
/**
 * Main Drawer Layout
 * Drawer navigator with custom content showing chat history.
 */

import React, { useMemo, useCallback } from "react";
import { Drawer, type DrawerContentComponentProps } from "expo-router/drawer";
import { createDrawerMotion } from "../../lib/drawerUpdates";
import { Ionicons } from "@expo/vector-icons";
import DrawerContent from "../../components/DrawerContent";
import { useTheme } from "../../lib/theme";

export default function MainLayout() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const drawerMotion = useMemo(() => createDrawerMotion(user?.id), [user?.id]);
  const renderDrawer = useCallback((props: DrawerContentComponentProps) => (
    <DrawerContent navigation={props.navigation} motion={drawerMotion} />
  ), [drawerMotion]);
  const drawerListeners = useMemo(() => ({
    gestureStart: () => drawerMotion.start(),
    transitionStart: () => drawerMotion.start(),
    transitionEnd: (event: { data: { closing: boolean } }) => drawerMotion.end(event.data.closing),
  }), [drawerMotion]);

  return (
    <Drawer
      key={user?.id || "signed-out"}
      drawerContent={renderDrawer}
      screenListeners={drawerListeners}
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.headerBg,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: theme.headerBorder,
        },
        headerTintColor: theme.headerText,
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 18,
        },
        drawerStyle: {
          width: 300,
        },
        drawerType: "front",
        swipeEnabled: true,
        swipeEdgeWidth: 50,
      }}
    >
      <Drawer.Screen
        name="chat"
        options={{
          title: "Justif.ai",
          headerRight: () => (
            <Ionicons
              name="sparkles"
              size={20}
              color={theme.textTertiary}
              style={{ marginRight: 16 }}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="privacy"
        options={{
          drawerItemStyle: { display: "none" },
          headerShown: false,
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          drawerItemStyle: { display: "none" },
          title: "Profile Settings",
        }}
      />
    </Drawer>
  );
}
