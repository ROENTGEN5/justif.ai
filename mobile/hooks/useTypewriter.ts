/**
 * useTypewriter Hook
 * Progressive word-by-word typing animation engine for AI assistant responses.
 * Supports both batch responses and live streaming updates, with instant skip capability.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as Haptics from "expo-haptics";

export interface UseTypewriterOptions {
  /** Whether to animate typing (false for historical messages) */
  enabled?: boolean;
  /** Number of word/whitespace tokens revealed per tick */
  wordsPerTick?: number;
  /** Milliseconds between ticks */
  intervalMs?: number;
  /** Callback fired periodically while typing (for auto-scrolling) */
  onTick?: () => void;
  /** Callback fired when typing completes */
  onComplete?: () => void;
}

export interface UseTypewriterResult {
  displayedText: string;
  isTyping: boolean;
  completeImmediately: () => void;
}

export function useTypewriter(
  fullText: string,
  options: UseTypewriterOptions = {}
): UseTypewriterResult {
  const {
    enabled = false,
    wordsPerTick = 3,
    intervalMs = 32,
    onTick,
    onComplete,
  } = options;

  const [displayedText, setDisplayedText] = useState<string>(() =>
    enabled ? "" : fullText
  );
  const [isTyping, setIsTyping] = useState<boolean>(() =>
    Boolean(enabled && fullText.length > 0)
  );

  const charIndexRef = useRef<number>(enabled ? 0 : fullText.length);
  const fullTextRef = useRef<string>(fullText);
  const completedRef = useRef<boolean>(!enabled);
  const lastScrollTickRef = useRef<number>(0);
  const onTickRef = useRef(onTick);
  const onCompleteRef = useRef(onComplete);

  onTickRef.current = onTick;
  onCompleteRef.current = onComplete;
  fullTextRef.current = fullText;

  const completeImmediately = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    charIndexRef.current = fullTextRef.current.length;
    setDisplayedText(fullTextRef.current);
    setIsTyping(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onCompleteRef.current?.();
  }, []);

  // Sync non-animated messages or wake up the typing loop when new streaming tokens arrive
  useEffect(() => {
    if (!enabled) {
      completedRef.current = true;
      charIndexRef.current = fullText.length;
      setDisplayedText(fullText);
      setIsTyping(false);
      return;
    }

    if (charIndexRef.current < fullText.length) {
      completedRef.current = false;
      setIsTyping((prev) => (prev ? prev : true));
    } else if (fullText.length > 0 && charIndexRef.current >= fullText.length) {
      setDisplayedText(fullText);
      setIsTyping(false);
    }
  }, [enabled, fullText]);

  // Progressive typing loop — remains stable while streaming tokens arrive
  useEffect(() => {
    if (!enabled || !isTyping) return;

    const timer = setInterval(() => {
      const target = fullTextRef.current;
      const currentIdx = charIndexRef.current;

      if (currentIdx >= target.length) {
        clearInterval(timer);
        if (!completedRef.current && target.length > 0) {
          completedRef.current = true;
          setIsTyping(false);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onCompleteRef.current?.();
        }
        return;
      }

      // Advance by `wordsPerTick` words (preserving whitespace)
      let nextIdx = currentIdx;
      let wordsFound = 0;
      const remaining = target.slice(currentIdx);
      const tokenRegex = /\S+\s*|\s+/g;
      let match: RegExpExecArray | null;

      while ((match = tokenRegex.exec(remaining)) !== null) {
        nextIdx += match[0].length;
        wordsFound += 1;
        if (wordsFound >= wordsPerTick) {
          break;
        }
      }

      if (nextIdx <= currentIdx) {
        nextIdx = Math.min(target.length, currentIdx + 8);
      }

      charIndexRef.current = nextIdx;
      setDisplayedText(target.slice(0, nextIdx));

      // Throttle auto-scroll callback to ~120ms so FlatList stays 60fps on low-end phones
      const now = Date.now();
      if (now - lastScrollTickRef.current >= 120) {
        lastScrollTickRef.current = now;
        onTickRef.current?.();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled, isTyping, wordsPerTick, intervalMs]);

  return {
    displayedText: enabled ? displayedText : fullText,
    isTyping,
    completeImmediately,
  };
}

export default useTypewriter;
