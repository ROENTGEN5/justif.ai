import { cacheOwner, readCache, writeCache, clearConversationCaches } from "./conversationCache";
/**
 * API Client for Justif.ai Backend
 * Handles all communication with the RAG-powered FastAPI backend.
 * Supports both development and production API URLs.
 */

import { supabase } from "./supabase";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

const PRODUCTION_API_URL = "https://justif-ai.onrender.com";

const DEV_API_URL = Platform.select({
  android: "http://10.0.2.2:8000",
  ios: "http://localhost:8000",
  default: "http://localhost:8000",
});

// Use env variable if set, otherwise use production on standalone builds or dev defaults
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? DEV_API_URL : PRODUCTION_API_URL);


/**
 * Helper to fetch with an abort timeout and automatic retry on 503 or timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000,
  retries: number = 1,
  retryDelayMs: number = 2000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (response.status === 503 && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("Request timed out.");
}

/**
 * Silent non-blocking health check ping to wake up cold-start Render servers on app launch.
 */
export async function warmUpBackend(): Promise<void> {
  try {
    await fetchWithTimeout(
      `${API_BASE_URL}/api/health`,
      {
        method: "GET",
        headers: { "Bypass-Tunnel-Reminder": "true" },
      },
      12000,
      0
    );
  } catch {
    // Silent warm-up; ignore failures
  }
}

// ─── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  rating?: "like" | "unlike";
  sources?: LawSource[];
}

export interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface LawSource {
  short_title: string;
  full_title: string;
  law_type: string;
  date: string;
  url: string;
  label: string;
  citation_number?: number;
  excerpts?: string[];
  section?: string;
  support_status?: string;
  legal_status?: string;
}

export interface ChatResponse {
  chat_id: string;
  message_id: string;
  response: string;
  title: string;
  sources: LawSource[];
}

export interface RAGStatus {
  is_ready: boolean;
  total_chunks: number;
  law_types: string[];
}

// ─── Helper: Get Auth Headers ──────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You are not signed in. Please sign in again.");
  }

  return {
    "Content-Type": "application/json",
    "Bypass-Tunnel-Reminder": "true",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ─── Offline Cache Helpers ──────────────────────────────────

export async function getCachedChats(): Promise<Chat[]> { return readCache<Chat>("chats"); }
export async function cacheChats(chats: Chat[], owner?: string): Promise<void> { await writeCache("chats", chats.slice(0,50), owner); }
export async function getCachedChatMessages(chatId: string): Promise<ChatMessage[]> { return readCache<ChatMessage>(`messages:${chatId}`); }
export async function cacheChatMessages(chatId: string, messages: ChatMessage[], owner?: string): Promise<void> { await writeCache(`messages:${chatId}`, messages.slice(-100), owner); }

export interface StreamMessageCallbacks {
  onThinkingStage?: (stage: string) => void;
  onToken?: (accumulatedText: string, delta: string) => void;
}

/**
 * Send a message to the RAG-powered AI assistant.
 * Optionally filters by law types.
 */
export async function sendMessage(
  message: string,
  chatId?: string,
  lawTypes?: string[],
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/chat`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        chat_id: chatId || null,
        message,
        law_types: lawTypes && lawTypes.length > 0 ? lawTypes : null,
      }),
    },
    30000,
    0
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to send message.");
  }

  return response.json();
}

/** Stream once: an ambiguous failure must never trigger a second generation. */
export async function streamMessage(
  message: string,
  chatId?: string,
  lawTypes?: string[],
  callbacks?: StreamMessageCallbacks,
  signal?: AbortSignal,
  requestId?: string,
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();
  return new Promise<ChatResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let seenLength = 0;
    let lineBuffer = "";
    let accumulatedText = "";
    let publishedLength = 0;
    let finalPayload: ChatResponse | null = null;
    let streamError: string | null = null;
    let settled = false;
    let publishTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (publishTimer) clearTimeout(publishTimer);
      publishTimer = undefined;
      if (accumulatedText.length > publishedLength) {
        const delta = accumulatedText.slice(publishedLength);
        publishedLength = accumulatedText.length;
        callbacks?.onToken?.(accumulatedText, delta);
      }
    };
    const cleanup = () => {
      if (publishTimer) clearTimeout(publishTimer);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (detail: string) => {
      if (settled) return;
      flush();
      settled = true;
      cleanup();
      reject(Object.assign(new Error(detail), { partialAnswer: accumulatedText }));
    };
    const abort = () => {
      fail("Request canceled. Use Retry to recover this request.");
      xhr.abort();
    };
    const processChunk = (chunk: string) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === "thinking") {
            callbacks?.onThinkingStage?.(event.stage);
          } else if (event.type === "token" && typeof event.text === "string") {
            accumulatedText += event.text;
            if (!publishedLength) flush();
            else if (!publishTimer) publishTimer = setTimeout(flush, 75);
          } else if (event.type === "done") {
            if (typeof event.response !== "string" || !event.response.trim() || !event.chat_id ||
                (accumulatedText && accumulatedText !== event.response)) {
              streamError = "Incomplete or inconsistent answer. Use Retry to recover this request.";
            } else {
              finalPayload = {
                chat_id: event.chat_id, message_id: event.message_id || "",
                response: event.response, title: event.title || "New Conversation",
                sources: event.sources || [],
              };
            }
          } else if (event.type === "error") {
            streamError = event.detail || "Failed to process message.";
          }
        } catch {
          streamError = "Invalid stream response. Use Retry to recover this request.";
        }
      }
    };
    xhr.open("POST", API_BASE_URL + "/api/chat/stream", true);
    xhr.timeout = 120000;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.onprogress = () => {
      if (settled) return;
      const text = xhr.responseText || "";
      processChunk(text.slice(seenLength));
      seenLength = text.length;
    };
    xhr.onload = () => {
      if (settled) return;
      const text = xhr.responseText || "";
      processChunk(text.slice(seenLength));
      if (lineBuffer.trim()) processChunk("\n");
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = "Request failed (" + xhr.status + "). Please try again.";
        try { detail = JSON.parse(text).detail || detail; } catch {}
        fail(detail);
      } else if (streamError || !finalPayload) {
        fail(streamError || "Connection ended before completion. Use Retry to recover this request.");
      } else {
        flush();
        settled = true;
        cleanup();
        resolve(finalPayload);
      }
    };
    xhr.onerror = () => fail("Connection interrupted. Use Retry to recover this request.");
    xhr.ontimeout = () => fail("Request timed out. Use Retry to recover this request.");
    xhr.onabort = () => fail("Request canceled.");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    xhr.send(JSON.stringify({ request_id: requestId, chat_id: chatId || null, message,
      law_types: lawTypes?.length ? lawTypes : null }));
  });
}

/**
 * Get all chats for the current user, with automatic local cache persistence and offline fallback.
 */
export async function getChats(): Promise<Chat[]> {
  const owner = await cacheOwner();
  try {
    const headers = await getAuthHeaders();

    const response = await fetchWithTimeout(`${API_BASE_URL}/api/chats`, {
      method: "GET",
      headers,
    }, 10000);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error(error.detail || "Failed to fetch conversations."), { status: response.status });
    }

    const data = await response.json();
    const chats: Chat[] = data.chats || [];
    if (owner !== await cacheOwner()) throw new Error("Account changed.");
    await cacheChats(chats, owner);
    return chats;
  } catch (err) {
    if (owner !== await cacheOwner() || (err as any)?.status === 401 || (err as any)?.status === 403 || (err as any)?.status === 404) throw err;
    const cached = await getCachedChats();
    if (cached.length > 0) {
      return cached;
    }
    throw err;
  }
}

/**
 * Get all messages for a specific chat, with local cache persistence and offline fallback.
 */
export async function getChatMessages(
  chatId: string
): Promise<ChatMessage[]> {
  const owner = await cacheOwner();
  try {
    const headers = await getAuthHeaders();

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/chats/${chatId}/messages`,
      {
        method: "GET",
        headers,
      },
      10000
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error(error.detail || "Failed to fetch messages."), { status: response.status });
    }

    const data = await response.json();
    const messages: ChatMessage[] = data.messages || [];
    if (owner !== await cacheOwner()) throw new Error("Account changed.");
    await cacheChatMessages(chatId, messages, owner);
    return messages;
  } catch (err) {
    if (owner !== await cacheOwner() || (err as any)?.status === 401 || (err as any)?.status === 403 || (err as any)?.status === 404) throw err;
    const cached = await getCachedChatMessages(chatId);
    if (cached.length > 0) {
      return cached;
    }
    throw err;
  }
}

/**
 * Create a new empty chat session.
 */
export async function createChat(title?: string): Promise<Chat> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: title || "New Conversation" }),
  });

  if (!response.ok) {
    throw new Error("Failed to create conversation.");
  }

  return response.json();
}

/**
 * Permanently delete the user's account and all associated data.
 * Complies with RA 10173 (Data Privacy Act of 2012) right to erasure.
 */
export async function deleteUserAccount(): Promise<void> {
  await clearConversationCaches();
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/account`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to delete account.");
  }
}

/**
 * Delete a chat and all its messages.
 */
export async function deleteChat(chatId: string): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete conversation.");
  }

  await clearConversationCaches();

}

/**
 * Delete all chats for the current user.
 */
export async function deleteAllChats(): Promise<void> {
  await clearConversationCaches();
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/chats`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete all conversations.");
  }

  await clearConversationCaches();
}

/**
 * Get available law types for filtering.
 */
export async function getLawTypes(): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/rag/law-types`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
    }, 5000);

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch {
    return [];
  }
}

/**
 * Get RAG system status.
 */
export async function getRAGStatus(): Promise<RAGStatus> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/rag/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
    }, 5000);

    if (!response.ok) {
      return { is_ready: false, total_chunks: 0, law_types: [] };
    }

    return response.json();
  } catch {
    return { is_ready: false, total_chunks: 0, law_types: [] };
  }
}

// ─── File Upload Types ──────────────────────────────────

export interface FileAttachment {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export interface FileAnalysisResponse {
  reading_warnings: string[];
  page_count: number;
  chat_id: string;
  message_id: string;
  response: string;
  title: string;
  sources: LawSource[];
  is_legal_document: boolean;
}

// ─── File Analysis ──────────────────────────────────────

/**
 * Upload and analyze a file (image or PDF) for legal content.
 * Uses multipart/form-data to send the file to the backend.
 */
export async function analyzeFile(
  file: FileAttachment,
  chatId?: string,
  userPrompt?: string,
  requestId?: string,
): Promise<FileAnalysisResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You are not signed in. Please sign in again.");
  }

  const uploadUrl = `${API_BASE_URL}/api/chat/analyze-file`;

  const parameters: Record<string, string> = {};
  if (requestId) parameters.request_id = requestId;
  if (chatId) parameters.chat_id = chatId;
  if (userPrompt) parameters.user_prompt = userPrompt;

  let tempCopiedUri: string | null = null;
  try {
    // Normalize content:// URI if needed before uploading
    let workingUri = file.uri;
    const cacheDir = FileSystem.cacheDirectory || "";
    if (!workingUri.startsWith("file://") && cacheDir) {
      const ext = file.mimeType === "application/pdf" ? "pdf" : "jpg";
      const tempPath = `${cacheDir}upload_${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: workingUri, to: tempPath });
      workingUri = tempPath;
      tempCopiedUri = tempPath;
    }

    const response = await FileSystem.uploadAsync(uploadUrl, workingUri, {
      fieldName: "file",
      mimeType: file.mimeType,
      httpMethod: "POST",
      uploadType: (FileSystem.FileSystemUploadType?.MULTIPART ?? 1) as any,
      parameters,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Bypass-Tunnel-Reminder": "true",
      },
    });

    if (response.status !== 200 && response.status !== 201) {
      let errorMsg = "Failed to analyze file.";
      try {
        const errorBody = JSON.parse(response.body);
        errorMsg = errorBody.detail || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    return JSON.parse(response.body);
  } catch (error: any) {
    console.error("File upload error:", error);
    throw new Error(error.message || "Failed to analyze file due to network error.");
  } finally {
    if (tempCopiedUri) {
      FileSystem.deleteAsync(tempCopiedUri, { idempotent: true }).catch(() => {});
    }
  }
}

/**
 * Rate an assistant's message.
 */
export async function rateMessage(messageId: string, rating: "like" | "unlike"): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/rate`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ rating }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to submit rating.");
  }
}

// ─── User Profile ──────────────────────────────────────────

export interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export async function getProfile(): Promise<UserProfile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  return data as UserProfile;
}

export async function updateProfile(fullName: string, avatarUrl: string | null): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("No user session");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, avatar_url: avatarUrl })
    .eq("id", session.user.id);

  if (error) {
    throw new Error("Failed to update profile: " + error.message);
  }
}

export async function uploadAvatar(uri: string, preloadedBase64?: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("No user session");

  let workingUri = uri;
  let tempCopiedUri: string | null = null;
  const cacheDir = FileSystem.cacheDirectory || "";

  try {
    // Normalize content:// or non-file:// URIs into cache directory
    if (!workingUri.startsWith("file://") && cacheDir && !preloadedBase64) {
      const tempPath = `${cacheDir}avatar_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: workingUri, to: tempPath });
      workingUri = tempPath;
      tempCopiedUri = tempPath;
    }

    let base64 = preloadedBase64;
    if (!base64) {
      const fileInfo = await FileSystem.getInfoAsync(workingUri);
      if (!fileInfo.exists) {
        throw new Error("Selected image file could not be accessed on device storage.");
      }
      base64 = await FileSystem.readAsStringAsync(workingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    const fileName = `${session.user.id}-${Date.now()}.jpg`;

    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(fileName, decode(base64), {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      throw new Error("Failed to upload avatar: " + error.message);
    }

    if (!data || !data.path) {
      throw new Error("Upload failed to return a valid path.");
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } finally {
    if (tempCopiedUri) {
      FileSystem.deleteAsync(tempCopiedUri, { idempotent: true }).catch(() => {});
    }
  }
}

export async function reportCitation(messageId: string, reason: string): Promise<void> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/messages/${messageId}/reports`, {
    method: "POST", headers: await getAuthHeaders(), body: JSON.stringify({ reason }),
  }, 15000, 0);
  if (!response.ok) throw new Error("Could not save report. Please try again.");
}
export function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
