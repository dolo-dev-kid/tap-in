import { useEffect, useRef, useState } from "react";
import axiosInstance from "../api/axios";
import ReferralBox from "./ReferralBox";
import ShareTapIn from "./ShareTapIn";
import SocialLinksRow from "./SocialLinks";
import VerifiedBadge from "./VerifiedBadge";
import AdminProfileView from "./AdminProfileView";

// Friends are the logged-in user's real friends from the database.
// Friend requests are real pending requests from the database too:
// "Add Friend" sends a request to the other person, and it shows up
// here at the top of this tab — same green-dot / last-seen treatment
// as online friends — until it is accepted or declined. No sample
// friends, no sample requests.
export default function Friends({ onNavigate }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [presence, setPresence] = useState({}); // username -> { online, lastSeenAt }
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  // Find Members — the directory that fixes "you have to already
  // know who is on here": every member, searchable, with an online
  // dot and an Add Friend button. Members-only, no banned accounts.
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const memberSearchRef = useRef(null);
  const isAdmin =
    typeof localStorage !== "undefined" && localStorage.getItem("tapin_role") === "admin";
  const [viewingProfileId, setViewingProfileId] = useState(null);

  const userId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tapin_user_id")
      : null;

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`
  });

  const loadRequests = () => {
    if (!localStorage.getItem("token")) return;
    axiosInstance
      .get("/friends/requests", { headers: authHeaders() })
      .then((res) => setRequests(res.data?.requests || []))
      .catch(() => { /* requests are a bonus if the call fails */ });
  };

  const loadMembers = (search) => {
    if (!localStorage.getItem("token")) return;
    setMembersLoading(true);
    axiosInstance
      .get("/members", {
        headers: authHeaders(),
        params: search ? { search } : {}
      })
      .then((res) => setMembers(res.data?.members || []))
      .catch(() => { /* directory is a bonus if the call fails */ })
      .finally(() => setMembersLoading(false));
  };

  // "Find a user" in the channel sidebar focuses the member search.
  useEffect(() => {
    const focusSearch = () => {
      setTimeout(() => memberSearchRef.current?.focus(), 60);
    };
    window.addEventListener("tapin:focus-friend-search", focusSearch);
    return () => window.removeEventListener("tapin:focus-friend-search", focusSearch);
  }, []);

  // Search as you type (short delay so every keystroke is not a call).
  useEffect(() => {
    if (!localStorage.getItem("token")) return undefined;
    const timer = setTimeout(() => loadMembers(memberSearch.trim()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSearch]);

  useEffect(() => {
    if (!userId) return;
    // Online dots for friends (only friends you already added can
    // see your status, and vice versa — never strangers).
    axiosInstance
      .get("/chat/presence", {
        headers: authHeaders()
      })
      .then((res) => {
        const map = {};
        for (const p of res.data?.presence || []) map[p.username] = p;
        setPresence(map);
      })
      .catch(() => { /* presence is a bonus */ });
    setLoading(true);
    axiosInstance
      .get(`/users/${userId}`)
      .then((res) => setFriends(res.data?.friends || []))
      .catch(() => {
        setMessage("Could not load your friends — please try again.");
      })
      .finally(() => setLoading(false));
    loadRequests();
    axiosInstance
      .get("/referral/me", { headers: authHeaders() })
      .then((res) => setReferralCode(res.data?.code || ""))
      .catch(() => {});
    // Keep requests fresh while this tab is open, so a new request
    // shows up without leaving and coming back.
    const timer = setInterval(loadRequests, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addFriend = async (friendNameArg) => {
    const friendName = (friendNameArg || name).trim();
    if (!friendName) return;
    const userId = localStorage.getItem("tapin_user_id");
    if (!userId) {
      setMessage("Log in first — friends are saved to your account.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await axiosInstance.post(
        "/friends/request",
        { friendName },
        { headers: authHeaders() }
      );
      if (res.data.success) {
        if (!friendNameArg) setName("");
        setMessage(
          res.data.accepted
            ? `${friendName} had already sent you a request — you're friends now.`
            : res.data.alreadySent
              ? `You already sent ${friendName} a friend request.`
              : `Friend request sent to ${friendName} — they'll see it in their Friend Requests.`
        );
        if (res.data.accepted && res.data.friends) setFriends(res.data.friends);
        loadMembers(memberSearch.trim());
      }
    } catch (err) {
      setMessage(
        err.response?.data?.error ||
          "Could not send friend request — please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (username) => {
    try {
      const res = await axiosInstance.post(
        `/friends/requests/${encodeURIComponent(username)}/accept`,
        {},
        { headers: authHeaders() }
      );
      if (res.data.success) {
        setRequests((prev) => prev.filter((r) => r.username !== username));
        if (res.data.friends) setFriends(res.data.friends);
        setMessage(`You and ${username} are friends now.`);
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not accept — please try again.");
    }
  };

  const declineRequest = async (username) => {
    try {
      const res = await axiosInstance.post(
        `/friends/requests/${encodeURIComponent(username)}/decline`,
        {},
        { headers: authHeaders() }
      );
      if (res.data.success) {
        setRequests((prev) => prev.filter((r) => r.username !== username));
        setMessage(`Declined ${username}'s friend request.`);
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not decline — please try again.");
    }
  };

  const presenceFor = (username) => {
    // Requests carry their own online/last-seen from the server; the
    // friends presence map is the fallback for accepted friends.
    const fromRequest = requests.find((r) => r.username === username);
    if (fromRequest && (fromRequest.online || fromRequest.lastSeenAt)) {
      return { online: fromRequest.online, lastSeenAt: fromRequest.lastSeenAt };
    }
    return presence[username];
  };

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h1>Your Friends</h1>

      {/* 🔍 Find a user — front and center, search-as-you-type,
          online first, verified ✓ and social links on every row.
          Members only, banned accounts never appear. */}
      <div style={{ marginTop: 16 }}>
        <input
          ref={memberSearchRef}
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          placeholder="🔍 Find a user — search members by username…"
          style={{ width: "100%", padding: 14, borderRadius: 10, border: "1px solid #00eaff", background: "#2b2d31", color: "white", fontSize: 16 }}
        />
      </div>

      <ReferralBox compact />
      <ShareTapIn code={referralCode} />

      {/* Friend Requests — always visible at the top, with a count,
          so a request can never sit hidden the way it used to. */}
      <div
        style={{
          marginTop: 20,
          background: requests.length > 0 ? "#1a2b33" : "#1e1f22",
          border: requests.length > 0 ? "2px solid #00eaff" : "1px solid #2b2d31",
          padding: 15,
          borderRadius: 8
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Friend Requests
          {requests.length > 0 && (
            <span
              style={{
                marginLeft: 10,
                background: "#ff3b30",
                color: "white",
                borderRadius: 12,
                padding: "2px 10px",
                fontSize: 14
              }}
            >
              {requests.length}
            </span>
          )}
        </h2>
        {requests.length === 0 ? (
          <p style={{ color: "#aaa", margin: "10px 0 0" }}>
            No friend requests right now — when someone adds you, they'll show up here.
          </p>
        ) : (
          requests.map((req) => {
            const p = presenceFor(req.username);
            return (
              <div
                key={req.username}
                style={{
                  background: "#1e1f22",
                  padding: 15,
                  borderRadius: 8,
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10
                }}
              >
                <span>
                  {p?.online ? "🟢 " : "⚫ "}
                  {req.username}
                  {p && !p.online && p.lastSeenAt && (
                    <span style={{ color: "#777", fontSize: 12 }}>
                      {" "}· last seen {new Date(p.lastSeenAt).toLocaleDateString()}
                    </span>
                  )}
                  {req.createdAt && (
                    <span style={{ color: "#777", fontSize: 12 }}>
                      {" "}· {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => acceptRequest(req.username)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "#22c55e",
                      border: "none",
                      cursor: "pointer",
                      color: "white",
                      fontWeight: "bold"
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineRequest(req.username)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "#3a3b3f",
                      border: "1px solid #555",
                      cursor: "pointer",
                      color: "white"
                    }}
                  >
                    Decline
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Find Members — the directory. Before this, a member could
          only find someone if they already knew the exact username;
          now every member is listed here, searchable, with an online
          dot and an Add Friend button. Banned accounts never appear. */}
      <div style={{ marginTop: 30 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>🔍 Find Members</h2>
        <p style={{ color: "#aaa", margin: "8px 0 0", fontSize: 14 }}>
          Everyone on Tap In — search by username, then add them as a friend.
        </p>
        {membersLoading ? (
          <p style={{ color: "#aaa", marginTop: 12 }}>Finding members…</p>
        ) : members.length === 0 ? (
          <p style={{ color: "#aaa", marginTop: 12 }}>
            {memberSearch ? `No members match "${memberSearch}".` : "No other members yet — invite someone with your referral code above."}
          </p>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              style={{
                background: "#1e1f22",
                padding: 15,
                borderRadius: 8,
                marginTop: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10
              }}
            >
              <span>
                {m.online ? "🟢 " : "⚫ "}
                <b>{m.username}</b><VerifiedBadge verified={m.verified} />
                {m.role === "admin" && (
                  <span style={{ color: "#00eaff", fontSize: 12 }}> 🛡️ Admin</span>
                )}
                {m.bio && (
                  <span style={{ color: "#aaa", fontSize: 13, display: "block", marginTop: 4 }}>
                    {m.bio}
                  </span>
                )}
                <SocialLinksRow links={m.socialLinks} username={m.username} />
                {!m.online && m.lastSeenAt && (
                  <span style={{ color: "#777", fontSize: 12, display: "block", marginTop: 2 }}>
                    last seen {new Date(m.lastSeenAt).toLocaleDateString()}
                  </span>
                )}
              </span>
              <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {m.isFriend ? (
                  <span style={{ color: "#22c55e", fontWeight: "bold", fontSize: 14, alignSelf: "center" }}>
                    ✓ Friends
                  </span>
                ) : m.requestIncoming ? (
                  <span style={{ color: "#ffce54", fontSize: 14, alignSelf: "center" }}>
                    Sent you a request — see above
                  </span>
                ) : m.requestSent ? (
                  <span style={{ color: "#aaa", fontSize: 14, alignSelf: "center" }}>
                    Request sent
                  </span>
                ) : (
                  <button
                    onClick={() => addFriend(m.username)}
                    disabled={busy}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "#00eaff",
                      border: "none",
                      cursor: busy ? "not-allowed" : "pointer",
                      color: "black",
                      fontWeight: "bold",
                      opacity: busy ? 0.6 : 1
                    }}
                  >
                    Add Friend
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setViewingProfileId(m.id)}
                    title="Admin only: view this member's whole profile"
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "#2b2d31",
                      border: "1px solid #00eaff",
                      cursor: "pointer",
                      color: "#00eaff"
                    }}
                  >
                    👤 View profile
                  </button>
                )}
                <button
                  onClick={() => {
                    localStorage.setItem("tapin_dm_username", m.username);
                    onNavigate && onNavigate("chat");
                  }}
                  title="Send a private message"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    background: "#2b2d31",
                    border: "1px solid #555",
                    cursor: "pointer",
                    color: "white"
                  }}
                >
                  Message
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <p style={{ color: "#aaa" }}>Loading your friends…</p>
        ) : friends.length === 0 ? (
          <p style={{ color: "#aaa" }}>No friends yet — add your first friend.</p>
        ) : (
          friends.map((friend, i) => (
          <div
            key={i}
            style={{
              background: "#1e1f22",
              padding: 15,
              borderRadius: 8,
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>
              {presence[friend]?.online ? "🟢 " : "⚫ "}
              {friend}<VerifiedBadge verified={presence[friend]?.verified} />
              {presence[friend] && !presence[friend].online && presence[friend].lastSeenAt && (
                <span style={{ color: "#777", fontSize: 12 }}>
                  {" "}· last seen {new Date(presence[friend].lastSeenAt).toLocaleDateString()}
                </span>
              )}
            </span>
            <span>
              <button
                onClick={() => {
                  // Hand the friend's name to the Messages tab, which
                  // opens a private chat with them when it mounts.
                  localStorage.setItem("tapin_dm_username", friend);
                  onNavigate && onNavigate("chat");
                }}
                title="Send a private message"
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "#00eaff",
                  border: "none",
                  cursor: "pointer",
                  color: "black",
                  marginRight: 8
                }}
              >
                Message
              </button>
              <button
                onClick={() => onNavigate && onNavigate("video")}
                title="Open a video room to call"
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "#00eaff",
                  border: "none",
                  cursor: "pointer",
                  color: "black"
                }}
              >
                Call
              </button>
            </span>
          </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 30 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addFriend();
          }}
          placeholder="Friend's username"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "none",
            background: "#2b2d31",
            color: "white",
            marginRight: 10,
            width: 240
          }}
        />
        <button
          onClick={addFriend}
          disabled={busy}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "#00eaff",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? "Sending…" : "Add Friend"}
        </button>
        {message && (
          <p style={{ marginTop: 12, color: "#ffce54" }}>{message}</p>
        )}
      </div>
      {viewingProfileId && (
        <AdminProfileView userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />
      )}
    </div>
  );
}
