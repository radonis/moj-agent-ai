"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChatImagePayload,
  ChatMetadata,
  ChatMode,
  ChatModel,
  modeOptions,
  modelOptions,
  UserProfilePayload,
} from "../lib/agent";
import { ensureProfileWithLastSeen } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { getBrowserUserId } from "../lib/user";
import { AppNav } from "./app-nav";
import { SimpleMarkdown } from "./simple-markdown";

type AppMessage = UIMessage<ChatMetadata>;

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type StoredUserProfile = UserProfilePayload;

type VisionRemixResponse = {
  prompt?: string;
  image?: string;
  text?: string;
  error?: string;
};

type AgentChatProps = {
  api: string;
  title: string;
  subtitle: string;
  placeholder: string;
  starterQuestions: string[];
  emptyMessage: string;
  starterAction?: "send" | "fill";
  starterPlacement?: "header" | "input";
  visionMode?: boolean;
  reactMode?: boolean;
  travelMode?: boolean;
  toolCatalog?: Array<{
    label: string;
    description: string;
    active?: boolean;
  }>;
};

const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function getMessageText(message: AppMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildConversationTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Nowa rozmowa";
  }

  return normalized.length > 50 ? `${normalized.slice(0, 47)}...` : normalized;
}

function isStoredRole(role: AppMessage["role"]): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

function toChatMessage(row: StoredMessage): AppMessage {
  return {
    id: row.id,
    role: row.role,
    parts: [{ type: "text", text: row.content }],
  };
}

function extractName(text: string) {
  const match = text.match(
    /(?:mam na imie|nazywam sie|jestem)\s+([A-Za-zÀ-ÖØ-öø-ÿĄĆĘŁŃÓŚŹŻąćęłńóśźż-]{2,})/i,
  );
  return match?.[1] ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` : null;
}

function extractPreferences(text: string) {
  const preferences: Record<string, string> = {};
  const likesMatch = text.match(/lubie\s+(.+?)(?:[.!?]|$)/i);
  const cityMatch = text.match(/mieszkam w\s+(.+?)(?:[.!?]|$)/i);

  if (likesMatch?.[1]) preferences.zainteresowania = likesMatch[1].trim();
  if (cityMatch?.[1]) preferences.miasto = cityMatch[1].trim();

  return preferences;
}

function getAssistantMode(messages: AppMessage[], index: number): ChatMode {
  const current = messages[index];
  if (current.metadata?.mode) {
    return current.metadata.mode;
  }

  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message.role === "user" && message.metadata?.mode) {
      return message.metadata.mode;
    }
  }

  return "casual";
}

function getAssistantModel(messages: AppMessage[], index: number): ChatModel {
  const current = messages[index];
  if (current.metadata?.model) {
    return current.metadata.model;
  }

  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message.role === "user" && message.metadata?.model) {
      return message.metadata.model;
    }
  }

  return "flash";
}

function formatMode(mode: ChatMode) {
  return modeOptions.find((option) => option.mode === mode) ?? modeOptions[0];
}

function formatModel(model: ChatModel) {
  return modelOptions.find((option) => option.model === model) ?? modelOptions[0];
}

function splitKnowledgeSources(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sourceLines: string[] = [];
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:Zrodlo|Zrodla):\s+/i.test(trimmed)) {
      sourceLines.push(trimmed);
      continue;
    }

    bodyLines.push(line);
  }

  return {
    body: bodyLines.join("\n").trim(),
    sources: sourceLines,
  };
}

function validateImageFile(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Akceptowane formaty: PNG, JPG, JPEG, GIF, WEBP.";
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return "Max 4MB. Zrob screenshot fragmentu.";
  }

  return null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Nie udalo sie odczytac obrazu."));
    };
    reader.onerror = () => reject(new Error("Nie udalo sie odczytac obrazu."));
    reader.readAsDataURL(file);
  });
}

type ReactSectionKind = "thought" | "observation" | "result" | "other";

type ReactSection = {
  kind: ReactSectionKind;
  title: string;
  content: string;
};

type TravelSectionMap = Partial<
  Record<
    "summary" | "weather" | "budget" | "dates" | "sights" | "food" | "checklist" | "sources",
    string
  >
>;

type TravelCard = {
  title: string;
  emoji: string;
  content: string;
  accentClass: string;
};

function parseReactSections(content: string): ReactSection[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: ReactSection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  function pushSection() {
    if (!currentTitle && currentLines.length === 0) {
      return;
    }

    const normalizedTitle = currentTitle.trim();
    const normalizedContent = currentLines.join("\n").trim();
    const lowerTitle = normalizedTitle.toLowerCase();
    let kind: ReactSectionKind = "other";

    if (lowerTitle.includes("mysle") || lowerTitle.includes("myślę")) {
      kind = "thought";
    } else if (
      lowerTitle.includes("obserwuje") ||
      lowerTitle.includes("obserwuję")
    ) {
      kind = "observation";
    } else if (
      lowerTitle.includes("wynik koncowy") ||
      lowerTitle.includes("wynik końcowy")
    ) {
      kind = "result";
    }

    sections.push({
      kind,
      title: normalizedTitle || "Odpowiedz",
      content: normalizedContent,
    });
  }

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.*)$/);

    if (headingMatch) {
      pushSection();
      currentTitle = headingMatch[1];
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  pushSection();
  return sections.filter((section) => section.title || section.content);
}

function parseTravelPlanTitle(content: string) {
  const match = content.match(/^##\s+Plan podrozy:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "Twoj plan podrozy";
}

function normalizeTravelHeading(heading: string) {
  const normalized = heading
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("podsumowanie")) return "summary";
  if (normalized.includes("pogoda")) return "weather";
  if (normalized.includes("budzet")) return "budget";
  if (normalized.includes("wazne daty")) return "dates";
  if (normalized.includes("co zobaczyc")) return "sights";
  if (normalized.includes("smaki miasta")) return "food";
  if (normalized.includes("checklist")) return "checklist";
  if (normalized.includes("zrodla")) return "sources";
  return null;
}

function parseTravelSections(content: string): TravelSectionMap {
  const sections: TravelSectionMap = {};
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let currentKey: keyof TravelSectionMap | null = null;
  let currentLines: string[] = [];

  function flush() {
    if (!currentKey) {
      return;
    }

    const value = currentLines.join("\n").trim();
    if (value) {
      sections[currentKey] = value;
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.*)$/);
    if (headingMatch) {
      flush();
      currentLines = [];
      currentKey = normalizeTravelHeading(headingMatch[1]) as keyof TravelSectionMap | null;
      continue;
    }

    if (currentKey) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function buildTravelCards(sections: TravelSectionMap): TravelCard[] {
  const definitions: Array<{
    key: keyof TravelSectionMap;
    title: string;
    emoji: string;
    accentClass: string;
  }> = [
    { key: "weather", title: "Pogoda", emoji: "🌤️", accentClass: "travel-card-weather" },
    { key: "budget", title: "Waluta i budzet", emoji: "💱", accentClass: "travel-card-budget" },
    { key: "dates", title: "Swieta i daty", emoji: "🎉", accentClass: "travel-card-dates" },
    { key: "sights", title: "Atrakcje", emoji: "🗺️", accentClass: "travel-card-sights" },
  ];

  definitions.push({
    key: "food",
    title: "Smaki miasta",
    emoji: "🍽️",
    accentClass: "travel-card-food",
  });

  return definitions
    .filter((definition) => sections[definition.key])
    .map((definition) => ({
      title: definition.title,
      emoji: definition.emoji,
      accentClass: definition.accentClass,
      content: sections[definition.key] ?? "",
    }));
}

function getDiagnosticsTone(stepCount: number, maxSteps: number) {
  if (stepCount >= maxSteps) {
    return "danger";
  }

  if (stepCount >= Math.max(4, maxSteps - 1)) {
    return "warning";
  }

  return "safe";
}

export function AgentChat({
  api,
  title,
  subtitle,
  placeholder,
  starterQuestions,
  emptyMessage,
  starterAction = "send",
  starterPlacement = "header",
  visionMode = false,
  reactMode = false,
  travelMode = false,
  toolCatalog,
}: AgentChatProps) {
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");
  const transport = useMemo(() => new DefaultChatTransport<AppMessage>({ api }), [api]);
  const { messages, sendMessage, setMessages, status } = useChat<AppMessage>({
    transport,
  });
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("casual");
  const [model, setModel] = useState<ChatModel>("flash");
  const [exportCopied, setExportCopied] = useState(false);
  const [attachedImage, setAttachedImage] = useState<ChatImagePayload | null>(null);
  const [attachmentHint, setAttachmentHint] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixImage, setRemixImage] = useState<string | null>(null);
  const [remixComment, setRemixComment] = useState("");
  const [remixPrompt, setRemixPrompt] = useState("");
  const [remixError, setRemixError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyStatus, setHistoryStatus] = useState("");
  const [userProfile, setUserProfile] = useState<StoredUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const exportTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const conversationTitleRef = useRef("Nowa rozmowa");
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const pendingMessageIdsRef = useRef<Set<string>>(new Set());
  const persistQueueRef = useRef(Promise.resolve());
  const userProfileRef = useRef<StoredUserProfile | null>(null);
  const welcomeCreatedRef = useRef(false);
  const isLoading = status === "submitted" || status === "streaming";

  const stats = useMemo(() => {
    const totalChars = messages.reduce(
      (sum, message) => sum + getMessageText(message).length,
      0,
    );

    return {
      count: messages.length,
      tokens: Math.max(0, Math.round(totalChars / 4)),
    };
  }, [messages]);

  useEffect(() => {
    const shouldAutoScroll =
      messages.length > 0 || isLoading || Boolean(remixImage) || isRemixing;

    if (!shouldAutoScroll || !messagesRef.current) {
      return;
    }

    const container = messagesRef.current;
    const animationId = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: messages.length > 0 ? "smooth" : "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [messages.length, isLoading, remixImage, isRemixing]);

  useEffect(() => {
    return () => {
      if (exportTimerRef.current) {
        window.clearTimeout(exportTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadUserProfile() {
      if (!supabase) {
        setProfileStatus("Brak konfiguracji Supabase dla profilu.");
        setProfileLoading(false);
        return;
      }

      try {
        const profile = (await ensureProfileWithLastSeen(
          supabase,
          getBrowserUserId(),
        )) as StoredUserProfile;

        if (!isActive) return;

        const normalizedProfile = { ...profile, preferences: profile.preferences ?? {} };
        userProfileRef.current = normalizedProfile;
        setUserProfile(normalizedProfile);
        setProfileStatus("");
        setProfileLoading(false);
      } catch (error) {
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Nieznany blad profilu.";
        setProfileStatus(`Nie moge wczytac profilu: ${message}`);
        setProfileLoading(false);
      }
    }

    void loadUserProfile();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadLatestConversation() {
      if (!supabase) {
        setHistoryStatus("Brak konfiguracji Supabase.");
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      setHistoryStatus("Laduje historie rozmowy...");

      let conversationQuery = supabase
        .from("conversations")
        .select("id,title,updated_at");

      if (requestedConversationId) {
        conversationQuery = conversationQuery.eq("id", requestedConversationId);
      } else {
        conversationQuery = conversationQuery.order("updated_at", { ascending: false });
      }

      const { data: conversations, error: conversationError } = await conversationQuery.limit(1);

      if (!isActive) {
        return;
      }

      if (conversationError) {
        setHistoryStatus(`Nie moge wczytac rozmow: ${conversationError.message}`);
        setHistoryLoading(false);
        return;
      }

      const latestConversation = conversations?.[0];
      if (!latestConversation) {
        setHistoryStatus("");
        setHistoryLoading(false);
        return;
      }

      const { data: storedMessages, error: messageError } = await supabase
        .from("messages")
        .select("id,role,content")
        .eq("conversation_id", latestConversation.id)
        .order("created_at", { ascending: true });

      if (!isActive) {
        return;
      }

      if (messageError) {
        setHistoryStatus(`Nie moge wczytac wiadomosci: ${messageError.message}`);
        setHistoryLoading(false);
        return;
      }

      const loadedMessages = (storedMessages ?? [])
        .filter((message): message is StoredMessage => isStoredRole(message.role))
        .map(toChatMessage);

      conversationIdRef.current = latestConversation.id;
      conversationTitleRef.current = latestConversation.title ?? "Nowa rozmowa";
      persistedMessageIdsRef.current = new Set(loadedMessages.map((message) => message.id));
      pendingMessageIdsRef.current = new Set();
      setConversationId(latestConversation.id);
      setMessages(loadedMessages);
      setHistoryStatus("");
      setHistoryLoading(false);
    }

    void loadLatestConversation();

    return () => {
      isActive = false;
    };
  }, [requestedConversationId, setMessages]);

  useEffect(() => {
    if (historyLoading || profileLoading || welcomeCreatedRef.current || messages.length > 0) {
      return;
    }

    const profile = userProfileRef.current;
    if (!profile) return;

    welcomeCreatedRef.current = true;
    const greeting = profile.name
      ? `Czesc, ${profile.name}! Milo Cie znowu widziec. W czym moge Ci dzis pomoc?`
      : "Czesc! Jestem Marta, Twoja doradczyni podatkowa. Nie znamy sie jeszcze - jak masz na imie?";
    setMessages([
      {
        id: `welcome-${crypto.randomUUID()}`,
        role: "assistant",
        parts: [{ type: "text", text: greeting }],
      },
    ]);
  }, [historyLoading, messages.length, profileLoading, setMessages]);

  useEffect(() => {
    const client = supabase;

    if (historyLoading || !client) {
      return;
    }

    const messagesToPersist = messages.filter((message) => {
      if (!isStoredRole(message.role) || !getMessageText(message).trim()) {
        return false;
      }

      if (persistedMessageIdsRef.current.has(message.id)) {
        return false;
      }

      if (pendingMessageIdsRef.current.has(message.id)) {
        return false;
      }

      return true;
    });

    if (messagesToPersist.length === 0) {
      return;
    }

    for (const message of messagesToPersist) {
      pendingMessageIdsRef.current.add(message.id);
    }

    persistQueueRef.current = persistQueueRef.current
      .then(async () => {
        let activeConversationId = conversationIdRef.current;
        const firstUserMessage = messages.find((message) => message.role === "user");
        const title = buildConversationTitle(
          firstUserMessage ? getMessageText(firstUserMessage) : "",
        );

        if (!activeConversationId) {
          const { data: createdConversation, error: createError } = await client
            .from("conversations")
            .insert({ title })
            .select("id,title")
            .single();

          if (createError) {
            throw createError;
          }

          activeConversationId = createdConversation.id;
          conversationIdRef.current = activeConversationId;
          conversationTitleRef.current = createdConversation.title ?? title;
          setConversationId(activeConversationId);
        } else if (
          title !== "Nowa rozmowa" &&
          (conversationTitleRef.current === "Nowa rozmowa" || !conversationTitleRef.current)
        ) {
          const { error: titleError } = await client
            .from("conversations")
            .update({ title })
            .eq("id", activeConversationId);

          if (titleError) {
            throw titleError;
          }

          conversationTitleRef.current = title;
        }

        const rows = messagesToPersist.map((message) => ({
          conversation_id: activeConversationId,
          role: message.role,
          content: getMessageText(message),
        }));

        const { error: insertError } = await client.from("messages").insert(rows);
        if (insertError) {
          throw insertError;
        }

        const { error: updateError } = await client
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", activeConversationId);

        if (updateError) {
          throw updateError;
        }

        for (const message of messagesToPersist) {
          persistedMessageIdsRef.current.add(message.id);
          pendingMessageIdsRef.current.delete(message.id);
        }

        setHistoryStatus("");
      })
      .catch((error: unknown) => {
        for (const message of messagesToPersist) {
          pendingMessageIdsRef.current.delete(message.id);
        }

        const message =
          error instanceof Error ? error.message : "Nieznany blad zapisu historii.";
        setHistoryStatus(`Historia nie zapisala sie: ${message}`);
      });
  }, [historyLoading, messages]);

  async function attachFile(file: File, source: "paste" | "upload" | "drop") {
    const validationError = validateImageFile(file);
    if (validationError) {
      setAttachmentError(validationError);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachedImage({
        dataUrl,
        mediaType: file.type,
        filename: file.name || `${source}-image`,
      });
      setAttachmentError("");
      setAttachmentHint(
        source === "paste"
          ? "Screenshot - zadaj pytanie o ten obraz."
          : "Obraz dolaczony - zadaj pytanie o ten plik.",
      );
      setRemixImage(null);
      setRemixComment("");
      setRemixPrompt("");
      setRemixError("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udalo sie dolaczyc obrazu.";
      setAttachmentError(message);
    }
  }

  async function saveRememberedDetails(text: string) {
    const currentProfile = userProfileRef.current;
    if (!supabase || !currentProfile) return currentProfile;

    const name = extractName(text) ?? currentProfile.name;
    const preferences = {
      ...currentProfile.preferences,
      ...extractPreferences(text),
    };
    const profileChanged =
      name !== currentProfile.name ||
      JSON.stringify(preferences) !== JSON.stringify(currentProfile.preferences);

    if (!profileChanged) return currentProfile;

    const { error } = await supabase
      .from("user_profiles")
      .update({ name, preferences })
      .eq("id", currentProfile.id);

    if (error) {
      setProfileStatus(`Nie moge zapisac profilu: ${error.message}`);
      return currentProfile;
    }

    const updatedProfile = { ...currentProfile, name, preferences };
    userProfileRef.current = updatedProfile;
    setUserProfile(updatedProfile);
    setProfileStatus("");
    return updatedProfile;
  }

  async function submitText(text: string) {
    await sendMessage(
      { text, metadata: { mode, model } },
      {
        body: {
          mode,
          model,
          image: attachedImage ?? undefined,
          userProfile: userProfileRef.current ?? undefined,
        },
      },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isLoading || isRemixing || profileLoading) {
      return;
    }

    setInput("");
    await submitText(trimmed);
  }

  async function handleSubmitAsNewConversation() {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isRemixing || profileLoading) {
      return;
    }

    await handleNewConversation();
    setInput("");
    await submitText(trimmed);
  }

  async function runVisionRemix(instruction: string) {
    if (!attachedImage) {
      setAttachmentError("Najpierw dodaj obraz do analizy.");
      return;
    }

    setIsRemixing(true);
    setRemixError("");
    setRemixImage(null);
    setRemixComment("");
    setRemixPrompt("");

    try {
      const response = await fetch("/api/vision-remix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: attachedImage,
          instruction,
        }),
      });

      const data = (await response.json()) as VisionRemixResponse;
      if (!response.ok || !data.image) {
        throw new Error(data.error || "Nie udalo sie wygenerowac podobnego obrazu.");
      }

      setRemixImage(data.image);
      setRemixComment(data.text || "Nowa wersja obrazu gotowa.");
      setRemixPrompt(data.prompt || "");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nieznany blad podczas generowania nowej wersji.";
      setRemixError(message);
    } finally {
      setIsRemixing(false);
    }
  }

  async function handleStarterQuestion(question: string) {
    if (isLoading || isRemixing) {
      return;
    }

    if (visionMode && question.toLowerCase().includes("wygeneruj podobny")) {
      await runVisionRemix(question);
      return;
    }

    if (starterAction === "fill") {
      setInput(question);
      return;
    }

    setInput("");
    await submitText(question);
  }

  async function handleNewConversation() {
    setMessages([]);
    setInput("");
    setExportCopied(false);
    persistedMessageIdsRef.current = new Set();
    pendingMessageIdsRef.current = new Set();
    conversationIdRef.current = null;
    conversationTitleRef.current = "Nowa rozmowa";
    setConversationId(null);
    setHistoryStatus("");

    if (!supabase) {
      setHistoryStatus("Brak konfiguracji Supabase.");
      return;
    }

    const { data: createdConversation, error } = await supabase
      .from("conversations")
      .insert({ title: "Nowa rozmowa" })
      .select("id,title")
      .single();

    if (error) {
      setHistoryStatus(`Nie moge utworzyc rozmowy: ${error.message}`);
      return;
    }

    conversationIdRef.current = createdConversation.id;
    conversationTitleRef.current = createdConversation.title ?? "Nowa rozmowa";
    setConversationId(createdConversation.id);
  }

  async function handleExportConversation() {
    const transcript = messages
      .map((message) => {
        const speaker = message.role === "user" ? "User" : "Agent";
        return `${speaker}: ${getMessageText(message)}`;
      })
      .join("\n");

    await navigator.clipboard.writeText(transcript);
    setExportCopied(true);

    if (exportTimerRef.current) {
      window.clearTimeout(exportTimerRef.current);
    }

    exportTimerRef.current = window.setTimeout(() => {
      setExportCopied(false);
    }, 1800);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));

    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    void attachFile(file, "paste");
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void attachFile(file, "upload");
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    void attachFile(file, "drop");
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function removeAttachment() {
    setAttachedImage(null);
    setAttachmentHint("");
    setAttachmentError("");
    setRemixImage(null);
    setRemixComment("");
    setRemixPrompt("");
    setRemixError("");
  }

  function handleImageDownload(imageUrl: string, filename: string) {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename;
    link.click();
  }

  const showVisionDropzone = visionMode && !attachedImage;
  const showInputStarters = starterPlacement === "input" && (!visionMode || attachedImage);

  return (
    <main className={`page app-page ${reactMode ? "page-scroll" : ""}`}>
      <AppNav />
      <section
        className={`chat-shell ${visionMode ? "vision-shell" : ""} ${reactMode ? "react-shell" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <header className="chat-header">
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {toolCatalog?.length ? (
            <div className="tool-catalog">
              {toolCatalog.map((toolItem) => (
                <div key={toolItem.label} className="tool-catalog-item">
                  <strong>{toolItem.label}</strong>
                  <span>{toolItem.active === false ? "wylaczone" : "aktywne"}</span>
                  <p>{toolItem.description}</p>
                </div>
              ))}
            </div>
          ) : null}
          {starterPlacement === "header" ? (
            <div className="starter-grid">
              {starterQuestions.map((question) => (
                <button
                  key={question}
                  className="starter-button"
                  type="button"
                  onClick={() => void handleStarterQuestion(question)}
                  disabled={isLoading || isRemixing}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {showVisionDropzone ? (
          <section
            className="vision-dropzone"
            onClick={openFilePicker}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <p>📸 Ctrl+V - wklej screenshot</p>
            <p>📁 Kliknij - wybierz plik</p>
            <p>🖱️ Przeciagnij - upusc obraz</p>
          </section>
        ) : null}

        <div className="chat-tools">
          <details className="context-panel">
            <summary>Kontekst rozmowy</summary>
            <div className="context-content">
              <p>Wiadomosci: {stats.count} | ~Tokeny: {stats.tokens}</p>
              <p>
                Historia:{" "}
                {historyLoading
                  ? "ladowanie..."
                  : conversationId
                    ? "podlaczona do Supabase"
                    : "gotowa na nowa rozmowe"}
              </p>
              <div className="context-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleExportConversation}
                  disabled={messages.length === 0}
                >
                  Eksportuj rozmowe
                </button>
                {exportCopied ? <span className="copy-feedback">Skopiowano!</span> : null}
              </div>
            </div>
          </details>

          <div className="switcher-group">
            <div className="switcher-label">Tryb odpowiedzi</div>
            <div className="mode-switcher" aria-label="Tryb rozmowy">
              {modeOptions.map((option) => (
                <button
                  key={option.mode}
                  className={`mode-button ${mode === option.mode ? "active" : ""} mode-${option.mode}`}
                  type="button"
                  onClick={() => setMode(option.mode)}
                >
                  <span>{option.emoji}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="switcher-group">
            <div className="switcher-label">Model AI</div>
            <div className="model-switcher" aria-label="Model AI">
              {modelOptions.map((option) => (
                <button
                  key={option.model}
                  className={`model-button ${model === option.model ? "active" : ""}`}
                  type="button"
                  onClick={() => setModel(option.model)}
                >
                  <span>{option.emoji}</span>
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={messagesRef} className="messages" aria-live="polite">
          {attachedImage ? (
            <div className="attachment-card">
              <div className="attachment-preview">
                <Image
                  src={attachedImage.dataUrl}
                  alt="Zalaczony obraz"
                  width={640}
                  height={360}
                  className="attachment-image"
                  unoptimized
                />
              </div>
              <div className="attachment-meta">
                <strong>📎 Obraz dolaczony</strong>
                <p>{attachmentHint || "Screenshot - zadaj pytanie o ten obraz."}</p>
              </div>
              <button
                className="attachment-remove"
                type="button"
                onClick={removeAttachment}
                aria-label="Usun obraz"
              >
                ×
              </button>
            </div>
          ) : null}

          {attachmentError ? (
            <div className="image-feedback image-feedback-error">{attachmentError}</div>
          ) : null}

          {remixImage || remixError || isRemixing ? (
            <div className="vision-remix-panel">
              <h2>Podobny obraz</h2>
              {isRemixing ? <p>Tworze nowa wersje obrazu...</p> : null}
              {remixError ? (
                <div className="image-feedback image-feedback-error">{remixError}</div>
              ) : null}
              {remixImage && attachedImage ? (
                <div className="vision-remix-grid">
                  <div className="vision-remix-card">
                    <span>Oryginal</span>
                    <Image
                      src={attachedImage.dataUrl}
                      alt="Oryginalny obraz"
                      width={720}
                      height={720}
                      className="vision-remix-image"
                      unoptimized
                    />
                  </div>
                  <div className="vision-remix-card">
                    <span>Nowa wersja</span>
                    <Image
                      src={remixImage}
                      alt="Nowa wersja obrazu"
                      width={720}
                      height={720}
                      className="vision-remix-image"
                      unoptimized
                    />
                  </div>
                </div>
              ) : null}
              {remixPrompt ? (
                <div className="vision-remix-prompt">
                  <strong>Prompt:</strong>
                  <p>{remixPrompt}</p>
                </div>
              ) : null}
              {remixComment ? <p className="generated-image-comment">{remixComment}</p> : null}
            </div>
          ) : null}

          {historyStatus ? (
            <div className="image-feedback">{historyStatus}</div>
          ) : null}

          {profileStatus ? <div className="image-feedback">{profileStatus}</div> : null}

          {historyLoading ? (
            <div className="empty-state">
              <p>Laduje zapisana rozmowe...</p>
            </div>
          ) : null}

          {!historyLoading && messages.length === 0 ? (
            <div className="empty-state">
              <p>{emptyMessage}</p>
            </div>
          ) : null}

          {messages.map((message, index) => {
            const text = getMessageText(message);

            if (!text) {
              return null;
            }

            const assistantMode =
              message.role === "assistant"
                ? formatMode(getAssistantMode(messages, index))
                : null;
            const assistantModel =
              message.role === "assistant"
                ? formatModel(getAssistantModel(messages, index))
                : null;
            const toolTimeline =
              message.role === "assistant" ? message.metadata?.toolTimeline : undefined;
            const generatedImages =
              message.role === "assistant" ? message.metadata?.generatedImages : undefined;
            const durationMs =
              message.role === "assistant" ? message.metadata?.durationMs : undefined;
            const toolCount =
              message.role === "assistant" ? message.metadata?.toolCount : undefined;
            const reactSections =
              message.role === "assistant" && reactMode ? parseReactSections(text) : [];
            const reactStepCount =
              message.role === "assistant" ? message.metadata?.reactStepCount : undefined;
            const reactMaxSteps =
              message.role === "assistant" ? message.metadata?.reactMaxSteps : undefined;
            const errorCount =
              message.role === "assistant" ? message.metadata?.errorCount ?? 0 : 0;
            const statusLabel =
              message.role === "assistant" ? message.metadata?.statusLabel : undefined;
            const toolUsageSummary =
              message.role === "assistant" ? message.metadata?.toolUsageSummary : undefined;
            const toolErrors =
              message.role === "assistant" ? message.metadata?.toolErrors : undefined;
            const travelPlanTitle = travelMode ? parseTravelPlanTitle(text) : "";
            const travelSections = travelMode ? parseTravelSections(text) : {};
            const travelCards = travelMode ? buildTravelCards(travelSections) : [];
            const diagnosticsTone =
              typeof reactStepCount === "number" && typeof reactMaxSteps === "number"
                ? getDiagnosticsTone(reactStepCount, reactMaxSteps)
                : "safe";

            return (
              <div
                key={message.id}
                className={`message-row ${message.role === "user" ? "user" : "assistant"}`}
              >
                <article className="message-bubble">
                  {assistantMode || assistantModel ? (
                    <div className="badge-row">
                      {assistantMode ? (
                        <span className={`mode-badge mode-badge-${assistantMode.mode}`}>
                          {assistantMode.emoji} {assistantMode.mode}
                        </span>
                      ) : null}
                      {assistantModel ? (
                        <span className={`model-badge model-badge-${assistantModel.model}`}>
                          {assistantModel.emoji} {assistantModel.label.toLowerCase()}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {message.role === "assistant" ? (
                    reactMode ? (
                      <div className="react-answer">
                        {typeof reactStepCount === "number" && typeof reactMaxSteps === "number" ? (
                          <div className="react-progress-card">
                            <div className="react-progress-label">
                              Krok {Math.min(reactStepCount, reactMaxSteps)} z {reactMaxSteps}
                            </div>
                            <div className="react-progress-track" aria-hidden="true">
                              <span
                                className="react-progress-fill"
                                style={{
                                  background:
                                    diagnosticsTone === "danger"
                                      ? "linear-gradient(90deg, #ef4444, #f97316)"
                                      : diagnosticsTone === "warning"
                                        ? "linear-gradient(90deg, #facc15, #fb923c)"
                                        : "linear-gradient(90deg, #22c55e, #38bdf8)",
                                  width: `${Math.min(
                                    100,
                                    (Math.min(reactStepCount, reactMaxSteps) / reactMaxSteps) *
                                      100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                        {typeof reactStepCount === "number" && typeof reactMaxSteps === "number" ? (
                          <section
                            className={`diagnostics-panel diagnostics-panel-${diagnosticsTone}`}
                          >
                            <div className="diagnostics-title">🛡️ Diagnostyka</div>
                            <div className="diagnostics-grid">
                              <div className="diagnostics-item">
                                <span>Kroki</span>
                                <strong>
                                  {Math.min(reactStepCount, reactMaxSteps)}/{reactMaxSteps}
                                </strong>
                              </div>
                              <div className="diagnostics-item">
                                <span>Narzedzia</span>
                                <strong>{toolUsageSummary || "brak"}</strong>
                              </div>
                              <div className="diagnostics-item">
                                <span>Bledy</span>
                                <strong>{errorCount}</strong>
                              </div>
                              <div className="diagnostics-item">
                                <span>Czas</span>
                                <strong>
                                  {typeof durationMs === "number"
                                    ? `${(durationMs / 1000).toFixed(1)}s`
                                    : "-"}
                                </strong>
                              </div>
                            </div>
                            <div className="diagnostics-status">{statusLabel || "W trakcie..."}</div>
                            {toolErrors?.length ? (
                              <div className="diagnostics-alerts">
                                {toolErrors.map((toolError) => (
                                  <div key={`${message.id}-${toolError}`} className="diagnostics-alert">
                                    {toolError}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </section>
                        ) : null}
                        {reactSections.length ? (
                          <div className="react-sections">
                            {reactSections.map((section, sectionIndex) => (
                              <section
                                key={`${message.id}-react-${sectionIndex}`}
                                className={`react-section react-section-${section.kind}`}
                              >
                                <div className="react-section-title">{section.title}</div>
                                {section.content ? (
                                  <SimpleMarkdown content={section.content} />
                                ) : (
                                  <p>Brak tresci w tym kroku.</p>
                                )}
                              </section>
                            ))}
                          </div>
                        ) : (
                          <SimpleMarkdown content={text} />
                        )}
                        {travelMode ? (
                          <div className="travel-report">
                            <div className="travel-report-header">
                              <div className="travel-report-kicker">Plan wyjazdu</div>
                              <h2>{travelPlanTitle}</h2>
                            </div>
                            {travelSections.summary ? (
                              <section className="travel-summary-card">
                                <div className="travel-card-label">📋 Podsumowanie</div>
                                <SimpleMarkdown content={travelSections.summary} />
                              </section>
                            ) : null}
                            {travelCards.length ? (
                              <div className="travel-card-grid">
                                {travelCards.map((card) => (
                                  <section
                                    key={`${message.id}-${card.title}`}
                                    className={`travel-card ${card.accentClass}`}
                                  >
                                    <div className="travel-card-label">
                                      {card.emoji} {card.title}
                                    </div>
                                    <SimpleMarkdown content={card.content} />
                                  </section>
                                ))}
                              </div>
                            ) : null}
                            {travelSections.checklist ? (
                              <section className="travel-checklist-card">
                                <div className="travel-card-label">✅ Checklist przed wyjazdem</div>
                                <SimpleMarkdown content={travelSections.checklist} />
                              </section>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <SimpleMarkdown content={splitKnowledgeSources(text).body || text} />
                        {splitKnowledgeSources(text).sources.length ? (
                          <div className="knowledge-source-list">
                            {splitKnowledgeSources(text).sources.map((sourceLine) => (
                              <div key={`${message.id}-${sourceLine}`} className="knowledge-source">
                                <span className="knowledge-source-icon">DOC</span>
                                <span>{sourceLine}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )
                  ) : (
                    <p>{text}</p>
                  )}
                  {toolTimeline?.length ? (
                    <div className={`tool-timeline ${reactMode ? "tool-timeline-react" : ""}`}>
                      <div className="tool-timeline-title">
                        {reactMode ? "⚡ Narzedzia" : "Agent wykonuje zadanie..."}
                      </div>
                      {toolTimeline.map((toolStep, toolIndex) => (
                        <div key={`${message.id}-tool-${toolIndex}`} className="tool-timeline-item">
                          <div className="tool-timeline-line">
                            <span className="tool-timeline-index">{toolIndex + 1}</span>
                            <span className="tool-timeline-name">{toolStep.toolName}</span>
                            {toolStep.input ? (
                              <code className="tool-timeline-input">{toolStep.input}</code>
                            ) : null}
                          </div>
                          <p>{toolStep.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {generatedImages?.length ? (
                    <div className="inline-generated-images">
                      {generatedImages.map((generatedImage, imageIndex) => (
                        <div
                          key={`${message.id}-generated-image-${imageIndex}`}
                          className="inline-generated-image-card"
                        >
                          <Image
                            src={generatedImage.image}
                            alt={generatedImage.title}
                            width={1024}
                            height={1024}
                            className="inline-generated-image"
                            unoptimized
                          />
                          {generatedImage.prompt ? (
                            <p className="inline-generated-image-prompt">{generatedImage.prompt}</p>
                          ) : null}
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              handleImageDownload(
                                generatedImage.image,
                                `ai-generated-${imageIndex + 1}.png`,
                              )
                            }
                          >
                            💾 Pobierz
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {typeof toolCount === "number" || typeof durationMs === "number" ? (
                    <div className="message-stats">
                      Uzyto {toolCount ?? 0} narzedzi |{" "}
                      {typeof durationMs === "number"
                        ? `${(durationMs / 1000).toFixed(1)}s`
                        : "-"}{" "}
                      | Model: {message.metadata?.resolvedModel || assistantModel?.label || "flash"}
                    </div>
                  ) : null}
                </article>
              </div>
            );
          })}

          {isLoading ? (
            <div className="message-row assistant">
              <article className="message-bubble thinking">
                <div className="badge-row">
                  <span className={`mode-badge mode-badge-${mode}`}>
                    {formatMode(mode).emoji} {mode}
                  </span>
                  <span className={`model-badge model-badge-${model}`}>
                    {formatModel(model).emoji} {formatModel(model).label.toLowerCase()}
                  </span>
                </div>
                <p>{reactMode ? "Agent planuje kolejne kroki..." : "Mysle..."}</p>
              </article>
            </div>
          ) : null}

          {isDragOver ? <div className="drop-overlay">Upusc obraz</div> : null}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            className="hidden-file-input"
            onChange={handleFileInputChange}
          />
          <button
            className="upload-button"
            type="button"
            onClick={openFilePicker}
            aria-label="Dolacz obraz"
          >
            📎
          </button>
          <textarea
            className="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            autoComplete="off"
            rows={4}
          />
          <div className="chat-actions">
            <button
              className="chat-submit chat-submit-secondary"
              type="button"
              onClick={() => void handleSubmitAsNewConversation()}
              disabled={isLoading || isRemixing || profileLoading}
            >
              Wyslij nowa rozmowa
            </button>
            <button
              className="chat-submit"
              type="submit"
              disabled={isLoading || isRemixing || profileLoading}
            >
              Wyslij w biezacym watku
            </button>
          </div>
        </form>
        {showInputStarters ? (
          <div className="starter-under-input">
            <div className="starter-grid starter-grid-inline">
              {starterQuestions.map((question) => (
                <button
                  key={question}
                  className="starter-button"
                  type="button"
                  onClick={() => void handleStarterQuestion(question)}
                  disabled={isLoading || isRemixing}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
