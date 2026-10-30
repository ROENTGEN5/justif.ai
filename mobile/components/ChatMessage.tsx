import React, { useCallback, useRef } from "react";
import { View } from "react-native";
import ChatBubble, { ChatBubbleProps } from "./ChatBubble";
import SourceCard, { SourceCardHandle } from "./SourceCard";

/** Keep each answer's citation badges connected to its own saved evidence. */
function ChatMessage(props: ChatBubbleProps) {
  const sourceCard = useRef<SourceCardHandle>(null);
  const openCitation = useCallback((number: number) => {
    sourceCard.current?.openCitation(number);
  }, []);

  return (
    <View>
      <ChatBubble {...props} onCitationPress={openCitation} />
      {props.role === "assistant" && !props.animateTyping && !props.isStreaming &&
        props.sources && props.sources.length > 0 && (
          <SourceCard ref={sourceCard} sources={props.sources} answer={props.content} />
        )}
    </View>
  );
}

export default React.memo(ChatMessage);
