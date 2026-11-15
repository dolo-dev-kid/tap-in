import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import axiosInstance from "../api/axios";

// Live group chat over the backend's Socket.IO "chat-message" events
// (room "global"). Before this fix chat was local-only: a message only
// ever appeared on the sender's own screen.
// The global room is UNCHANGED by the private-chat work below — same
// socket, same events, same behaviour.
const socket = io(import.meta.env.VITE_API_URL || "http://localhost:3001");

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`
  };
}

function dmTitle(room, myUsername) {
  if (room.type === "group") return room.name || "Group chat";
  const others = (room.members || []).filter((m) => m !== myUsername);
  return others.length ? others.join(", ") : room.displayName || "Private chat";
}

export default function ChatPanel() {
  // --- Global room (unchanged) ---------------------------------------
  const [messages, setMessages] = useState([
    { text: "Welcome to chat — everyone in the global room sees messages here." }
  ]);
  const [input, setInput] = useState("");
  const [live, setLive] = useState(false);
  const username =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_username")
      : null;
  const myId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;
  const boxRef = useRef(null);

  // --- Private chats ---------------------------------------------------
  const [tab, setTab] = useState("global"); // "global" | "private" | "groups"
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [privMessages, setPrivMessages] = useState([]);
  const [privInput, setPrivInput] = useState("");
  const [privError, setPrivError] = useState("");
  const [dmUsername, setDmUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [presence, setPresence] = useState({}); // userId -> { online, lastSeenAt, username }
  const privBoxRef = useRef(null);
  const privSocketRef = useRef(null);
  const activeRoomRef = useRef(null);
  activeRoomRef.current = activeRoom;

  const loggedIn = Boolean(
    typeof localStorage !== "undefined" && localStorage.getItem("token")
  );

  const loadRooms = async () => {
    if (!loggedIn) return;
    try {
      const res = await axiosInstance.get("/chat/rooms", { headers: authHeaders() });
      setRooms(res.data.rooms || []);
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not load your chats — log in first.");
    }
  };

  const loadPresence = async () => {
    if (!loggedIn) return;
    try {
      const res = await axiosInstance.get("/chat/presence", { headers: authHeaders() });
      const map = {};
      for (const p of res.data.presence || []) map[p.userId] = p;
      setPresence(map);
    } catch (err) { /* presence is a bonus — chats still work without it */ }
  };

  const openRoom = async (room) => {
    setActiveRoom(room);
    setPrivMessages([]);
    setPrivError("");
    try {
      const res = await axiosInstance.get(`/chat/rooms/${room.id}/messages`, {
        headers: authHeaders()
      });
      setPrivMessages(res.data.messages || []);
      if (privSocketRef.current) {
        privSocketRef.current.emit("join-chat-room", room.id);
      }
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not open that chat.");
    }
  };

  // Global room listeners (unchanged).
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

  // Private-chat socket: JWT-authenticated, so the backend knows who
  // you are and only lets you into rooms you're a member of.
  useEffect(() => {
    if (!loggedIn) return undefined;
    const privSocket = io(API, {
      auth: { token: localStorage.getItem("token") || "" }
    });
    privSocketRef.current = privSocket;

    privSocket.on("private-chat-message", (msg) => {
      const active = activeRoomRef.current;
      if (active && String(msg.room) === String(active.id)) {
        setPrivMessages((prev) =>
          prev.some((m) => String(m.id) === String(msg.id)) ? prev : [...prev, msg]
        );
      }
      loadRooms();
    });
    privSocket.on("presence", (p) => {
      setPresence((prev) => ({ ...prev, [p.userId]: p }));
    });
    privSocket.on("chat-error", (data) => {
      if (data?.error) setPrivError(data.error);
    });
    loadRooms();
    loadPresence();
    return () => {
      privSocket.disconnect();
      privSocketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    privBoxRef.current?.scrollTo({ top: privBoxRef.current.scrollHeight });
  }, [privMessages]);

  const send = () => {
    if (!input.trim()) return;
    const text = username ? `${username}: ${input.trim()}` : input.trim();
    // Show it immediately, and send it to everyone in the room.
    setMessages((prev) => [...prev, { text, mine: true }]);
    socket.emit("chat-message", { room: "global", message: text, username });
    setInput("");
  };

  const sendPrivate = async () => {
    if (!activeRoom || !privInput.trim()) return;
    const text = privInput.trim();
    setPrivInput("");
    try {
      const res = await axiosInstance.post(
        `/chat/rooms/${activeRoom.id}/messages`,
        { text },
        { headers: authHeaders() }
      );
      // The socket broadcast also echoes this back — dedupe by id.
      setPrivMessages((prev) =>
        prev.some((m) => String(m.id) === String(res.data.message.id))
          ? prev
          : [...prev, res.data.message]
      );
      loadRooms();
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not send that message.");
    }
  };

  const createDm = async () => {
    const name = dmUsername.trim();
    if (!name) return;
    setPrivError("");
    try {
      const res = await axiosInstance.post(
        "/chat/dm",
        { username: name },
        { headers: authHeaders() }
      );
      setDmUsername("");
      await loadRooms();
      openRoom(res.data.room);
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not start that chat.");
    }
  };

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      setPrivError("Give the group a name first.");
      return;
    }
    const members = groupMembers.split(",").map((m) => m.trim()).filter(Boolean);
    setPrivError("");
    try {
      const res = await axiosInstance.post(
        "/chat/groups",
        { name, members },
        { headers: authHeaders() }
      );
      setGroupName("");
      setGroupMembers("");
      await loadRooms();
      openRoom(res.data.room);
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not create that group.");
    }
  };

  const searchUsers = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    try {
      const res = await axiosInstance.get(`/users?search=${encodeURIComponent(q)}`, {
        headers: authHeaders()
      });
      setSearchResults(res.data.users || []);
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not search members.");
    }
  };

  const addMember = async () => {
    if (!activeRoom || activeRoom.type !== "group") return;
    const name = addUsername.trim();
    if (!name) return;
    try {
      const res = await axiosInstance.post(
        `/chat/rooms/${activeRoom.id}/members`,
        { username: name },
        { headers: authHeaders() }
      );
      setAddUsername("");
      setActiveRoom(res.data.room);
      loadRooms();
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not add that member.");
    }
  };

  const leaveGroup = async () => {
    if (!activeRoom || activeRoom.type !== "group" || !myId) return;
    if (!window.confirm(`Leave ${activeRoom.name || "this group"}?`)) return;
    try {
      await axiosInstance.delete(`/chat/rooms/${activeRoom.id}/members/${myId}`, {
        headers: authHeaders()
      });
      setActiveRoom(null);
      setPrivMessages([]);
      loadRooms();
    } catch (err) {
      setPrivError(err.response?.data?.error || "Could not leave that group.");
    }
  };

  const onlineForRoom = (room) => {
    if (room.type !== "dm") return null;
    const otherId = (room.memberIds || []).find((id) => String(id) !== String(myId));
    return otherId ? presence[String(otherId)] : null;
  };

  const dms = rooms.filter((r) => r.type === "dm");
  const groups = rooms.filter((r) => r.type === "group");

  return (
    <div style={{ padding: 30, color: "white", maxWidth: 900 }}>
      <h2>Messages</h2>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {[
          ["global", "🌍 Global"],
          ["private", "🔒 Private chats"],
          ["groups", "👥 Groups"]
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              background: tab === id ? "#00eaff" : "#2b2d31",
              color: tab === id ? "black" : "white",
              fontWeight: "bold"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "global" && (
        <>
          <p style={{ marginTop: 16, color: live ? "#7CFC9A" : "#ff6b6b", fontSize: 14 }}>
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
        </>
      )}

      {tab !== "global" && (
        <>
          <p style={{ marginTop: 16, color: "#aaa", fontSize: 14, maxWidth: 560 }}>
            {tab === "private"
              ? "Private 1-to-1 chats — only you and the other person can see these messages."
              : "Private group chats — only members can see these messages. Talk to your people without everybody being in your business."}
            {" "}The owner (Dolo45) can review chats for safety, to keep kids
            and everybody safe. Nothing is auto-banned — anything flagged
            goes to the owner to look at first.
          </p>

          {!loggedIn && (
            <p style={{ marginTop: 16, color: "#ffce54" }}>
              Log in to use private chats and groups.
            </p>
          )}

          {privError && (
            <p style={{ marginTop: 16, color: "#ff6b6b", background: "#3a1a1a", padding: 12, borderRadius: 8 }}>
              {privError}
            </p>
          )}

          {tab === "private" && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Start a private chat</h3>
              <input
                value={dmUsername}
                onChange={(e) => setDmUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createDm();
                }}
                placeholder="Member's username"
                style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10, width: 220 }}
              />
              <button onClick={createDm} style={btnPrimary}>Message</button>

              <div style={{ marginTop: 16 }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchUsers();
                  }}
                  placeholder="Find a member by username"
                  style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10, width: 220 }}
                />
                <button onClick={searchUsers} style={btnSecondary}>Find</button>
                {searchResults.map((u) => (
                  <div key={u.id} style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                    <span>{presence[String(u.id)]?.online ? "🟢" : "⚫"} {u.username}</span>
                    <button
                      onClick={() => {
                        setDmUsername(u.username);
                        setTimeout(createDm, 0);
                      }}
                      style={btnSecondary}
                    >
                      Message
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "groups" && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Create a private group</h3>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10, width: 220 }}
              />
              <input
                value={groupMembers}
                onChange={(e) => setGroupMembers(e.target.value)}
                placeholder="Members, comma separated usernames"
                style={{ padding: 12, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", marginRight: 10, width: 260 }}
              />
              <button onClick={createGroup} style={btnPrimary}>Create group</button>
            </div>
          )}

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>
            {tab === "private" ? "My private chats" : "My groups"}
          </h3>
          {(tab === "private" ? dms : groups).length === 0 ? (
            <p style={{ color: "#aaa" }}>
              {tab === "private" ? "No private chats yet — message someone above." : "No groups yet — create one above."}
            </p>
          ) : (
            (tab === "private" ? dms : groups).map((room) => {
              const pres = onlineForRoom(room);
              return (
                <button
                  key={room.id}
                  onClick={() => openRoom(room)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 14,
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 8,
                    background: activeRoom && String(activeRoom.id) === String(room.id) ? "#00eaff" : "#1e1f22",
                    color: activeRoom && String(activeRoom.id) === String(room.id) ? "black" : "white",
                    fontWeight: "bold"
                  }}
                >
                  {pres ? (pres.online ? "🟢 " : "⚫ ") : ""}
                  {dmTitle(room, username)}
                  {room.type === "group" && (
                    <span style={{ fontWeight: "normal", fontSize: 13 }}>
                      {" "}· {(room.members || []).length} member{(room.members || []).length === 1 ? "" : "s"}
                    </span>
                  )}
                  {pres && !pres.online && pres.lastSeenAt && (
                    <span style={{ fontWeight: "normal", fontSize: 12 }}>
                      {" "}· last seen {new Date(pres.lastSeenAt).toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })
          )}

          {activeRoom && (
            <div style={{ marginTop: 20 }}>
              <h3>
                {dmTitle(activeRoom, username)}
                {activeRoom.type === "group" && (
                  <span style={{ fontSize: 13, color: "#aaa", fontWeight: "normal" }}>
                    {" "}· {(activeRoom.members || []).join(", ")}
                  </span>
                )}
              </h3>
              <div
                ref={privBoxRef}
                style={{ background: "#1e1f22", padding: 20, borderRadius: 12, height: 320, overflowY: "auto", marginTop: 12, marginBottom: 16 }}
              >
                {privMessages.length === 0 ? (
                  <p style={{ color: "#aaa" }}>No messages yet — say something.</p>
                ) : (
                  privMessages.map((m) => (
                    <div key={m.id} style={{ marginBottom: 10 }}>
                      <strong style={{ color: String(m.senderId) === String(myId) ? "#00eaff" : "#fff" }}>
                        {m.senderUsername}
                      </strong>
                      <span style={{ color: "#777", fontSize: 12 }}>
                        {" "}{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                      </span>
                      <div>{m.text}</div>
                    </div>
                  ))
                )}
              </div>

              <input
                value={privInput}
                onChange={(e) => setPrivInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendPrivate();
                }}
                placeholder="Type a private message…"
                style={{ width: "80%", padding: 12, borderRadius: 8, border: "none", marginRight: 10, background: "#2b2d31", color: "white" }}
              />
              <button onClick={sendPrivate} style={btnPrimary}>Send</button>

              {activeRoom.type === "group" && (
                <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={addUsername}
                    onChange={(e) => setAddUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addMember();
                    }}
                    placeholder="Add member by username"
                    style={{ padding: 10, borderRadius: 8, border: "none", background: "#2b2d31", color: "white", width: 220 }}
                  />
                  <button onClick={addMember} style={btnSecondary}>Add member</button>
                  <button onClick={leaveGroup} style={{ ...btnSecondary, color: "#ff6b6b", borderColor: "#ff6b6b" }}>
                    Leave group
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnPrimary = {
  padding: "12px 20px",
  borderRadius: 8,
  background: "#00eaff",
  border: "none",
  cursor: "pointer",
  fontWeight: "bold"
};

const btnSecondary = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#2b2d31",
  color: "#00eaff",
  border: "1px solid #00eaff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: "bold"
};
