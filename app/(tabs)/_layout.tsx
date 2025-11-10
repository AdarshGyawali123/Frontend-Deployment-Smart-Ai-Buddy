import React, { memo } from "react";
import { Tabs } from "expo-router";
import { Image, ImageBackground, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeMode } from "@/theme/ThemeProvider";
import { images } from "@/constants/images";
import { icons } from "@/constants/icons";

type TabIconProps = { focused: boolean; icon: any; label: string };

const TabIcon = memo(({ focused, icon, label }: TabIconProps) => {
  if (focused) {
    return (
      <ImageBackground
        source={images.highlight}
        className="flex flex-row w-full flex-1 min-w-[112px] min-h-16 mt-4 justify-center items-center rounded-full overflow-hidden"
      >
        <Image source={icon} tintColor="#151312" className="size-7" />
        <Text className="text-secondary text-[16px] font-semibold ml-2">{label}</Text>
      </ImageBackground>
    );
  }

  return (
    <View className="size-full justify-center items-center mt-4 rounded-full">
      <Image source={icon} tintColor="#A8B5DB" className="size-6" />
    </View>
  );
});

function makeTabOptions(label: string, icon: any) {
  return {
    title: label,
    headerShown: false,
    tabBarButton: (props: any) => (
      <Pressable
        {...props}
        className="flex-1 h-full items-center justify-center"
        hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        android_ripple={{ borderless: true }}
      />
    ),
    tabBarIcon: ({ focused }: { focused: boolean }) => (
      <TabIcon focused={focused} icon={icon} label={label} />
    ),
  } as const;
}

export default function TabsLayout() {
  const { colorScheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        headerShown: false,
        tabBarItemStyle: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarStyle: {
          backgroundColor: "#0f0D23",
          borderRadius: 50,
          marginHorizontal: 10,
          marginBottom: bottomPad,
          height: 54,
          position: "absolute",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "#0f0d23",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={makeTabOptions("Home", icons.home)}
      />
      <Tabs.Screen
        name="notes"
        options={makeTabOptions("Notes", icons.notes)}
      />
      <Tabs.Screen
        name="study-tools"
        options={makeTabOptions("Tools", icons.study)}
      />
      <Tabs.Screen
        name="ai-tutor"
        options={makeTabOptions("AI Tutor", icons.messenger)}
      />
      <Tabs.Screen
        name="profile"
        options={makeTabOptions("Profile", icons.person)}
      />
      <Tabs.Screen name="tools" options={{ href: null }} />
    </Tabs>
  );
}
