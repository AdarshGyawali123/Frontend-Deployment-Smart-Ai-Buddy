import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

export default function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/login");
  }, [loading, user]);

  return (
    <View className="flex-1 items-center justify-center bg-light-bg dark:bg-dark-bg">
      <ActivityIndicator />
    </View>
  );
}