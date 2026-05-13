/**
 * Main Drawer Layout
 * Drawer navigator with custom content showing chat history.
 */

import React from "react";
import { Drawer } from "expo-router/drawer";
import { Ionicons } from "@expo/vector-icons";
import DrawerContent from "../../components/DrawerContent";
import { useTheme } from "../../lib/theme";

export default function MainLayout() {
  const { theme } = useTheme();

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
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
    </Drawer>
  );
}
