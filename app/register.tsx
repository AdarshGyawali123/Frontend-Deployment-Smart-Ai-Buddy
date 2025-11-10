import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import Header from "@/components/Header";
import ErrorBanner from "@/components/ErrorBanner";

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // form + field errors
  const [formError, setFormError] = useState<any>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  function parseFieldErrors(e: any) {
    const payload = e?.json ?? e;
    const fe = payload?.details?.fieldErrors ?? {};
    setNameErr(fe.name?.[0] ?? null);
    setEmailErr(fe.email?.[0] ?? null);
    setPasswordErr(fe.password?.[0] ?? null);
  }

  async function onSubmit() {
    setFormError(null);
    setNameErr(null);
    setEmailErr(null);
    setPasswordErr(null);
    setSubmitting(true);
    try {
      await signUp({ name: name.trim(), email: email.trim().toLowerCase(), password });
      router.replace("/(tabs)");
    } catch (e: any) {
      parseFieldErrors(e);
      setFormError(e); // pass raw error to ErrorBanner for exact messages
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-light-bg dark:bg-dark-bg"
    >
      <Header />
      <View className="flex-1 px-6 py-8">
        <Text className="text-3xl font-extrabold text-light-text dark:text-dark-text">Create account</Text>
        <Text className="mt-1 text-light-subtext dark:text-dark-subtext">Join Smart AI Buddy</Text>

        <View className="mt-8 gap-4">
          {/* Name */}
          <View>
            <Text className="text-sm text-light-subtext dark:text-dark-subtext mb-2">Name</Text>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (nameErr) setNameErr(null);
              }}
              placeholder="Your name"
              placeholderTextColor="#9CA3AF"
              className={`px-4 py-3 rounded-2xl bg-light-surface dark:bg-dark-surface text-light-text dark:text-dark-text border ${
                nameErr ? "border-danger" : "border-light-border dark:border-dark-border"
              }`}
              textContentType="name"
            />
            {!!nameErr && <Text className="mt-1 text-danger text-xs">{nameErr}</Text>}
          </View>

          {/* Email */}
          <View>
            <Text className="text-sm text-light-subtext dark:text-dark-subtext mb-2">Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (emailErr) setEmailErr(null);
              }}
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              className={`px-4 py-3 rounded-2xl bg-light-surface dark:bg-dark-surface text-light-text dark:text-dark-text border ${
                emailErr ? "border-danger" : "border-light-border dark:border-dark-border"
              }`}
              textContentType="emailAddress"
            />
            {!!emailErr && <Text className="mt-1 text-danger text-xs">{emailErr}</Text>}
          </View>

          {/* Password */}
          <View>
            <Text className="text-sm text-light-subtext dark:text-dark-subtext mb-2">Password</Text>
            <TextInput
              secureTextEntry
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (passwordErr) setPasswordErr(null);
              }}
              placeholder="At least 6 characters"
              placeholderTextColor="#9CA3AF"
              className={`px-4 py-3 rounded-2xl bg-light-surface dark:bg-dark-surface text-light-text dark:text-dark-text border ${
                passwordErr ? "border-danger" : "border-light-border dark:border-dark-border"
              }`}
              textContentType="newPassword"
            />
            {!!passwordErr && <Text className="mt-1 text-danger text-xs">{passwordErr}</Text>}
          </View>

          {/* Submit */}
          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            className="mt-2 h-12 rounded-2xl bg-primary items-center justify-center"
          >
            {submitting ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-white font-semibold">Create account</Text>
            )}
          </Pressable>

          {/* Form-level error banner (friendly messages + zod lists) */}
          <ErrorBanner error={formError} />

          {/* Link */}
          <Text className="text-sm text-light-subtext dark:text-dark-subtext mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-light-subtext dark:text-dark-subtext underline">
              Sign in
            </Link>
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
