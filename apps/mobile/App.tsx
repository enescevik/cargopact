import { useState } from "react";
import { Button, FlatList, SafeAreaView, Text, TextInput, View } from "react-native";
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from "amazon-cognito-identity-js";
import type { ChatResponse } from "@cargopact/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const pool = new CognitoUserPool({
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? "us-east-1_placeholder",
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? "placeholder",
});

function signIn(email: string, password: string): Promise<string> {
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) =>
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: (s) => resolve(s.getIdToken().getJwtToken()),
      onFailure: reject,
    }),
  );
}

interface Msg { role: "user" | "agent"; text: string }

export default function App() {
  const [token, setToken] = useState<string>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [err, setErr] = useState("");

  if (!token) {
    return (
      <SafeAreaView style={{ padding: 24, gap: 8 }}>
        <Text style={{ fontSize: 24 }}>CargoPact</Text>
        <TextInput placeholder="E-posta" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <TextInput placeholder="Parola" secureTextEntry value={password} onChangeText={setPassword} />
        <Button title="Giriş yap" onPress={() => signIn(email, password).then(setToken).catch((e) => setErr(String(e.message ?? e)))} />
        {!!err && <Text style={{ color: "crimson" }}>{err}</Text>}
      </SafeAreaView>
    );
  }

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const r = data as ChatResponse;
      setSessionId(r.sessionId);
      setMsgs((m) => [...m, { role: "agent", text: r.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "agent", text: `Hata: ${(e as Error).message}` }]);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={msgs}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ alignSelf: item.role === "user" ? "flex-end" : "flex-start", backgroundColor: item.role === "user" ? "#dbeafe" : "#f3f4f6", padding: 10, borderRadius: 8, marginVertical: 4 }}>
            <Text>{item.text}</Text>
          </View>
        )}
      />
      <TextInput placeholder="Mesajınız" value={input} onChangeText={setInput} onSubmitEditing={send} />
      <Button title="Gönder" onPress={send} />
    </SafeAreaView>
  );
}
