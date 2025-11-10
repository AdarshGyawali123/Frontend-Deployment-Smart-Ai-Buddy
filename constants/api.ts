import { Platform } from "react-native";
import Constants from "expo-constants";

export function getApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (env) return env;

  if (Platform.OS !== "web") {
    const hostUri =
      (Constants as any).expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any).manifest?.debuggerHost; // older fallback

    const host = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
    if (host) return `http://${host}:5001`;
  }

  return "http://localhost:5001";
}

export const API_BASE = getApiBase();
export async function getHealth() {
  const r = await fetch(`${API_BASE}/health`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}