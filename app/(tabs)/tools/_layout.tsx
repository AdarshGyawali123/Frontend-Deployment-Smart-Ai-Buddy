import { Stack } from "expo-router";
import React from "react";

export default function ToolsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackTitleVisible: false,
        headerTitleStyle: { fontSize: 18, fontWeight: "600" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Tools" }} />
      <Stack.Screen name="flashcards" options={{ title: "Flashcards" }} />
      <Stack.Screen name="quiz" options={{ title: "Quiz" }} />
    </Stack>
  );
}