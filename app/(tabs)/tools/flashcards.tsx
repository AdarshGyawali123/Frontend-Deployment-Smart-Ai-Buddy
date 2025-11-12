import React, { useEffect, useMemo, useState } from "react";
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
import { getFlashcards as cacheGetFC, setFlashcards as cacheSetFC } from "@/lib/toolsCache";

type ApiCard = { q?: string; a?: string };
type Card = { q: string; a: string; id: string };

const API_BASE = getApiBase();
const LAST_INDEXED_KEY = "last-indexed-note-id";

export default function FlashcardsScreen() {
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 54;
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { noteId: noteIdParam } = useLocalSearchParams<{ noteId?: string }>();

  const [noteId, setNoteId] = useState<string | null>(noteIdParam ?? null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
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

  async function fetchFlashcards(force = false) {
    if (!canFetch) {
      setErr("No note selected. Please index a note first.");
      setCards([]);
      return;
    }
    if (!force && cards.length > 0) {
      // Already have data (cached or fetched) — don’t refetch.
      return;
    }

    try {
      setErr(null);
      setLoading(true);
      const token = await getAccessToken();

      const res = await fetch(`${API_BASE}/api/notes/${noteId}/flashcards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ count: 12 }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg =
          (typeof json?.error === "string" && json.error) ||
          "Failed to generate flashcards.";
        setErr(msg);
        setCards([]);
        return;
      }

      const raw: ApiCard[] = Array.isArray(json?.cards) ? json.cards : [];
      const mapped: Card[] = raw
        .map((c, i) => ({
          q: c.q ?? c?.front ?? "",
          a: c.a ?? c?.back ?? "",
          id: `${i}-${(c.q || c.a || "card").slice(0, 12)}-${Math.random().toString(36).slice(2,7)}`,
        }))
        .filter((c) => c.q && c.a);

      if (!mapped.length) {
        setErr("No flashcards were returned. Try again or pick another note.");
        setCards([]);
        return;
      }

      setCards(mapped);
      if (noteId) await cacheSetFC(noteId, mapped);
    } catch (e: any) {
      console.error("flashcards error", e);
      setErr(e?.message || "Something went wrong.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  // Try cache first when noteId resolves; if no cache, fetch from API once.
  useEffect(() => {
    (async () => {
      if (!canFetch) return;
      const cached = await cacheGetFC(noteId!);
      if (cached && Array.isArray(cached) && cached.length) {
        setCards(cached);
        setHydratedFromCache(true);
        return;
      }
      setHydratedFromCache(true);
      await fetchFlashcards();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch]);

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
              {loading ? "Generating flashcards…" : "Loading flashcards…"}
            </Text>
          </View>
        ) : err ? (
          <EmptyState
            title="Couldn’t create flashcards"
            subtitle={err}
            actionLabel="Try Again"
            onAction={() => fetchFlashcards(true)}
          />
        ) : cards.length === 0 ? (
          <EmptyState
            title="No flashcards yet"
            subtitle="Generate flashcards for this note."
            actionLabel="Generate"
            onAction={() => fetchFlashcards(true)}
          />
        ) : (
          <>
            <Text className="text-xl font-semibold text-light-text dark:text-dark-text">
              Flashcards
            </Text>
            <Text className="mt-1 text-light-subtext dark:text-dark-subtext">
              Tap a card to flip between question and answer.
            </Text>

            <View className="mt-4">
              {cards.map((c) => (
                <View key={c.id} className="mb-3">
                  <FlipCard q={c.q} a={c.a} />
                </View>
              ))}
            </View>

            <View className="mt-6 flex-row gap-3">
              <Pressable
                onPress={() => fetchFlashcards(true)}
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

import { useRef } from "react";
import { Platform, Pressable as RNPressable, ViewStyle, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const isWeb = Platform.OS === "web";

/**
 * Lightweight web-only static style fragment for animated faces.
 * We keep it small and scoped to web only to avoid changing native layout.
 */
const webFaceStaticStyle: ViewStyle = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 16, // matches px-4
  // backgroundColor left to className so dark/light themes still apply on native.
};

function FlipCard({ q, a }: { q: string; a: string }) {
  const rotation = useSharedValue(0);
  const isFlipping = useSharedValue(false);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180])}deg` },
    ],
    backfaceVisibility: "hidden",
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360])}deg` },
    ],
    backfaceVisibility: "hidden",
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  }));

  function flip() {
    if (isFlipping.value) return;
    isFlipping.value = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const target = rotation.value >= 90 ? 0 : 180;
    rotation.value = withTiming(target, { duration: 250 }, (finished) => {
      if (finished) {
        isFlipping.value = false;
      }
    });
  }

  return (
    <RNPressable onPress={flip}>
      <View className="h-40 rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border overflow-hidden relative">
        {/* front */}
        <Animated.View
          style={isWeb ? [frontStyle, webFaceStaticStyle] : frontStyle}
          className="flex-1 items-center justify-center bg-light-surface dark:bg-dark-surface px-4"
        >
          <Text className="text-lg font-semibold text-light-subtext dark:text-dark-subtext">
            Question
          </Text>
          <Text className="mt-2 text-center text-light-text dark:text-dark-text">{q}</Text>
          <Text className="mt-3 text-[11px] text-light-subtext dark:text-dark-subtext opacity-70 absolute bottom-2 right-3">
            Tap to flip
          </Text>
        </Animated.View>

        {/* back */}
        <Animated.View
          style={isWeb ? [backStyle, webFaceStaticStyle] : backStyle}
          className="flex-1 items-center justify-center bg-light-surface dark:bg-dark-surface px-4"
        >
          <Text className="text-lg font-semibold text-light-subtext dark:text-dark-subtext">
            Answer
          </Text>
          <Text className="mt-2 text-center text-light-text dark:text-dark-text">{a}</Text>
          <Text className="mt-3 text-[11px] text-light-subtext dark:text-dark-subtext opacity-70 absolute bottom-2 right-3">
            Tap to flip
          </Text>
        </Animated.View>
      </View>
    </RNPressable>
  );
}
