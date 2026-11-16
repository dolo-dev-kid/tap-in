import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io(import.meta.env.VITE_API_URL || "http://localhost:3001");

// Public STUN server so video calls can connect across different networks.
// (Before this, RTCPeerConnection had no ICE servers at all, so calls only
// worked on the same local network. A TURN server is still needed for the
// toughest home networks — see TAPIN_OVERNIGHT_NOTES.md.)
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function VideoChat({ initialRoom }) {
  const [room, setRoom] = useState("global");
  const [roomInput, setRoomInput] = useState("global");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [broadcastStatus, setBroadcastStatus] = useState(null);

  // Tapping a "just went live" notification opens this page with the
  // broadcaster's room already filled in — one tap on Join and
  // you're watching them.
  useEffect(() => {
    if (initialRoom && typeof initialRoom === "string") {
      setRoomInput(initialRoom.toLowerCase());
    }
  }, [initialRoom]);

  const localVideo = useRef(null);
  const localStream = useRef(null);
  const peers = useRef({});
  const videoContainer = useRef(null);

  useEffect(() => {
    const onExisting = async (users) => {
      for (const userId of users) createOffer(userId);
    };
    const onUserJoined = async (userId) => {
      createOffer(userId);
    };
    const onOffer = async (data) => {
      handleOffer(data);
    };
    const onAnswer = async (data) => {
      try {
        await peers.current[data.from]?.setRemoteDescription(data.sdp);
      } catch (e) {
        console.error("Bad answer SDP", e);
      }
    };
    const onIce = async (data) => {
      try {
        await peers.current[data.from]?.addIceCandidate(data.candidate);
      } catch (e) {
        console.error("Bad ICE candidate", e);
      }
    };
    const onUserLeft = (userId) => {
      peers.current[userId]?.close();
      delete peers.current[userId];
    };

    socket.on("existing-users", onExisting);
    socket.on("user-joined", onUserJoined);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onIce);
    socket.on("user-left", onUserLeft);
    // Owner auto-broadcast status: when Dolo45 goes live, the server
    // sends where the stream should be pushing out to (enabled
    // destinations) and what it auto-posted (Feed + DMs).
    const onBroadcastStatus = (data) => setBroadcastStatus(data);
    socket.on("broadcast-status", onBroadcastStatus);

    // Clean up on unmount (React StrictMode mounts twice in dev — without
    // this every handler ran twice and offers were sent twice).
    return () => {
      socket.off("existing-users", onExisting);
      socket.off("user-joined", onUserJoined);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onIce);
      socket.off("user-left", onUserLeft);
      socket.off("broadcast-status", onBroadcastStatus);
      // Leaving the page while live ends the broadcast.
      socket.emit("stop-live");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinRoom = async () => {
    const roomName = (roomInput.trim() || "global").toLowerCase();
    setRoom(roomName);
    setError("");
    setJoining(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
    } catch (e) {
      // Camera/mic denied or missing — show it instead of crashing or
      // sitting on a black screen (the old code set joined=true first,
      // then threw, leaving a broken joined state).
      setJoining(false);
      setError(
        e?.name === "NotAllowedError"
          ? "Camera and mic access was blocked. Allow camera + mic for this site, then try again."
          : "Could not start your camera/mic. Check that a camera is connected and no other app is using it."
      );
      return;
    }

    localStream.current = stream;
    setJoined(true);
    setJoining(false);
    // This socket was created without a login, so the server can't
    // tell who is going live. Reconnect it with the login token, then
    // join the room and announce the broadcast — that announcement is
    // what sends everyone the "just went live" notification.
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") || "" : "";
    socket.auth = { token };
    const announceLive = () => {
      socket.emit("join-room", roomName);
      socket.emit("go-live", { room: roomName });
    };
    if (socket.connected) {
      socket.once("connect", announceLive);
      socket.disconnect();
      socket.connect();
    } else {
      socket.once("connect", announceLive);
      socket.connect();
    }

    if (localVideo.current) {
      localVideo.current.srcObject = stream;
    }
  };

  const leaveRoom = () => {
    // Ending the broadcast so nobody keeps getting told you're live.
    socket.emit("stop-live");
    Object.values(peers.current).forEach((p) => {
      try {
        p.close();
      } catch {
        // ignore
      }
    });
    peers.current = {};
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (videoContainer.current) videoContainer.current.innerHTML = "";
    setBroadcastStatus(null);
    setJoined(false);
    setError("");
  };

  const createPeer = (userId) => {
    if (peers.current[userId]) return peers.current[userId];
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          to: userId,
          candidate: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.width = 300;
      video.srcObject = event.streams[0];
      videoContainer.current?.appendChild(video);
    };

    const stream = localStream.current;
    if (stream) {
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    }

    peers.current[userId] = peer;
    return peer;
  };

  const createOffer = async (userId) => {
    try {
      const peer = createPeer(userId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("offer", { to: userId, sdp: offer });
    } catch (e) {
      console.error("Could not create offer", e);
    }
  };

  const handleOffer = async (data) => {
    try {
      const peer = createPeer(data.from);
      await peer.setRemoteDescription(data.sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("answer", { to: data.from, sdp: answer });
    } catch (e) {
      console.error("Could not answer offer", e);
    }
  };

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h2>Video Chat</h2>
      <p style={{ marginTop: 10, color: "#aaa", maxWidth: 560 }}>
        Peer-to-peer video rooms. Pick a room name, share it with a friend,
        and you will both see each other once you are both in the same room.
        Your browser will ask for camera and mic permission.
      </p>

      {error && (
        <p style={{ marginTop: 16, color: "#ff6b6b" }}>{error}</p>
      )}

      {!joined ? (
        <div style={{ marginTop: 20 }}>
          <input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="Room name (e.g. global)"
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
            onClick={joinRoom}
            disabled={joining}
            style={{
              padding: "14px 32px",
              fontSize: 18,
              borderRadius: 12,
              background: "#00eaff",
              border: "none",
              cursor: joining ? "not-allowed" : "pointer",
              opacity: joining ? 0.6 : 1
            }}
          >
            {joining ? "Starting camera…" : "Join Video Room"}
          </button>
        </div>
      ) : (
        <>
          <h3 style={{ marginTop: 20 }}>Video Room: {room}</h3>
          {broadcastStatus && (
            <div style={{ marginTop: 12, background: "#1e1f22", border: "2px solid #ff4444", padding: 14, borderRadius: 12, fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>
              🔴 <strong>You're live — auto-broadcast on</strong>
              <span style={{ display: "block", color: "#ddd" }}>
                Broadcasting to: {broadcastStatus.destinations?.length ? broadcastStatus.destinations.join(", ") : "no destinations on — save Restream in Stream Destinations and start your OBS feed to push video out"}
              </span>
              <span style={{ display: "block", color: "#aaa" }}>
                {broadcastStatus.feedPosted ? "Feed post ✅" : "Feed post already up"} · DMs to {broadcastStatus.dmCount} member{broadcastStatus.dmCount === 1 ? "" : "s"} — Tap In posts the announcement; the video push-out comes from OBS/Restream.
              </span>
            </div>
          )}
          <p style={{ marginTop: 6, color: "#aaa", fontSize: 14 }}>
            Tell a friend to open Tap-In and join room “{room}”.
          </p>

          <video ref={localVideo} autoPlay playsInline muted width={300} style={{ marginTop: 16, borderRadius: 12 }} />

          <div
            ref={videoContainer}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              marginTop: 20
            }}
          ></div>

          <button
            onClick={leaveRoom}
            style={{
              marginTop: 20,
              padding: "12px 24px",
              borderRadius: 8,
              background: "#ff4444",
              border: "none",
              cursor: "pointer",
              color: "white",
              fontWeight: "bold"
            }}
          >
            Leave Room
          </button>
        </>
      )}
    </div>
  );
}
