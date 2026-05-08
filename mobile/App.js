import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { io } from "socket.io-client";

const SERVER_URL = "https://chat-app-g2ao.onrender.com";
const STORAGE_KEY = "talksy_name";

export default function App() {
  const socket = useMemo(() => io(SERVER_URL, { transports: ["websocket"] }), []);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [username, setUsername] = useState("");
  const [draftName, setDraftName] = useState("");
  const [receiver, setReceiver] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");
  const [connected, setConnected] = useState(false);
  const typingTimer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((savedName) => {
      if (savedName) setDraftName(savedName);
    });

    AudioModule.requestRecordingPermissionsAsync().then((status) => {
      if (!status.granted) {
        Alert.alert("Microphone blocked", "Voice messages need microphone permission.");
      }
    });

    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });
  }, []);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("privateMessage", (msg) => {
      setTypingUser("");
      setMessages((current) => [
        ...current,
        normalizeMessage({ ...msg, receiver: username }),
      ]);
    });

    socket.on("messageHistory", (history) => {
      setMessages(history.map(normalizeMessage));
    });

    socket.on("typing", ({ sender }) => {
      if (sender !== username) setTypingUser(sender);
    });

    socket.on("stopTyping", ({ sender }) => {
      if (sender !== username) setTypingUser("");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket, username]);

  function joinChat() {
    const cleanName = draftName.trim();
    if (cleanName.length < 2) return;

    setUsername(cleanName);
    AsyncStorage.setItem(STORAGE_KEY, cleanName);
    socket.emit("register", cleanName);
    setMessages([
      {
        id: `meta-${Date.now()}`,
        type: "meta",
        message: `Logged in as ${cleanName}`,
        timestamp: Date.now(),
      },
    ]);
  }

  function loadHistory(nextReceiver) {
    setReceiver(nextReceiver);
    const cleanReceiver = nextReceiver.trim();
    if (username && cleanReceiver) {
      socket.emit("getMessages", { sender: username, receiver: cleanReceiver });
    }
  }

  function emitTyping() {
    const cleanReceiver = receiver.trim();
    if (!username || !cleanReceiver) return;

    socket.emit("typing", { sender: username, receiver: cleanReceiver });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("stopTyping", { sender: username, receiver: cleanReceiver });
    }, 1200);
  }

  function sendText() {
    const cleanReceiver = receiver.trim();
    const cleanMessage = message.trim();
    if (!cleanReceiver || !cleanMessage) return;

    socket.emit("privateMessage", {
      sender: username,
      receiver: cleanReceiver,
      message: cleanMessage,
    });

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        sender: username,
        receiver: cleanReceiver,
        message: cleanMessage,
        type: "text",
        timestamp: Date.now(),
      },
    ]);

    socket.emit("stopTyping", { sender: username, receiver: cleanReceiver });
    setMessage("");
  }

  async function toggleRecording() {
    const cleanReceiver = receiver.trim();
    if (!cleanReceiver) return;

    if (recorderState.isRecording) {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const audio = `data:audio/m4a;base64,${base64}`;

      socket.emit("privateMessage", {
        sender: username,
        receiver: cleanReceiver,
        type: "voice",
        audio,
        mimeType: "audio/m4a",
      });

      setMessages((current) => [
        ...current,
        {
          id: `voice-${Date.now()}`,
          sender: username,
          receiver: cleanReceiver,
          type: "voice",
          audio,
          timestamp: Date.now(),
        },
      ]);

      socket.emit("stopTyping", { sender: username, receiver: cleanReceiver });
      return;
    }

    await recorder.prepareToRecordAsync();
    recorder.record();
    socket.emit("typing", { sender: username, receiver: cleanReceiver });
  }

  if (!username) {
    return (
      <SafeAreaView style={styles.screen}>
        <AnimatedBackground />
        <View style={styles.loginCard}>
          <Text style={styles.logo}>Talksy</Text>
          <Text style={styles.subtitle}>Private one-to-one. No sign-up. Vibe in.</Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            onSubmitEditing={joinChat}
            placeholder="Enter your name"
            placeholderTextColor="#85a6b7"
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={joinChat}>
            <Text style={styles.primaryButtonText}>Join Chat</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <AnimatedBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.chatShell}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logoSmall}>Talksy</Text>
            <Text style={styles.presence}>{connected ? "Online" : "Connecting..."}</Text>
          </View>
          <Text style={styles.userPill}>{username}</Text>
        </View>

        <TextInput
          value={receiver}
          onChangeText={loadHistory}
          placeholder="Receiver name"
          placeholderTextColor="#85a6b7"
          style={styles.receiverInput}
        />

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => <MessageBubble item={item} mine={item.sender === username} />}
        />

        {!!typingUser && (
          <Text style={styles.typingText}>{typingUser} is typing...</Text>
        )}

        <View style={styles.composer}>
          <TextInput
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              emitTyping();
            }}
            onSubmitEditing={sendText}
            placeholder="Type a message"
            placeholderTextColor="#85a6b7"
            style={styles.messageInput}
          />
          <Pressable style={styles.recordButton} onPress={toggleRecording}>
            <Text style={styles.recordButtonText}>
              {recorderState.isRecording ? "Stop" : "Rec"}
            </Text>
          </Pressable>
          <Pressable style={styles.sendButton} onPress={sendText}>
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function normalizeMessage(msg) {
  return {
    id: msg._id || `${msg.sender || "system"}-${msg.timestamp || Date.now()}-${Math.random()}`,
    sender: msg.sender,
    receiver: msg.receiver,
    message: msg.message || "",
    type: msg.type || "text",
    audio: msg.audio,
    timestamp: msg.timestamp || Date.now(),
  };
}

function MessageBubble({ item, mine }) {
  if (item.type === "meta") {
    return <Text style={styles.metaMessage}>{item.message}</Text>;
  }

  return (
    <View style={[styles.messageBubble, mine && styles.mineBubble]}>
      <Text style={styles.senderText}>{mine ? "You" : item.sender}</Text>
      {item.type === "voice" ? (
        <VoicePlayer source={item.audio} />
      ) : (
        <Text style={styles.messageText}>{item.message}</Text>
      )}
      <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
    </View>
  );
}

function VoicePlayer({ source }) {
  const player = useAudioPlayer(source ? { uri: source } : null);

  return (
    <Pressable
      style={styles.voiceButton}
      onPress={() => {
        player.seekTo(0);
        player.play();
      }}
    >
      <Text style={styles.voiceButtonText}>Play voice message</Text>
    </Pressable>
  );
}

function AnimatedBackground() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 9000,
        useNativeDriver: true,
      })
    ).start();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]} />
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />
    </View>
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  let hrs = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const ampm = hrs >= 12 ? "pm" : "am";
  hrs = hrs % 12 || 12;
  return `${hrs}:${mins} ${ampm}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  glow: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    opacity: 0.55,
  },
  glowLeft: {
    left: -120,
    top: 70,
    backgroundColor: "#06b6d4",
  },
  glowRight: {
    right: -140,
    bottom: 90,
    backgroundColor: "#8b5cf6",
  },
  orbit: {
    position: "absolute",
    top: "18%",
    left: "12%",
    width: "76%",
    height: "52%",
    borderWidth: 1,
    borderColor: "rgba(103,232,249,.24)",
    borderRadius: 80,
  },
  loginCard: {
    margin: 22,
    marginTop: "45%",
    padding: 24,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.14)",
    backgroundColor: "rgba(15,24,39,.78)",
  },
  logo: {
    color: "#e6f6ff",
    fontSize: 36,
    fontWeight: "900",
  },
  logoSmall: {
    color: "#e6f6ff",
    fontSize: 24,
    fontWeight: "900",
  },
  subtitle: {
    color: "#9fb6c6",
    marginTop: 8,
    marginBottom: 18,
  },
  input: {
    color: "#e6f6ff",
    borderWidth: 1,
    borderColor: "rgba(103,232,249,.45)",
    backgroundColor: "rgba(7,13,24,.74)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: "#22d3ee",
    borderRadius: 999,
    padding: 15,
  },
  primaryButtonText: {
    color: "#001018",
    textAlign: "center",
    fontWeight: "900",
  },
  chatShell: {
    flex: 1,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  presence: {
    color: "#67e8f9",
    marginTop: 2,
  },
  userPill: {
    color: "#001018",
    backgroundColor: "#67e8f9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    fontWeight: "800",
  },
  receiverInput: {
    color: "#e6f6ff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.14)",
    backgroundColor: "rgba(7,13,24,.72)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  messageList: {
    gap: 10,
    paddingVertical: 10,
  },
  messageBubble: {
    maxWidth: "82%",
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,24,39,.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.12)",
    borderRadius: 16,
    padding: 12,
  },
  mineBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(6,182,212,.23)",
    borderColor: "rgba(34,211,238,.36)",
  },
  senderText: {
    color: "#67e8f9",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  messageText: {
    color: "#e6f6ff",
    fontSize: 16,
  },
  timeText: {
    color: "#f0abfc",
    fontSize: 11,
    marginTop: 8,
    alignSelf: "flex-end",
  },
  metaMessage: {
    alignSelf: "center",
    color: "#9fb6c6",
    fontSize: 12,
  },
  typingText: {
    color: "#9fb6c6",
    marginLeft: 6,
    marginBottom: 6,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  messageInput: {
    flex: 1,
    color: "#e6f6ff",
    backgroundColor: "rgba(7,13,24,.82)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.12)",
  },
  recordButton: {
    backgroundColor: "rgba(15,24,39,.92)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.16)",
  },
  recordButtonText: {
    color: "#e6f6ff",
    fontWeight: "900",
  },
  sendButton: {
    backgroundColor: "#22d3ee",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButtonText: {
    color: "#001018",
    fontWeight: "900",
  },
  voiceButton: {
    backgroundColor: "rgba(7,13,24,.58)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(103,232,249,.28)",
  },
  voiceButtonText: {
    color: "#e6f6ff",
    fontWeight: "800",
  },
});
