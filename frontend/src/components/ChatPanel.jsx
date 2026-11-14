import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// Live group chat over the backend's Socket.IO "chat-message" events
// (room "global"). Before this fix chat was local-only: a message only
// ever appeared on the sender's own screen.
const socket = io(import.meta.env.VITE_API_URL || "http://localhost:3001");

export default function ChatPanel() {
  const [messages, setMessages] = useState([
    { text: "Welcome to chat — everyone in the global room sees messages here." }
  ]);
  const [input, setInput] = useState("");
  const [live, setLive] = useState(false);
  const username =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;
  const boxRef = useRef(null);

  useEffect(() => {
    socket.emit("join-room", "global");

    const onChat = (data) => {
      setMessages((prev) => [
        ...prev,
        { text: data.message, from: data.from, at: data.timestamp }
      ]);
    };
    const onConnect = () => setLive(true);
    const onDisconnect = () => setLive(false);

    socket.on("chat-message", onChat);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) setLive(true);

    return () => {
      socket.off("chat-message", onChat);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const text = username ? `${username}: ${input.trim()}` : input.trim();
    // Show it immediately, and send it to everyone in the room.
    setMessages((prev) => [...prev, { text, mine: true }]);
    socket.emit("chat-message", { room: "global", message: text });
    setInput("");
  };

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h2>Messages</h2>
      <p style={{ marginTop: 6, color: live ? "#7CFC9A" : "#ff6b6b", fontSize: 14 }}>
        {live
          ? "● Live — messages go to everyone in the global room"
          : "● Not connected to live chat — check the backend, messages stay on this screen"}
      </p>

      <div
        ref={boxRef}
        style={{
          background: "#1e1f22",
          padding: 20,
          borderRadius: 12,
          height: 400,
          overflowY: "auto",
          marginBottom: 20,
          marginTop: 16
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {m.text}
          </div>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
        placeholder="Type a message…"
        style={{
          width: "80%",
          padding: 12,
          borderRadius: 8,
          border: "none",
          marginRight: 10,
          background: "#2b2d31",
          color: "white"
        }}
      />
      <button
        onClick={send}
        style={{
          padding: "12px 20px",
          borderRadius: 8,
          background: "#00eaff",
          border: "none",
          cursor: "pointer"
        }}
      >
        Send
      </button>
    </div>
  );
}
