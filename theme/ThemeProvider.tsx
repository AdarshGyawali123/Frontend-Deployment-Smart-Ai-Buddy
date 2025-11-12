import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { COLORS } from "./colors";

type Scheme = "light" | "dark";

type ThemeCtx = {
  colorScheme: Scheme;
  colors: typeof COLORS["light"];
  toggle: () => void;
  set: (s: Scheme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = "preferred-color-scheme";
const WEB_STORAGE_KEY = STORAGE_KEY;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // NativeWind’s color scheme control (drives `dark` class)
  const { colorScheme: nwScheme, setColorScheme } = useColorScheme();
  const [scheme, setScheme] = useState<Scheme>(nwScheme);

  // Load persisted preference (if any)
  useEffect(() => {
    if (Platform.OS !== "web") return;

    try {
      const saved = localStorage.getItem(WEB_STORAGE_KEY) as Scheme | null;
      const start = (saved as Scheme) ?? (nwScheme as Scheme) ?? "light";
      if (start === "dark") document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");

      if (start !== scheme) {
        setScheme(start);
        setColorScheme(start);
      }
    } catch (e) {
      if ((nwScheme as Scheme) !== scheme) {
        setScheme(nwScheme as Scheme);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as Scheme | null;
      if (saved && saved !== scheme) {
        setScheme(saved);
        setColorScheme(saved);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local state in sync when NativeWind’s scheme changes
  useEffect(() => {
    if (nwScheme !== scheme) setScheme(nwScheme);
  }, [nwScheme, scheme]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const root = document.documentElement;
      if (!root) return;
      if (scheme === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    }
  }, [scheme]);

  // Platform-aware token set for current scheme
  const colors = useMemo(() => COLORS[scheme], [scheme]);

  const value = useMemo<ThemeCtx>(
    () => ({
      colorScheme: scheme,
      colors,
      toggle: async () => {
        const next: Scheme = scheme === "dark" ? "light" : "dark";
        setScheme(next);
        setColorScheme(next); // flips the NativeWind `dark` class
        await AsyncStorage.setItem(STORAGE_KEY, next);
        // (Optional) Make platform discoverable on web
        if (Platform.OS === "web") {
          document.documentElement.setAttribute("data-platform", Platform.OS);
        }
      },
      set: async (s: Scheme) => {
        setScheme(s);
        setColorScheme(s);
        await AsyncStorage.setItem(STORAGE_KEY, s);
        if (Platform.OS === "web") {
          document.documentElement.setAttribute("data-platform", Platform.OS);
        }
      },
    }),
    [scheme, colors, setColorScheme]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useThemeMode must be used inside <ThemeProvider />");
  return ctx;
}
