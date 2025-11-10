import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { getApiBase } from "@/constants/api";
import Header from "@/components/Header";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeMode } from "@/theme/ThemeProvider";
import { Send } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
import { on } from "@/lib/eventBus";

type Note = {
  id: string;
  title: string;
  source: "MANUAL" | "UPLOAD" | "LINK";
  createdAt: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ts: number;
};

const API_BASE = getApiBase();
const LAST_INDEXED_KEY = "last-indexed-note-id";
const CHAT_CACHE = (noteId: string) => `ai-tutor:chat:${noteId}`;

/** Robustly extract a reply string from many common API payload shapes */
function extractReply(payload: any): string | null {
  if (!payload) return null;

  if (typeof payload === "string") return payload.trim() || null;

  // flat fields
  const flat =
    payload.reply ??
    payload.message ??
    payload.answer ??
    payload.text ??
    payload.content;
  if (typeof flat === "string" && flat.trim()) return flat.trim();

  // nested common containers
  const d = payload.data || payload.result || payload.response || {};
  const nested =
    d.reply ?? d.message ?? d.answer ?? d.text ?? d.content;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  // OpenAI chat / responses-like
  const choice = payload.choices?.[0];
  const openaiMsg = choice?.message?.content ?? choice?.text;
  if (typeof openaiMsg === "string" && openaiMsg.trim()) return openaiMsg.trim();

  // Gemini-ish candidates
  const parts = payload.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((p: any) => p?.text)
      .filter(Boolean)
      .join("\n")
      .trim();
    if (joined) return joined;
  }

  // LangChain-ish
  const lc =
    payload.output_text ??
    payload.output ??
    payload.generations?.[0]?.[0]?.text;
  if (typeof lc === "string" && lc.trim()) return lc.trim();

  return null;
}

export default function AITutorScreen() {
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 54;

  const { getAccessToken, user, loading } = useAuth();
  const { colors } = useThemeMode();

  const [notesLoading, setNotesLoading] = useState(true);
  const [notesErr, setNotesErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteId, setNoteId] = useState<string | null>(null);

  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);

  const scrollRef = useRef<ScrollView>(null);

  const canChat = useMemo(() => !!noteId, [noteId]);
  const hasNotes = notes.length > 0;

  /* ------------------------------ load notes ------------------------------ */
  const loadNotes = React.useCallback(
    async (preferNoteId?: string) => {
      try {
        setNotesLoading(true);
        setNotesErr(null);
        const token = await getAccessToken();
        const res = await fetch(`${API_BASE}/api/notes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error(
            (typeof (json as any)?.error === "string" && (json as any).error) ||
              "Failed to fetch notes"
          );
        }

        const onlyUploads = (json as Note[]).filter((n) => n.source === "UPLOAD");
        setNotes(onlyUploads);
        if (onlyUploads.length === 0) {
          setNoteId(null);
          setMsgs([]);
          return;
        }

        // decide which note to pick
        const last = await AsyncStorage.getItem(LAST_INDEXED_KEY);
        const candidate =
          preferNoteId && onlyUploads.find((n) => n.id === preferNoteId)
            ? preferNoteId
            : onlyUploads.find((n) => n.id === last)?.id ?? onlyUploads[0]?.id;

        if (candidate) {
          setNoteId(candidate);
        }
      } catch (e: any) {
        console.error("load notes", e);
        setNotesErr(e?.message || "Could not load notes.");
        setNotes([]);
      } finally {
        setNotesLoading(false);
      }
    },
    [getAccessToken]
  );

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useFocusEffect(
    React.useCallback(() => {
      // when user navigates back to AI Tutor, refresh
      void loadNotes();

      // subscribe to cross-tab note changes (upload, delete, auto-index)
      const off = on("notes:changed", ({ noteId }) => {
        // re-load and, if we know the new noteId, prefer it
        void loadNotes(noteId);
      });

      // cleanup
      return () => off();
    }, [loadNotes])
  );
  /* -------------------------- hydrate chat per note ----------------------- */
  useEffect(() => {
    (async () => {
      if (!noteId) return;
      try {
        const raw = await AsyncStorage.getItem(CHAT_CACHE(noteId));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setMsgs(parsed);
            return;
          }
        }
        // default intro message
        setMsgs([
          {
            id: `sys-${Date.now()}`,
            role: "assistant",
            ts: Date.now(),
            text:
              "Have a question about your notes? Ask me anything — I’ll answer using the content from the selected note.",
          },
        ]);
      } catch {
        // ignore
      }
    })();
  }, [noteId]);

  /* --------------------------- persist chat cache ------------------------- */
  useEffect(() => {
    if (!noteId) return;
    AsyncStorage.setItem(CHAT_CACHE(noteId), JSON.stringify(msgs)).catch(() => {});
  }, [noteId, msgs]);

  /* ----------------------------- auto scroll ------------------------------ */
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [msgs.length]);

  /* ------------------------------- send msg ------------------------------- */
  async function onSend() {
    const text = composer.trim();
    if (!canChat || !text || sending) return;

    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMsgs((m) => [...m, userMsg]);
    setComposer("");
    setSending(true);

    try {
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ noteId, message: text }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errText =
          (typeof (json as any)?.error === "string" && (json as any).error) ||
          "Sorry — I couldn’t process that question.";
        setMsgs((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            ts: Date.now(),
            text: errText,
          },
        ]);
        return;
      }

      const botText = extractReply(json);
      if (!botText) {
        console.warn("[AI Tutor] Unexpected chat payload:", json);
        setMsgs((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            ts: Date.now(),
            text:
              "I got a response, but couldn’t read it. Please try again or rephrase your question.",
          },
        ]);
        return;
      }

      setMsgs((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          ts: Date.now(),
          text: botText,
        },
      ]);
    } catch (e: any) {
      console.error("chat error", e);
      setMsgs((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          ts: Date.now(),
          text: "Network error — please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (loading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-light-bg dark:bg-dark-bg">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-light-bg dark:bg-dark-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Header />

      {/* header copy */}
      <View className="px-6 pt-4">
        <Text className="text-2xl font-bold text-light-text dark:text-dark-text">AI Tutor</Text>
        <Text className="mt-1 text-light-subtext dark:text-dark-subtext">
          Have a question about your notes? Ask anything or request writing grounded in your
          selected note.
        </Text>
      </View>

      {/* Notes selector */}
      <View className="px-6 mt-3">
        <Text className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">
          Your notes
        </Text>
        {notesLoading ? (
          <View className="h-20 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : notesErr ? (
          <Text className="text-danger">{notesErr}</Text>
        ) : notes.length === 0 ? (
          <View className="py-3">
            <Text className="text-light-subtext dark:text-dark-subtext">
              No notes yet. Upload and index a note to start chatting.
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
              const active = item.id === noteId;
              return (
                <Pressable
                  onPress={() => {
                    setNoteId(item.id);
                    AsyncStorage.setItem(LAST_INDEXED_KEY, item.id).catch(() => {});
                  }}
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
                    className={active ? "text-white font-semibold" : ""}
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

      {/* Chat area */}
      { ! hasNotes ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-light-subtext dark:text-dark-subtext">
            Nothing here.
          </Text>
        </View>
      ):(
        <ScrollView
          ref={scrollRef}
          className="flex-1 mt-4"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {msgs.map((m) => (
          <Bubble key={m.id} msg={m} colors={colors} />
        ))}
      </ScrollView>
      )}

      {/* Composer */}
      <View
        className="px-4 py-3 border-t"
        style={{
          borderTopColor: colors.grey4,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 12,
        }}
      >
        <View
          className={[
            "flex-row rounded-2xl border items-end px-3 py-2",
            !hasNotes ? "opacity-60" : "",
          ].join(" ")}
          style={{ borderColor: colors.grey4, backgroundColor: colors.card }}
        >
          <TextInput
            value={composer}
            onChangeText={hasNotes && canChat && !sending ? setComposer : () => {}}
            editable={hasNotes && canChat && !sending}
            placeholder={
              !hasNotes
                ? "Upload and index a note to start chatting"
                : canChat
                ? "Type your question…"
                : "Select a note to start chatting"
            }
            placeholderTextColor={colors.grey}
            multiline
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={(e) => {
              const txt = e?.nativeEvent?.text ?? composer;
              if (!txt.trim() || sending) return;
              onSend();
            }}
            onKeyPress={(e) => {
              // Web-only nicety: Shift+Enter -> newline (don’t send)
              if (Platform.OS === "web") {
                // `shiftKey` exists on RN Web but not in the RN native typing.
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error - RN Web exposes shiftKey on nativeEvent
                const isShift = !!e.nativeEvent.shiftKey;
                if (e.nativeEvent.key === "Enter") {
                  if (isShift) {
                    e.preventDefault?.();
                    // Insert newline on web when Shift+Enter is pressed
                    setComposer((prev) => `${prev}\n`);
                  } else if (!sending) {
                    e.preventDefault?.();
                    onSend();
                  }
                }
              }
            }}
            className="flex-1 min-h-[30px] max-h-[90px] text-light-text dark:text-dark-text"
            style={{ color: colors.foreground }}
          />
          <Pressable
            onPress={onSend}
            disabled={!hasNotes || !canChat || !composer.trim() || sending}
            className={`ml-2 px-3 py-2 rounded-xl ${
              !hasNotes || !canChat || !composer.trim() || sending ? "opacity-50" : ""
            }`}
            style={{ backgroundColor: colors.primary }}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </Pressable>
        </View>
        {!hasNotes ? (
          <Text className="mt-2 text-xs" style={{ color: colors.grey }}>
            You don't have any uploaded notes yet. Go to Notes and upload one first.
          </Text>
        ) : !canChat ? (
          <Text className="mt-2 text-xs" style={{ color: colors.grey }}>
            Select a note above to enable chat.
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------- Bubble UI -------------------------------- */

function Bubble({ msg, colors }: { msg: ChatMsg; colors: any }) {
  const isUser = msg.role === "user";
  return (
    <View className={`w-full mt-3 ${isUser ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[86%] rounded-2xl border px-3 py-2`}
        style={{
          backgroundColor: isUser ? colors.primary : colors.card,
          borderColor: isUser ? colors.primary : colors.grey4,
        }}
      >
        <Text
          className="text-[13px]"
          style={{ color: isUser ? "#fff" : colors.foreground }}
          selectable
        >
          {msg.text}
        </Text>
        <Text
          className="text-[10px] mt-1"
          style={{ color: isUser ? "rgba(255,255,255,0.8)" : colors.grey }}
        >
          {new Date(msg.ts).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}
