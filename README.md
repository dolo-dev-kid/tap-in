# Tap-In

Social media app with peer-to-peer calling, video chat, group chat, live stream and group stream.

## Project Structure

```
tap-in/
├── backend/
│   ├── models/
│   │   └── User.js
│   ├── .env
│   ├── .env.example
│   ├── auth.js
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js
│   │   ├── components/
│   │   ├── pages/
│   │   ├── router/
│   │   │   └── AppRouter.jsx
│   │   ├── styles/
│   │   │   └── globals.css
│   │   ├── App.jsx
│   │   └── main.tsx
│   ├── .env
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── package.json
└── README.md
```

## Setup

### Prerequisites
- Node.js (v16+)
- MongoDB

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## Running Both

From root directory:

```bash
npm run backend  # Terminal 1
npm run frontend # Terminal 2
```

## Features

- User authentication (Register/Login)
- Peer-to-peer video calling (WebRTC)
- Group chat
- Live streaming
- Friend management
- Server/channel management
- Real-time communication via Socket.io

## Tech Stack

### Frontend
- React 18
- Vite
- React Router
- Axios
- Socket.io-client
- Zustand (state management)

### Backend
- Express.js
- Socket.io
- MongoDB + Mongoose
- JWT Authentication
- Bcrypt
