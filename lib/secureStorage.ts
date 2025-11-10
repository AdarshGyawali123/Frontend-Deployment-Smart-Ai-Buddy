import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Load expo-secure-store only on native and only when available.
 * We avoid importing it on web entirely to prevent shim/runtime errors.
 */
async function getSecureStore() {
  if (Platform.OS === "web") return null;
  try {
    // dynamic import so the web bundle doesn't include it
    const mod = await import("expo-secure-store");
    // Some bundlers put functions on the module itself, not "default"
    const SecureStore: any = (mod as any)?.default ?? mod;

    // Check availability (device lock & hardware availability etc.)
    if (typeof SecureStore?.isAvailableAsync === "function") {
      const ok = await SecureStore.isAvailableAsync();
      if (!ok) return null;
    } else {
      // If API is weirdly shaped, but core methods exist, we still try
      if (
        typeof SecureStore?.getItemAsync !== "function" ||
        typeof SecureStore?.setItemAsync !== "function" ||
        typeof SecureStore?.deleteItemAsync !== "function"
      ) {
        return null;
      }
    }

    return SecureStore;
  } catch {
    return null;
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  const SecureStore = await getSecureStore();
  if (SecureStore) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // fall through to AsyncStorage
    }
  }
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    return AsyncStorage.setItem(key, value);
  }
  const SecureStore = await getSecureStore();
  if (SecureStore) {
    try {
      return await SecureStore.setItemAsync(key, value);
    } catch {
      // fall through to AsyncStorage
    }
  }
  return AsyncStorage.setItem(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    return AsyncStorage.removeItem(key);
  }
  const SecureStore = await getSecureStore();
  if (SecureStore) {
    try {
      return await SecureStore.deleteItemAsync(key);
    } catch {
      // fall through to AsyncStorage
    }
  }
  return AsyncStorage.removeItem(key);
}
