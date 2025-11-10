import { useEffect } from "react";
import { useRouter } from "expo-router";

/**
 * This route only exists to satisfy the (tabs)/tools layout expectation.
 * It instantly redirects back to the Tools list screen (study-tools).
 */
export default function ToolsIndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/study-tools");
  }, [router]);
  return null;
}
