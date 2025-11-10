import React from "react";
import { Pressable } from "react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { Moon, Sun } from "lucide-react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

export default function ThemeToggle() {
  const { colorScheme, toggle, colors } = useThemeMode();
  const isDark = colorScheme === "dark";

  return (
    <Pressable
      onPress={toggle}
      hitSlop={12}
      className="rounded-full p-2"
      style={{
        backgroundColor: colors.card,
        borderColor: isDark ? colors.grey5 : colors.grey4,
        borderWidth: 1,
      }}
    >
      <Animated.View entering={FadeIn} exiting={FadeOut}>
        {isDark ? (
          <Sun size={20} color={colors.foreground} strokeWidth={2} />
        ) : (
          <Moon size={20} color={colors.foreground} strokeWidth={2} />
        )}
      </Animated.View>
    </Pressable>
  );
}