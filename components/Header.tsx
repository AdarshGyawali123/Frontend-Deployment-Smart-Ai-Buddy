import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ThemeToggle from "@/components/ThemeToggle";
import { useThemeMode } from "@/theme/ThemeProvider";

export default function Header() {
  const { colors, colorScheme } = useThemeMode();

  return (
    <SafeAreaView edges={["top"]} className="w-full">
      <View
        className="w-full flex-row items-center justify-between px-4 py-3 border-b"
        style={{
          backgroundColor: colors.card,
          borderBottomColor: colorScheme === "dark" ? colors.grey5 : colors.grey4,
          borderBottomWidth: 1,
        }}
      >
        <Text
          className="text-lg font-semibold"
          style={{ color: colors.foreground }}
        >
          Smart AI Buddy
        </Text>
        <ThemeToggle />
      </View>
    </SafeAreaView>
  );
}