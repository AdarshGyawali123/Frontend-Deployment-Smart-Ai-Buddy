import { Stack } from "expo-router";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { StatusBar } from "expo-status-bar";
import React from "react";
import "./globals.css";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar translucent backgroundColor="transparent" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
