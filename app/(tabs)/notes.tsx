import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
  Dimensions,
  ScrollView
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import Header from "@/components/Header";
import { useAuth } from "@/providers/AuthProvider";
import { getApiBase } from "@/constants/api";
import { useThemeMode } from "@/theme/ThemeProvider";
import { Wand2 } from "lucide-react-native";
import Markdown from "react-native-markdown-display";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { emit } from "@/lib/eventBus";

type Note = {
  id: string;
  userId: string;
  title: string;
  source: "MANUAL" | "UPLOAD" | "LINK";
  rawText: string;
  extractedText?: string | null;
  courseId?: string | null;
  createdAt: string;
  updatedAt?: string;
};

const API_BASE = getApiBase();
const SUMMARY_KEY = (id: string) => `note_summary_${id}`;
const INDEXED_KEY = (id: string) => `note_indexed_${id}`;
const LAST_INDEXED_KEY = "last-indexed-note-id";

export default function UploadsScreen() {
  const { user, loading, getAccessToken } = useAuth();
  const { colorScheme, colors } = useThemeMode();
  const isDark = colorScheme === "dark";

  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryText, setSummaryText] = useState<string>("");

  const [indexingNoteId, setIndexingNoteId] = useState<string | null>(null);
  const [indexedNoteIds, setIndexedNoteIds] = useState<Set<string>>(new Set());

  // ---------- summaries persistence ----------
  const loadSummaryFromStorage = useCallback(async (noteId: string) => {
    try {
      const saved = await AsyncStorage.getItem(SUMMARY_KEY(noteId));
      setSummaryText(saved || "");
    } catch {}
  }, []);

  const saveSummaryToStorage = useCallback(async (noteId: string, text: string) => {
    try {
      await AsyncStorage.setItem(SUMMARY_KEY(noteId), text);
    } catch {}
  }, []);

  const clearAllSummaries = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const ours = keys.filter((k) => k.startsWith("note_summary_"));
      if (ours.length) await AsyncStorage.multiRemove(ours);
    } catch {}
  }, []);

  // ---------- indexed flags persistence ----------
  const hydrateIndexedFlags = useCallback(async (list: Note[]) => {
    try {
      const keys = list.map((n) => INDEXED_KEY(n.id));
      const pairs = await AsyncStorage.multiGet(keys);
      const next = new Set<string>();
      for (const [k, v] of pairs) {
        if (v === "true") {
          const noteId = k.replace("note_indexed_", "");
          next.add(noteId);
        }
      }
      setIndexedNoteIds(next);
    } catch {}
  }, []);

  const setIndexedTrue = useCallback(async (noteId: string) => {
    try {
      await AsyncStorage.setItem(INDEXED_KEY(noteId), "true");
      setIndexedNoteIds((prev) => new Set(prev).add(noteId));
    } catch {}
  }, []);

  const clearIndexedFlag = useCallback(async (noteId: string) => {
    try {
      await AsyncStorage.removeItem(INDEXED_KEY(noteId));
      setIndexedNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    } catch {}
  }, []);

  // ---------- data ----------
  const loadNotes = useCallback(async () => {
    try {
      setLoadingList(true);
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/notes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => []);
      if (!res.ok) throw json;
      const uploadsOnly = (json as Note[]).filter((n) => n.source === "UPLOAD");
      setNotes(uploadsOnly);

      // hydrate indexed flags for these notes
      await hydrateIndexedFlags(uploadsOnly);

      // choose selected note if none
      if (uploadsOnly.length > 0 && !selectedNoteId) {
        const first = uploadsOnly[0].id;
        setSelectedNoteId(first);
        await loadSummaryFromStorage(first);
      }
    } catch (e) {
      console.warn("Failed to load notes", e);
    } finally {
      setLoadingList(false);
    }
  }, [getAccessToken, selectedNoteId, loadSummaryFromStorage, hydrateIndexedFlags]);

  useEffect(() => {
    if (!loading && user) loadNotes();
  }, [loading, user, loadNotes]);

  useEffect(() => {
    if (selectedNoteId) {
      loadSummaryFromStorage(selectedNoteId);
    } else {
      setSummaryText("");
    }
  }, [selectedNoteId, loadSummaryFromStorage]);

  const insets = useSafeAreaInsets();
  // Your tab bar is absolute with height 54 and bottom margin 36 (from your Tabs layout)
  const TAB_HEIGHT = 54;
  const TAB_MARGIN_BOTTOM = 36;
  const BOTTOM_OVERLAY = insets.bottom + TAB_HEIGHT + TAB_MARGIN_BOTTOM;

  // ---------- web-only file conversion ----------
  async function webFileFromUri(uri: string, name: string, mime?: string): Promise<File> {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const filename = name || "upload";
    const type = mime || blob.type || "application/octet-stream";
    return new File([blob], filename, { type });
  }

  // ---------- upload + auto-index ----------
  async function pickAndUpload() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: "*/*",
        multiple: false,
      });
      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) {
        Alert.alert("No file", "Invalid selection.");
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in to upload notes.");
        return;
      }

      setBusy(true);
      const form = new FormData();

      if (Platform.OS === "web") {
        const file = await webFileFromUri(asset.uri, asset.name || "upload", asset.mimeType);
        form.append("file", file);
      } else {
        form.append("file", {
          // @ts-ignore react-native FormData shim
          uri: asset.uri,
          name: asset.name || "upload",
          type: asset.mimeType || "application/octet-stream",
        });
      }

      const res = await fetch(`${API_BASE}/api/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` } as any,
        body: form,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Upload failed";
        Alert.alert("Upload error", msg);
        return;
      }

      const noteId: string | undefined = json?.note?.id;

      await loadNotes();
      if (noteId) {
        setSelectedNoteId(noteId);
        await clearAllSummaries();
        await autoIndexAfterUpload(noteId, token);
      }
    } catch (e: any) {
      console.error("Upload error", e);
      Alert.alert("Upload error", e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function autoIndexAfterUpload(noteId: string, token: string) {
    try {
      setIndexingNoteId(noteId);
      const res = await fetch(`${API_BASE}/api/embeddings/index/${noteId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Indexing failed";
        Alert.alert("Indexing error", msg);
        return;
      }
      await setIndexedTrue(noteId);
      await loadNotes();
      await AsyncStorage.setItem(LAST_INDEXED_KEY, noteId).catch(() => {});
      emit("notes:changed", { noteId: noteId });
    } catch (e: any) {
      console.error("Auto-indexing error", e);
      Alert.alert("Indexing error", e?.message || "Something went wrong.");
    } finally {
      setIndexingNoteId(null);
    }
  }

  async function indexEmbeddings(noteId: string) {
    try {
      const token = await getAccessToken();
      if (!token) return;
      setIndexingNoteId(noteId);
      const res = await fetch(`${API_BASE}/api/embeddings/index/${noteId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Indexing failed";
        Alert.alert("Indexing error", msg);
        return;
      }
      await setIndexedTrue(noteId);
      await AsyncStorage.setItem(LAST_INDEXED_KEY, noteId).catch(() => {});
      emit("notes:changed", { noteId: noteId });
      Alert.alert("Indexed", `Chunks created: ${json?.chunks ?? "?"}`);
    } catch (e) {
      console.error("Indexing error", e);
      Alert.alert("Indexing error", "Something went wrong.");
    } finally {
      setIndexingNoteId(null);
    }
  }

  // ---------- delete ----------
  async function deleteNote(noteId: string) {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/notes/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Could not delete";
        Alert.alert("Delete failed", msg);
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await AsyncStorage.removeItem(SUMMARY_KEY(noteId));
      await clearIndexedFlag(noteId);
      emit("notes:changed", { noteId: undefined });
      if (selectedNoteId === noteId) {
        const next = notes.find((n) => n.id !== noteId);
        setSelectedNoteId(next?.id ?? null);
        if (next) {
          await loadSummaryFromStorage(next.id);
        } else {
          setSummaryText("");
        }
      }
    } catch (e) {
      console.error("Delete note error", e);
      Alert.alert("Delete error", "Something went wrong.");
    }
  }

  function confirmDelete(noteId: string) {
    if (Platform.OS === "web") {
       
      if (window.confirm("Delete this note? This will remove the note and its upload on disk.")) {
        void deleteNote(noteId);
      }
    } else {
      Alert.alert(
        "Delete?",
        "This will remove the note and its upload on disk.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteNote(noteId) },
        ],
        { cancelable: true }
      );
    }
  }

  // ---------- summary ----------
  async function generateSummary() {
    if (!selectedNoteId) return;
    try {
      setSummaryBusy(true);
      setSummaryText("");

      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in to generate summaries.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/notes/${selectedNoteId}/summary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ style: "bullet", length: "medium" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Summary failed";
        Alert.alert("Summary error", msg);
        return;
      }
      const text = (json?.summary ?? "").trim();
      setSummaryText(text);
      await saveSummaryToStorage(selectedNoteId, text);
    } catch (e: any) {
      console.error("Summary error", e);
      Alert.alert("Summary error", e?.message || "Something went wrong.");
    } finally {
      setSummaryBusy(false);
    }
  }

  const hasNotes = notes.length > 0;
  const selected = useMemo(() => notes.find((n) => n.id === selectedNoteId) || null, [notes, selectedNoteId]);
  const selectedIsIndexed = selectedNoteId ? indexedNoteIds.has(selectedNoteId) : false;
  const generateDisabled = !selectedIsIndexed || summaryBusy || !selectedNoteId || !!summaryText;

  // Theme-aware Markdown styles
  const mdStyles = useMemo(
    () => ({
      body: { color: colors.foreground },
      text: { color: colors.foreground },
      heading1: { color: colors.foreground, fontWeight: "700", marginBottom: 8 },
      heading2: { color: colors.foreground, fontWeight: "700", marginBottom: 6 },
      heading3: { color: colors.foreground, fontWeight: "700", marginBottom: 4 },
      bullet_list: { marginVertical: 6 },
      ordered_list: { marginVertical: 6 },
      list_item: { marginVertical: 2 },
      strong: { fontWeight: "700", color: colors.foreground },
      em: { fontStyle: "italic", color: colors.foreground },
      code_inline: {
        backgroundColor: isDark ? colors.grey5 : colors.grey4,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        color: colors.foreground,
      },
      fence: {
        backgroundColor: isDark ? colors.grey5 : colors.grey4,
        borderRadius: 10,
        padding: 10,
        color: colors.foreground,
      },
      table: { borderWidth: 1, borderColor: colors.grey4, borderRadius: 8, overflow: "hidden" },
      thead: { backgroundColor: isDark ? colors.grey5 : colors.grey4 },
      th: {
        padding: 8,
        borderWidth: 1,
        borderColor: colors.grey4,
        fontWeight: "700",
        color: colors.foreground,
      },
      td: {
        padding: 8,
        borderWidth: 1,
        borderColor: colors.grey4,
        color: colors.foreground,
      },
      link: { color: colors.primary, textDecorationLine: "underline" },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: colors.grey3,
        paddingLeft: 10,
        color: colors.foreground,
      },
    }),
    [colors, isDark]
  );

  const cardWidth = Math.min(320, Math.round(Dimensions.get("window").width * 0.78));

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
      <View className="flex-1 px-6 py-6">
        {/* Top row */}
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-light-text dark:text-dark-text">Notes</Text>
          <Pressable
            onPress={pickAndUpload}
            disabled={busy}
            className="px-4 py-2 rounded-2xl bg-primary items-center justify-center"
          >
            <Text className="text-white font-semibold">
              {busy ? "Uploading..." : "Upload note"}
            </Text>
          </Pressable>
        </View>

        {/* Horizontal notes scroller */}
        <View className="mt-4">
          {loadingList ? (
            <View className="items-center justify-center py-10">
              <ActivityIndicator />
            </View>
          ) : !hasNotes ? (
            <View className="items-center justify-center mt-10">
              <Text className="text-light-subtext dark:text-dark-subtext">No notes yet.</Text>
              <Text className="text-light-subtext dark:text-dark-subtext">
                Tap “Upload note” to get started.
              </Text>
            </View>
          ) : (
            <FlatList
              data={notes}
              keyExtractor={(n) => n.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              decelerationRate="fast"
              snapToInterval={cardWidth + 12}
              contentContainerStyle={{ paddingRight: 6 }}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => (
                <Card
                  width={cardWidth}
                  colors={colors}
                  active={item.id === selectedNoteId}
                  title={item.title || "(untitled)"}
                  date={new Date(item.createdAt).toLocaleString()}
                  isIndexed={indexedNoteIds.has(item.id)}
                  isIndexing={indexingNoteId === item.id}
                  onSelect={() => {
                    setSelectedNoteId(item.id);
                    loadSummaryFromStorage(item.id);
                  }}
                  onIndex={() => indexEmbeddings(item.id)}
                  onDelete={() => confirmDelete(item.id)}
                />
              )}
            />
          )}
        </View>

        {/* Summary section */}
        {hasNotes && selected ? (
          <View className="mt-6 flex-1">
            <Text className="text-xl font-semibold text-light-text dark:text-dark-text">
              Summary
            </Text>

            {/* Prompt card */}
            <View
              className="mt-3 rounded-2xl border p-4 items-center"
              style={{ backgroundColor: colors.card, borderColor: colors.grey4 }}
            >
              <Text className="text-center" style={{ color: colors.foreground }}>
                Create a clear and easy-to-understand summary of your content
              </Text>
              <View className="mt-3 items-center">
                <Pressable
                  onPress={generateSummary}
                  disabled={!selectedIsIndexed || summaryBusy || !!summaryText}
                  className={`px-4 py-2 rounded-2xl ${
                    !selectedIsIndexed || summaryBusy || !!summaryText ? "bg-primary/60" : "bg-primary"
                  } flex-row items-center justify-center gap-2`}
                >
                  <Wand2 size={18} color="#fff" />
                  <Text className="text-white font-semibold">
                    {summaryText ? "Generated" : "Generate"}
                  </Text>
                </Pressable>
                {summaryBusy && (
                  <Text className="mt-2 text-xs text-center" style={{ color: colors.grey }}>
                    We&apos;re still processing this request. This should only take a few moments.
                  </Text>
                )}
              </View>
            </View>

            {/* Markdown Result */}
            {summaryText ? (
              <ScrollView
                className="mt-4"
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: BOTTOM_OVERLAY + 16 }}
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <View
                  className="rounded-2xl border p-4"
                  style={{ backgroundColor: colors.card, borderColor: colors.grey4 }}
                >
                  <Text className="text-base font-semibold mb-2" style={{ color: colors.foreground }}>
                    Generated summary
                  </Text>
                  <Markdown style={mdStyles}>{summaryText}</Markdown>
                </View>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Card({
  width,
  colors,
  active,
  title,
  date,
  isIndexed,
  isIndexing,
  onSelect,
  onIndex,
  onDelete,
}: {
  width: number;
  colors: any;
  active: boolean;
  title: string;
  date: string;
  isIndexed: boolean;
  isIndexing: boolean;
  onSelect: () => void;
  onIndex: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className="rounded-2xl border p-4"
      style={{
        width,
        backgroundColor: colors.card,
        borderColor: active ? colors.primary : colors.grey4,
      }}
    >
      <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
        {title}
      </Text>
      <Text className="mt-1 text-xs" style={{ color: colors.grey }}>
        {date}
      </Text>

      <View className="flex-row gap-3 mt-4">
        {isIndexed ? (
          <Pressable
            disabled
            className="px-3 py-2 rounded-xl"
            style={{
              backgroundColor: (colors as any).grey5,
              opacity: 0.8,
            }}
          >
            <Text style={{ color: colors.foreground, opacity: 0.7 }}>Indexed</Text>
          </Pressable>
        ) : isIndexing ? (
          <View
            className="px-3 py-2 rounded-xl flex-row items-center gap-2"
            style={{ borderWidth: 1, borderColor: colors.grey4 }}
          >
            <ActivityIndicator />
            <Text style={{ color: colors.foreground }}>Indexing…</Text>
          </View>
        ) : (
          <Pressable
            onPress={onIndex}
            className="px-3 py-2 rounded-xl"
            style={{ borderWidth: 1, borderColor: colors.grey4 }}
          >
            <Text style={{ color: colors.foreground }}>Index</Text>
          </Pressable>
        )}

        <Pressable
          onPress={onDelete}
          className="px-3 py-2 rounded-xl"
          style={{ backgroundColor: colors.destructive }}
        >
          <Text className="text-white">Delete</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
