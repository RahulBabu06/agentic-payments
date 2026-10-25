"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, errorText } from "./shared";
import type { Cart } from "@/lib/catalog";
import { cancelHaptics, hapticsEnabled, pulseHaptics, setHaptics } from "@/lib/haptics";

type Props = {
  scope: "order" | "checkout";
  invoiceId?: string;
  current?: Cart;
  onOrder?: (order: Cart) => void;
  requestId?: string;
  pendingOrderId?: string;
  onResult?: (result: any) => void;
  disabled?: boolean;
};

export default function VoiceAgent(props: Props) {
  return <ConversationProvider><VoiceSession {...props} /></ConversationProvider>;
}

function VoiceSession(props: Props) {
  const [configured, setConfigured] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [canVibrate, setCanVibrate] = useState(false);
  const [vibration, setVibration] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const generation = useRef(0);
  const active = useRef(false);
  const conversation = useConversation({
    onMessage: event => setMessages(history => [...history, { role: event.role, text: event.message }].slice(-12)),
    onConnect: () => { setStarting(false); conversation.setMuted(false); },
    onDisconnect: () => { active.current = false; generation.current++; setStarting(false); },
    onError: () => {
      active.current = false;
      generation.current++;
      setStarting(false);
      setError("Voice connection failed. Check microphone permission and the ElevenLabs agent configuration, or use text chat.");
      conversation.endSession();
    },
  });
  const { endSession, status } = conversation;
  useEffect(() => {
    setCanVibrate(typeof navigator.vibrate === "function");
    setVibration(hapticsEnabled());
    return cancelHaptics;
  }, []);
  useEffect(() => {
    if (status === "connected" && !conversation.isMuted) pulseHaptics(conversation.isSpeaking ? 12 : 20);
  }, [status, conversation.isMuted, conversation.isSpeaking]);
  function stop() {
    active.current = false;
    generation.current++;
    setStarting(false);
    cancelHaptics();
    endSession();
  }
  useEffect(() => {
    let mounted = true;
    api("config").then(config => { if (mounted) setConfigured(config.voiceConfigured && config.geminiConfigured); })
      .catch(() => { if (mounted) setError("Unable to check voice configuration. Reload to try again."); });
    return () => { mounted = false; active.current = false; generation.current++; endSession(); };
  }, [endSession]);
  useEffect(() => {
    if (props.disabled) {
      active.current = false;
      generation.current++;
      setStarting(false);
      endSession();
    }
  }, [props.disabled, endSession]);
  useEffect(() => {
    if (status !== "connected") return;
    const timer = setTimeout(() => {
      active.current = false;
      generation.current++;
      endSession();
      setError("The five-minute demo voice session has ended. You can start another session.");
    }, 300000);
    return () => clearTimeout(timer);
  }, [status, endSession]);

  async function start() {
    if (active.current || props.disabled) return;
    const run = ++generation.current;
    active.current = true;
    pulseHaptics();
    setStarting(true); setError(""); setMessages([]);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Voice needs HTTPS or localhost and a browser with microphone support.");
      const context = props.scope === "order" ? { scope: "order" } : { scope: "checkout", invoiceId: props.invoiceId };
      const { signedUrl } = await api("voice/session", "POST", context);
      if (!active.current || generation.current !== run) return;
      conversation.startSession({
        signedUrl,
        connectionType: "websocket",
        clientTools: {
          customer_request: async parameters => {
            if (!active.current || generation.current !== run) return "Session ended. No order was changed.";
            try {
              const message = z.string().trim().min(1).max(2000).parse(parameters.message);
              const before = JSON.stringify(latest.current.current);
              const result = await api("voice/turn", "POST", { context, message, current: latest.current.current, requestId: latest.current.requestId, pendingOrderId: latest.current.pendingOrderId });
              if (!active.current || generation.current !== run || latest.current.disabled) return "Session ended. No order was changed.";
              if (before !== JSON.stringify(latest.current.current)) return "The customer changed the on-screen order. Ask them to repeat their request.";
              if (latest.current.onResult) latest.current.onResult(result);
              else if (result.order) latest.current.onOrder?.(result.order);
              return result.say;
            } catch (err) {
              const text = errorText(err);
              if (active.current && generation.current === run) setError(text);
              return `The request could not be completed: ${text}. No payment was made. The customer can use the form.`;
            }
          },
        },
      });
    } catch (err) {
      if (generation.current === run) { stop(); setError(errorText(err)); }
    }
  }
  const connected = status === "connected";
  const engaged = starting || status === "connecting" || connected;
  const phase = error ? "error" : starting || status === "connecting" ? "connecting" : connected ? conversation.isMuted ? "muted" : conversation.isSpeaking ? "speaking" : "listening" : "idle";
  return <section className="card voice-agent" aria-label="Customer voice assistant" data-phase={phase}>
    <p className="eyebrow">ELEVENLABS × GEMINI</p>
    <div className="voice-presence" aria-hidden="true"><div className="voice-orbit" /><div className="voice-orbit second" /><div className="voice-orb"><div className="voice-wave">{[0, 1, 2, 3, 4].map(i => <span key={i} style={{ animationDelay: `${i * -0.14}s` }} />)}</div></div></div>
    <h3>Your voice. Your pace.</h3>
    <p className="small muted">{props.scope === "order" ? "Ask for a menu or tell me your order. A confirmation will appear when you’re ready." : "Ask about this invoice, test funds, or payment status."} Voice cannot approve or send payments.</p>
    {props.scope === "order" && <p className="voice-example">“Two black coffees from Maple Coffee.”<br />Then: “Place my order.”</p>}
    {!configured && <p className="notice small">Voice needs ElevenLabs and Gemini server configuration. Text chat and manual checkout remain available.</p>}
    <p className="small muted" id={`voice-consent-${props.scope}`}>By tapping Start voice conversation, you agree to share audio with ElevenLabs and order/invoice requests with Gemini. Provider retention settings apply.</p>
    <div className="voice-controls">
      {!engaged ? <button className="button dark" aria-describedby={`voice-consent-${props.scope}`} disabled={!configured || props.disabled} onClick={start}>Start voice conversation</button> : <button className="button secondary" onClick={stop}>Stop voice</button>}
      {connected && <button className="button secondary" onClick={() => conversation.setMuted(!conversation.isMuted)}>{conversation.isMuted ? "Unmute microphone" : "Mute microphone"}</button>}
    </div>
    <p className="small muted" aria-live="polite">{starting || status === "connecting" ? "Connecting voice…" : connected ? conversation.isMuted ? "Microphone muted" : conversation.isSpeaking ? "Assistant speaking…" : "Listening…" : "Microphone off · sessions limited to five minutes"}</p>
    {canVibrate ? <label className="checkbox voice-haptics"><input type="checkbox" checked={vibration} onChange={e => { const enabled = e.target.checked; setVibration(enabled); setHaptics(enabled); if (enabled) pulseHaptics(); }} /> Gentle vibration <span className="small muted">where supported</span></label> : <p className="small muted">Haptics unavailable in this browser. Voice works without vibration.</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {messages.length > 0 && <div className="voice-transcript" aria-label="Voice transcript">{messages.map((message, i) => <p key={i}><strong>{message.role === "user" ? "You" : "Assistant"}:</strong> {message.text}</p>)}</div>}
  </section>;
}
