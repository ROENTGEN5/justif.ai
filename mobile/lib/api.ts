/**
 * API Client for Justif.ai Backend
 * Handles all communication with the RAG-powered FastAPI backend.
 * Supports both development and production API URLs.
 */

import { supabase } from "./supabase";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

// ─── API URL Configuration ─────────────────────────────────

const DEV_API_URL = Platform.select({
  android: "http://10.0.2.2:8000",
  ios: "http://localhost:8000",
  default: "http://localhost:8000",
});

// Use env variable if set (for physical device testing), otherwise fall back to dev defaults
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEV_API_URL;

// ─── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  rating?: "like" | "unlike";
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

// ─── API Functions ──────────────────────────────────────────

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

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chat_id: chatId || null,
      message,
      law_types: lawTypes && lawTypes.length > 0 ? lawTypes : null,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to send message.");
  }

  return response.json();
}

/**
 * Get all chats for the current user.
 */
export async function getChats(): Promise<Chat[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/chats`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch conversations.");
  }

  const data = await response.json();
  return data.chats;
}

/**
 * Get all messages for a specific chat.
 */
export async function getChatMessages(
  chatId: string
): Promise<ChatMessage[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${API_BASE_URL}/api/chats/${chatId}/messages`,
    {
      method: "GET",
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch messages.");
  }

  const data = await response.json();
  return data.messages;
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
}

/**
 * Delete all chats for the current user.
 */
export async function deleteAllChats(): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/chats`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete all conversations.");
  }
}

/**
 * Get available law types for filtering.
 */
export async function getLawTypes(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/rag/law-types`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
}

/**
 * Get RAG system status.
 */
export async function getRAGStatus(): Promise<RAGStatus> {
  const response = await fetch(`${API_BASE_URL}/api/rag/status`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
  });

  if (!response.ok) {
    return { is_ready: false, total_chunks: 0, law_types: [] };
  }

  return response.json();
}

// ─── File Upload Types ──────────────────────────────────

export interface FileAttachment {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export interface FileAnalysisResponse {
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
): Promise<FileAnalysisResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You are not signed in. Please sign in again.");
  }

  // Use Expo FileSystem upload for better reliability on physical devices
  const uploadUrl = `${API_BASE_URL}/api/chat/analyze-file`;

  const parameters: Record<string, string> = {};
  if (chatId) parameters.chat_id = chatId;
  if (userPrompt) parameters.user_prompt = userPrompt;

  try {
    const response = await FileSystem.uploadAsync(uploadUrl, file.uri, {
      fieldName: 'file',
      httpMethod: 'POST',
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
      } catch (e) { }
      throw new Error(errorMsg);
    }

    return JSON.parse(response.body);
  } catch (error: any) {
    console.error("File upload error:", error);
    throw new Error(error.message || "Failed to analyze file due to network error.");
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

export async function uploadAvatar(uri: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("No user session");

  const ext = uri.split('.').pop() || 'jpg';
  const fileName = `${session.user.id}-${Date.now()}.${ext}`;

  // Read the file as base64 using expo-file-system
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(fileName, decode(base64), {
      contentType: `image/${ext}`,
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
    .from('avatars')
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}
