import React, { createContext, useContext, useEffect, useState } from "react";
import { getItem, setItem, deleteItem } from "@/lib/secureStorage";
import { getApiBase } from "@/constants/api";

type User = { id: string; email: string; role: string; name?: string };
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (d: { email: string; password: string }) => Promise<void>;
  signUp: (d: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------- Config ----------
const API_BASE = getApiBase();
const AUTH_BASE = `${API_BASE}/api/auth`;

// ---------- Token keys + in-memory shadow ----------
const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

let accessTokenMem: string | null = null;
let refreshTokenMem: string | null = null;
let refreshInFlight: Promise<string> | null = null;

async function getTokens() {
  if (!accessTokenMem) accessTokenMem = await getItem(ACCESS_KEY);
  if (!refreshTokenMem) refreshTokenMem = await getItem(REFRESH_KEY);
  return { accessToken: accessTokenMem, refreshToken: refreshTokenMem };
}

async function setTokens(a: string | null, r: string | null) {
  accessTokenMem = a;
  refreshTokenMem = r;

  if (a) await setItem(ACCESS_KEY, a);
  else await deleteItem(ACCESS_KEY);

  if (r) await setItem(REFRESH_KEY, r);
  else await deleteItem(REFRESH_KEY);
}

// ---------- Low-level helpers aligned with your routes.ts ----------
async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = await getTokens();
  if (!refreshToken) throw new Error("No refresh token");

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const res = await fetch(`${AUTH_BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.accessToken) {
      await setTokens(null, null);
      refreshInFlight = null;
      throw Object.assign(new Error("UNAUTHORIZED"), { status: 401, json });
    }
    await setTokens(json.accessToken, refreshToken);
    refreshInFlight = null;
    return json.accessToken as string;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function authFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = await getTokens();
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status !== 401) {
    const json = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) throw Object.assign(new Error("Request failed"), { status: res.status, json });
    return json;
  }

  if (!retry) {
    const json = await res.json().catch(() => ({}));
    throw Object.assign(new Error("UNAUTHORIZED"), { status: 401, json });
  }

  const newAccess = await refreshAccessToken();
  const res2 = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, Authorization: `Bearer ${newAccess}` },
  });
  const json2 = (await res2.json().catch(() => ({}))) as T;
  if (!res2.ok) throw Object.assign(new Error("Request failed"), { status: res2.status, json: json2 });
  return json2;
}

// ---------- Public API wrappers (exactly your existing endpoints) ----------
async function apiRegister(d: { name: string; email: string; password: string }): Promise<User> {
  const res = await fetch(`${AUTH_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: d.name.trim(),
      email: d.email.trim().toLowerCase(),
      password: d.password,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error("REGISTER_FAILED"), { status: res.status, json });
  }
  const { accessToken, refreshToken, user } = json;
  await setTokens(accessToken, refreshToken);
  return user as User;
}

async function apiLogin(d: { email: string; password: string }): Promise<User> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: d.email.trim().toLowerCase(),
      password: d.password,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error("LOGIN_FAILED"), { status: res.status, json });
  }
  const { accessToken, refreshToken, user } = json;
  await setTokens(accessToken, refreshToken);
  return user as User;
}

async function apiMe(): Promise<User> {
  const data = await authFetch<{ user: User }>(`/api/auth/me`, { method: "GET" });
  return data.user;
}

// ---------- Provider ----------
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const u = await apiMe();
      setUser(u);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      await refreshProfile();
      setLoading(false);
    })();
  }, []);

  const signIn = async (d: { email: string; password: string }) => {
    const u = await apiLogin(d);
    setUser(u);
  };

  const signUp = async (d: { name: string; email: string; password: string }) => {
    const u = await apiRegister(d);
    setUser(u);
  };

  const signOut = async () => {
    await setTokens(null, null); // stateless logout
    setUser(null);
  };

// Expose the current access token (or null)
  const getAccessToken = async () => {
    const { accessToken } = await getTokens();
    return accessToken ?? null;
  };
  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshProfile, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
