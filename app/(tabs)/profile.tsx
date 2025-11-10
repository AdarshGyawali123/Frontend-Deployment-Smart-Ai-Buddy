import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Header from "@/components/Header";
import { useAuth } from "@/providers/AuthProvider";

export default function ProfileScreen() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user]);

  async function onLogout() {
    await signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-1 bg-light-bg dark:bg-dark-bg">
      <Header />
      <View className="flex-1 px-6 py-8">
        <Text className="text-2xl font-bold text-light-text dark:text-dark-text">Profile</Text>

        <View className="mt-6 rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border p-4">
          <Row label="Name" value={user?.name ?? "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Role" value={user?.role ?? "—"} />
          <Row label="User ID" value={user?.id ?? "—"} last />
        </View>

        <Pressable
          onPress={onLogout}
          className="mt-8 h-12 rounded-2xl bg-primary items-center justify-center"
        >
          <Text className="text-white font-semibold">Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`py-3 ${last ? "" : "border-b border-light-border dark:border-dark-border"}`}>
      <Text className="text-xs uppercase tracking-wide text-light-subtext dark:text-dark-subtext">
        {label}
      </Text>
      <Text className="mt-1 text-light-text dark:text-dark-text">{value}</Text>
    </View>
  );
}
