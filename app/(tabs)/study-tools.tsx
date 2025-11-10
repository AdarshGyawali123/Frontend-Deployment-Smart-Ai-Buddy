import { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
} from "react-native";
import Header from "@/components/Header";
import { useAuth } from "@/providers/AuthProvider";
import { getApiBase } from "@/constants/api";
import { useRouter } from "expo-router";
import { Layers, HelpCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { emit, on } from "@/lib/eventBus";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeMode } from "@/theme/ThemeProvider";

type Note = {
  id: string;
  title: string;
  source: "MANUAL" | "UPLOAD" | "LINK";
  createdAt: string;
};

const API_BASE = getApiBase();
const LAST_INDEXED_KEY = "last-indexed-note-id";

export default function StudyToolsScreen() {
  const { user, loading, getAccessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const selected = useMemo(
    () => notes.find(n => n.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

  const loadNotes = useCallback(async () => {
    try {
      setLoadingNotes(true);
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/notes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json().catch(() => [])) as Note[];
      if (!res.ok) throw json;
      // Keep uploads first (usually the ones you work with)
      const sorted = json
        .filter(n => n.source === "UPLOAD")
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      setNotes(sorted);
      if (sorted.length && !selectedNoteId) setSelectedNoteId(sorted[0].id);
    } catch (e) {
      console.warn("Failed to load notes", e);
    } finally {
      setLoadingNotes(false);
    }
  }, [getAccessToken, selectedNoteId]);

  useEffect(() => {
    if (!loading && user) loadNotes();
  }, [loading, user, loadNotes]);

  // re-fetch on screen focus
  useFocusEffect(
    useCallback(() => {
      // re-run your existing "load notes" logic here
      void loadNotes?.();

      // also, prefer last-indexed if present
      (async () => {
        const last = await AsyncStorage.getItem(LAST_INDEXED_KEY);
        if (last) {
          // if your screen tracks a selected noteId, set it here
          setSelectedNoteId?.(last);
        }
      })();

      // subscribe to bus
      const off = on("notes:changed", ({ noteId }) => {
        void (async () => {
          await loadNotes?.();
          if (noteId) setSelectedNoteId?.(noteId);
        })();
      });

      return () => off();
    }, [])
  );

  if (loading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-light-bg dark:bg-dark-bg">
        <ActivityIndicator />
      </View>
    );
  }

  function onOpenFlashcards() {
    if (!selected) {
      Alert.alert("Pick a note", "Please select a note first.");
      return;
    }
    router.push({
      pathname: "/(tabs)/tools/flashcards",
      params: { noteId: selected.id, noteTitle: selected.title },
    });
  }

  function onOpenQuiz() {
    if (!selected) {
      Alert.alert("Pick a note", "Please select a note first.");
      return;
    }
    router.push({
      pathname: "/(tabs)/tools/quiz",
      params: { noteId: selected.id, noteTitle: selected.title },
    });
  }

  return (
    <View className="flex-1 bg-light-bg dark:bg-dark-bg">
      <Header />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: insets.bottom + 120, // avoid bottom tab overlay
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-2xl font-bold text-light-text dark:text-dark-text">
          Study Tools
        </Text>
        <Text className="mt-1 text-light-subtext dark:text-dark-subtext">
          Choose a note and pick a tool to generate study aids.
        </Text>

        {/* Note picker (horizontal) */}
        <View className="mt-5">
          <Text className="text-sm mb-2 text-light-subtext dark:text-dark-subtext">
            Notes
          </Text>
          {loadingNotes ? (
            <View className="h-16 items-center justify-center rounded-2xl border border-light-border dark:border-dark-border">
              <ActivityIndicator />
            </View>
          ) : notes.length === 0 ? (
            <View className="rounded-2xl border border-light-border dark:border-dark-border p-4">
              <Text className="text-light-subtext dark:text-dark-subtext">
                No notes yet. Upload a note first from the Notes tab.
              </Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={notes}
              keyExtractor={(n) => n.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => {
                const active = item.id === selectedNoteId;
                return (
                  <Pressable
                    onPress={() => setSelectedNoteId(item.id)}
                    className={`px-4 py-3 rounded-2xl border ${
                      active
                        ? "bg-primary"
                        : "bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border"
                    }`}
                    style={
                      active
                        ? { borderColor: colors.primary }
                        : { borderColor: colors.grey4 }
                    }
                  >
                    <Text
                      className={active ? "text-white" : ""}
                      style={{ color: active ? "#fff" : colors.foreground }}
                      numberOfLines={1}
                    >
                      {item.title || "(untitled)"}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/* Tool list */}
        <View className="mt-6 rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
          <ToolRow
            title="Flashcards"
            subtitle="Generate concise Q/A cards"
            Icon={Layers}
            onPress={onOpenFlashcards}
            disabled={!selected}
          />
          <Divider />
          <ToolRow
            title="Quiz"
            subtitle="Test yourself with MCQs"
            Icon={HelpCircle}
            onPress={onOpenQuiz}
            disabled={!selected}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ToolRow({
  title,
  subtitle,
  Icon,
  onPress,
  disabled,
}: {
  title: string;
  subtitle: string;
  Icon: any;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`px-4 py-4 flex-row items-center ${disabled ? "opacity-50" : ""}`}
    >
      <Icon size={20} color="#9CA3AF" />
      <View className="ml-3 flex-1">
        <Text className="text-base font-semibold text-light-text dark:text-dark-text">
          {title}
        </Text>
        <Text className="text-sm text-light-subtext dark:text-dark-subtext">{subtitle}</Text>
      </View>
      <View className="px-3 py-1 rounded-xl bg-primary/10">
        <Text className="text-primary font-medium text-sm">Open</Text>
      </View>
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-light-border dark:bg-dark-border mx-4" />;
}
