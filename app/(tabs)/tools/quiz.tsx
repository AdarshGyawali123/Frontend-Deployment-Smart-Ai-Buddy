import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { getApiBase } from "@/constants/api";
import Header from "@/components/Header";
import { getQuiz as cacheGetQuiz, setQuiz as cacheSetQuiz } from "@/lib/toolsCache";

type ApiQuestion = {
  question?: string;
  choices?: string[];
  answer_index?: number;
  explanation?: string;
};
type Question = {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

const API_BASE = getApiBase();
const LAST_INDEXED_KEY = "last-indexed-note-id";

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 54;
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { noteId: noteIdParam } = useLocalSearchParams<{ noteId?: string }>();

  const [noteId, setNoteId] = useState<string | null>(noteIdParam ?? null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({}); // index -> chosen option
  const [hydratedFromCache, setHydratedFromCache] = useState(false);

  // resolve noteId (prefer URL param; fallback to last-indexed)
  useEffect(() => {
    (async () => {
      if (noteIdParam) return;
      const last = await AsyncStorage.getItem(LAST_INDEXED_KEY);
      if (last) setNoteId(last);
    })();
  }, [noteIdParam]);

  const canFetch = useMemo(() => !!noteId, [noteId]);

  const mapApi = useCallback((raw: ApiQuestion[]): Question[] => {
    return raw
      .map((q) => ({
        question: q.question ?? "",
        choices: Array.isArray(q.choices) ? q.choices.slice(0, 4) : [],
        answerIndex:
          typeof q.answer_index === "number" && q.answer_index >= 0 ? q.answer_index : -1,
        explanation: q.explanation ?? "",
      }))
      .filter((q) => q.question && q.choices.length === 4 && q.answerIndex >= 0);
  }, []);

  async function fetchQuiz(force = false) {
    if (!canFetch) {
      setErr("No note selected. Please index a note first.");
      setItems([]);
      return;
    }
    if (!force && items.length > 0) {
      // Already have data (from cache or earlier fetch) — don’t refetch.
      return;
    }

    try {
      setErr(null);
      setLoading(true);
      setSelected({});
      const token = await getAccessToken();

      const res = await fetch(`${API_BASE}/api/notes/${noteId}/quiz`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ count: 10, difficulty: "medium" }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg =
          (typeof json?.error === "string" && json.error) ||
          "Failed to generate quiz.";
        setErr(msg);
        setItems([]);
        return;
      }

      const raw: ApiQuestion[] = Array.isArray(json?.quiz) ? json.quiz : [];
      const mapped = mapApi(raw);
      if (!mapped.length) {
        setErr("No quiz questions were returned. Try again or pick another note.");
        setItems([]);
        return;
      }

      setItems(mapped);
      // persist to cache
      if (noteId) await cacheSetQuiz(noteId, mapped);
    } catch (e: any) {
      console.error("quiz error", e);
      setErr(e?.message || "Something went wrong.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Try cache first when noteId resolves; if no cache, fetch from API once.
  useEffect(() => {
    (async () => {
      if (!canFetch) return;
      const cached = await cacheGetQuiz(noteId!);
      if (cached && Array.isArray(cached) && cached.length) {
        setItems(cached);
        setHydratedFromCache(true);
        return; // don’t fetch now; user can tap Regenerate
      }
      setHydratedFromCache(true);
      await fetchQuiz(); // initial fetch
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch]);

  const answeredCount = Object.keys(selected).length;
  const score = items.reduce((acc, q, i) => {
    const pick = selected[i];
    if (pick === undefined) return acc;
    return acc + (pick === q.answerIndex ? 1 : 0);
  }, 0);

  return (
    <View className="flex-1 bg-light-bg dark:bg-dark-bg">
      <Header />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!canFetch ? (
          <EmptyState
            title="No note selected"
            subtitle="Go back and index a note first."
            actionLabel="Back to Tools"
            onAction={() => router.replace("/(tabs)/study-tools")}
          />
        ) : !hydratedFromCache || loading ? (
          <View className="mt-10 items-center">
            <ActivityIndicator />
            <Text className="mt-3 text-light-subtext dark:text-dark-subtext">
              {loading ? "Generating quiz…" : "Loading quiz…"}
            </Text>
          </View>
        ) : err ? (
          <EmptyState
            title="Couldn’t create a quiz"
            subtitle={err}
            actionLabel="Try Again"
            onAction={() => fetchQuiz(true)}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No quiz yet"
            subtitle="Generate a quiz for this note."
            actionLabel="Generate"
            onAction={() => fetchQuiz(true)}
          />
        ) : (
          <>
            {/* Header / progress */}
            <View className="mb-4">
              <Text className="text-xl font-semibold text-light-text dark:text-dark-text">
                Quiz
              </Text>
              <Text className="mt-1 text-light-subtext dark:text-dark-subtext">
                Answer questions based on your indexed note.
              </Text>

              <View className="mt-3 h-2 w-full rounded-full bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border overflow-hidden">
                <View
                  className="h-full bg-primary"
                  style={{
                    width: `${items.length ? (answeredCount / items.length) * 100 : 0}%`,
                  }}
                />
              </View>
              <Text className="mt-2 text-xs text-light-subtext dark:text-dark-subtext">
                {answeredCount}/{items.length} answered · Score: {score}
              </Text>
            </View>

            {/* Questions */}
            <View className="gap-3">
              {items.map((q, idx) => {
                const picked = selected[idx];
                const isAnswered = picked !== undefined;
                const correct = isAnswered && picked === q.answerIndex;
                return (
                  <View
                    key={idx}
                    className="rounded-2xl border p-4 bg-light-surface dark:bg-dark-surface"
                    style={{ borderColor: "rgba(148,163,184,0.35)" }}
                  >
                    <Text className="text-sm font-semibold text-light-text dark:text-dark-text">
                      Q{idx + 1}. {q.question}
                    </Text>

                    <View className="mt-3 gap-2">
                      {q.choices.map((choice, cIdx) => {
                        const chosen = picked === cIdx;
                        const showCorrect = isAnswered && cIdx === q.answerIndex;
                        const showWrong = isAnswered && chosen && !showCorrect;

                        return (
                          <Pressable
                            key={cIdx}
                            disabled={isAnswered}
                            onPress={() =>
                              setSelected((s) => ({
                                ...s,
                                [idx]: cIdx,
                              }))
                            }
                            className={[
                              "px-3 py-2 rounded-xl border",
                              "flex-row items-center",
                              isAnswered
                                ? showCorrect
                                  ? "bg-green-500/10 border-green-500"
                                  : showWrong
                                  ? "bg-danger/10 border-danger"
                                  : "bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border"
                                : "bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border",
                            ].join(" ")}
                          >
                            <View
                              className={[
                                "w-5 h-5 mr-2 rounded-full border items-center justify-center",
                                chosen ? "bg-primary border-primary" : "border-light-border dark:border-dark-border",
                              ].join(" ")}
                            >
                              {chosen ? (
                                <View className="w-2.5 h-2.5 rounded-full bg-white" />
                              ) : null}
                            </View>
                            <Text className="text-light-text dark:text-dark-text">{choice}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {isAnswered ? (
                      <View className="mt-3 rounded-xl border px-3 py-2 bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border">
                        <Text
                          className={[
                            "font-semibold",
                            correct ? "text-green-600" : "text-danger",
                          ].join(" ")}
                        >
                          {correct ? "Correct" : "Incorrect"}
                        </Text>
                        {q.explanation ? (
                          <Text className="mt-1 text-light-text dark:text-dark-text">
                            {q.explanation}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Actions */}
            <View className="mt-6 flex-row gap-3">
              <Pressable
                onPress={() => fetchQuiz(true)}
                className="px-4 py-2 rounded-2xl bg-primary items-center justify-center"
              >
                <Text className="text-white font-semibold">Regenerate</Text>
              </Pressable>
              <Pressable
                onPress={() => router.replace("/(tabs)/study-tools")}
                className="px-4 py-2 rounded-2xl border border-light-border dark:border-dark-border items-center justify-center"
              >
                <Text className="text-light-text dark:text-dark-text">Back to Tools</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mt-10 px-4">
      <Text className="text-xl font-semibold text-light-text dark:text-dark-text">{title}</Text>
      {subtitle ? (
        <Text className="mt-2 text-light-subtext dark:text-dark-subtext">{subtitle}</Text>
      ) : null}
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          className="self-start mt-4 px-4 py-2 rounded-2xl bg-primary"
        >
          <Text className="text-white font-semibold">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
