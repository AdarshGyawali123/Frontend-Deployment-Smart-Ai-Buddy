import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Header from "@/components/Header";
import { useAuth } from "@/providers/AuthProvider";
import { getApiBase } from "@/constants/api";
import { useThemeMode } from "@/theme/ThemeProvider";
import { MessageSquare, UploadCloud, Sparkles, BookOpenCheck, Brain } from "lucide-react-native";

type Note = {
  id: string;
  title: string;
  source: "MANUAL" | "UPLOAD" | "LINK";
  createdAt: string;
};

const API_BASE = getApiBase();
const TAB_BAR_HEIGHT = 54;
const LAST_INDEXED_KEY = "last-indexed-note-id";
const CHAT_CACHE = (noteId: string) => `ai-tutor:chat:${noteId}`;
const FC_CACHE = (noteId: string) => `tools:flashcards:${noteId}`;
const QZ_CACHE = (noteId: string) => `tools:quiz:${noteId}`;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading, getAccessToken } = useAuth();
  const { colors } = useThemeMode();

  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [lastNoteId, setLastNoteId] = useState<string | null>(null);
  const [hasChat, setHasChat] = useState(false);
  const [hasFC, setHasFC] = useState(false);
  const [hasQZ, setHasQZ] = useState(false);

  // Helpers to select a note + navigate
  async function selectNote(noteId: string) {
    await AsyncStorage.setItem(LAST_INDEXED_KEY, noteId).catch(() => {});
    setLastNoteId(noteId);
  }
  async function goToStudy(noteId: string) {
    await selectNote(noteId);
    router.push({ pathname: "/(tabs)/study-tools", params: { noteId } });
  }
  async function goToChat(noteId: string) {
    await selectNote(noteId);
    router.push({ pathname: "/(tabs)/ai-tutor", params: { noteId } });
  }

  /* ------------------------------- load data ------------------------------ */
  useEffect(() => {
    if (!loading && !user) router.replace("/login");

    (async () => {
      try {
        setBusy(true);
        setErr(null);

        const token = await getAccessToken();
        const res = await fetch(`${API_BASE}/api/notes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error((json?.error as string) || "Failed to fetch notes");

        const all = (json as Note[]).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setNotes(all);

        const last = await AsyncStorage.getItem(LAST_INDEXED_KEY);
        setLastNoteId(last);

        if (last) {
          const [chatRaw, fcRaw, qzRaw] = await Promise.all([
            AsyncStorage.getItem(CHAT_CACHE(last)),
            AsyncStorage.getItem(FC_CACHE(last)),
            AsyncStorage.getItem(QZ_CACHE(last)),
          ]);
          setHasChat(!!(chatRaw && JSON.parse(chatRaw)?.length));
          setHasFC(!!(fcRaw && JSON.parse(fcRaw)?.length));
          setHasQZ(!!(qzRaw && JSON.parse(qzRaw)?.length));
        } else {
          setHasChat(false);
          setHasFC(false);
          setHasQZ(false);
        }
      } catch (e: any) {
        console.error("Home load error", e);
        setErr(e?.message || "Could not load your content.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const recentNotes = useMemo(() => notes.slice(0, 12), [notes]);
  const lastNote = useMemo(() => notes.find((n) => n.id === lastNoteId) || null, [notes, lastNoteId]);

  if (loading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-light-bg dark:bg-dark-bg">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-light-bg dark:bg-dark-bg">
      <Header />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <Text className="text-2xl font-bold text-light-text dark:text-dark-text">
          Hey {user?.name?.split(" ")[0] || "there"}!
        </Text>
        <Text className="mt-1 text-light-subtext dark:text-dark-subtext">
          Turn your notes into summaries, flashcards, quizzes — and get answers with AI Tutor.
        </Text>

        {/* Quick Actions */}
        <View className="mt-4 flex-row gap-3">
          <ActionPill
            icon={<UploadCloud size={18} color={colors.foreground} />}
            label="Upload note"
            onPress={() => router.push("/(tabs)/notes")}
            colors={colors}
          />
          <ActionPill
            icon={<Sparkles size={18} color={colors.foreground} />}
            label="Study tools"
            onPress={() => router.push("/(tabs)/study-tools")}
            colors={colors}
          />
          <ActionPill
            icon={<MessageSquare size={18} color={colors.foreground} />}
            label="AI Tutor"
            onPress={() => router.push("/(tabs)/ai-tutor")}
            colors={colors}
          />
        </View>

        {/* Continue section */}
        <View
          className="mt-6 rounded-2xl border p-4"
          style={{ borderColor: colors.grey4, backgroundColor: colors.card }}
        >
          <Text className="text-base font-semibold" style={{ color: colors.foreground }}>
            Continue where you left off
          </Text>
          {busy ? (
            <View className="mt-3">
              <ActivityIndicator />
            </View>
          ) : err ? (
            <Text className="mt-2" style={{ color: colors.destructive }}>
              {err}
            </Text>
          ) : lastNote ? (
            <>
              <Text className="mt-1 text-xs" style={{ color: colors.grey }}>
                {lastNote.title || "(untitled)"} ·{" "}
                {new Date(lastNote.createdAt).toLocaleDateString()}
              </Text>

              <View className="mt-3 flex-row flex-wrap gap-2">
                {hasChat ? (
                  <SmallButton
                    label="Open AI Tutor"
                    onPress={() => goToChat(lastNote.id)}
                    colors={colors}
                  />
                ) : null}
                {hasFC ? (
                  <SmallButton
                    label="Review flashcards"
                    onPress={() => goToStudy(lastNote.id)}
                    colors={colors}
                  />
                ) : null}
                {hasQZ ? (
                  <SmallButton
                    label="Review quiz"
                    onPress={() => goToStudy(lastNote.id)}
                    colors={colors}
                  />
                ) : null}
                {!hasChat && !hasFC && !hasQZ ? (
                  <Text style={{ color: colors.grey }} className="mt-1">
                    No saved sessions yet. Try Study Tools or AI Tutor.
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <Text className="mt-1" style={{ color: colors.grey }}>
              Upload and index a note to start studying.
            </Text>
          )}
        </View>

        {/* Feature cards */}
        <View className="mt-6 gap-3">
          <FeatureCard
            title="Summaries"
            desc="Generate clear, bullet-point summaries from your notes."
            cta="Open Uploads"
            onPress={() => router.push("/(tabs)/notes")}
            colors={colors}
          />
          <FeatureCard
            title="Flashcards"
            desc="Tap to flip, 3D cards — perfect for quick review."
            icon={<BookOpenCheck size={18} color={colors.foreground} />}
            cta="Open Tools"
            onPress={() => router.push("/(tabs)/study-tools")}
            colors={colors}
          />
          <FeatureCard
            title="Quizzes"
            desc="Auto-made MCQs with explanations to test understanding."
            icon={<Brain size={18} color={colors.foreground} />}
            cta="Open Tools"
            onPress={() => router.push("/(tabs)/study-tools")}
            colors={colors}
          />
        </View>
        {/* Footer spacing */}
        <View style={{ height: Platform.OS === "ios" ? 6 : 0 }} />
      </ScrollView>
    </View>
  );
}

/* ------------------------------ UI helpers ------------------------------- */

function ActionPill({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-2xl border px-3 py-2 items-center justify-center"
      style={{ borderColor: colors.grey4, backgroundColor: colors.card }}
    >
      <View className="mb-1">{icon}</View>
      <Text className="text-xs font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SmallButton({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-2 rounded-xl"
      style={{ backgroundColor: colors.primary }}
    >
      <Text className="text-white text-xs font-semibold">{label}</Text>
    </Pressable>
  );
}

function FeatureCard({
  title,
  desc,
  cta,
  onPress,
  colors,
  icon,
}: {
  title: string;
  desc: string;
  cta: string;
  onPress: () => void;
  colors: any;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border p-4"
      style={{ borderColor: colors.grey4, backgroundColor: colors.card }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold" style={{ color: colors.foreground }}>
            {title}
          </Text>
          <Text className="mt-1 text-sm" style={{ color: colors.grey }}>
            {desc}
          </Text>
          <Text className="mt-3 text-xs font-semibold" style={{ color: colors.primary }}>
            {cta} →
          </Text>
        </View>
        {icon ? <View>{icon}</View> : null}
      </View>
    </Pressable>
  );
}
