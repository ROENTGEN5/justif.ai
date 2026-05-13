/**
 * API Client for Justif.ai Backend
 * Handles all communication with the RAG-powered FastAPI backend.
 * Supports both development and production API URLs.
 */

import { supabase } from "./supabase";
import { Platform } from "react-native";

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
