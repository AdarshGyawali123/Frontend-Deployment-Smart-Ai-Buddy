import { View, Text } from "react-native";

type ApiDetails = {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
};

type ApiPayload = {
  error?: string;       // "BAD_REQUEST" | "UNAUTHORIZED" | string message
  message?: string;
  details?: ApiDetails; // zod flatten()
};

export default function ErrorBanner({
  error,
  message,
  fallback = "Something went wrong.",
}: {
  error?: any;
  message?: string | null;
  fallback?: string;
}) {
  // Back-compat: if a plain string was passed
  if (!error && typeof message === "string" && message) {
    return (
      <View className="mt-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
        <Text className="text-danger font-semibold">{message}</Text>
      </View>
    );
  }

  if (!error) return null;
  const payload: ApiPayload = (error?.json ?? error) || {};

  const code = payload.error;
  const friendly =
    code === "UNAUTHORIZED"
      ? "Invalid email or password."
      : code === "BAD_REQUEST"
      ? "Please fix the highlighted fields."
      : typeof code === "string"
      ? code
      : payload.message || fallback;

  const details = payload.details;
  const items = [
    ...(Object.values(details?.fieldErrors ?? {}).flat() ?? []),
    ...(details?.formErrors ?? []),
  ];

  return (
    <View className="mt-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
      <Text className="text-danger font-semibold">{friendly}</Text>
      {items.length > 0 && (
        <View className="mt-1">
          {items.map((m, i) => (
            <Text key={i} className="text-danger text-sm">
              • {m}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
