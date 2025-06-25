import { useState } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';

const socket = io('https://whiteboard-backend-w7th.onrender.com');

export default function Home() {
  const [room, setRoom] = useState('');
  const [type, setType] = useState('public');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('editor');
  const router = useRouter();

  const handleCreate = () => {
    if (room) {
      socket.emit('create-room', { roomId: room, type, password });
      socket.on('room-created', () => {
        router.push(`/${room}?role=${role}&username=${username}&password=${password}`);
      });
      socket.on('room-error', (msg) => alert(msg));
    }
  };

  const handleJoin = () => {
    if (room) {
      router.push(`/${room}?role=${role}&username=${username}&password=${password}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800">
      <div className="w-full max-w-md bg-gray-900 rounded-xl shadow-2xl p-8 border border-gray-800">
        <h1 className="text-3xl font-bold text-white mb-8 text-center tracking-tight">Collaborative Whiteboard</h1>
        <div className="flex flex-col gap-5">
          <input
            value={room}
            onChange={e => setRoom(e.target.value)}
            placeholder="Room ID"
            className="px-4 py-3 rounded bg-gray-800 text-gray-100 placeholder-gray-400 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            className="px-4 py-3 rounded bg-gray-800 text-gray-100 placeholder-gray-400 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <div className="flex gap-3">
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="flex-1 px-4 py-3 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="flex-1 px-4 py-3 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          {type === 'private' && (
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              className="px-4 py-3 rounded bg-gray-800 text-gray-100 placeholder-gray-400 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          )}
          <div className="flex gap-4 mt-2">
            <button
              onClick={handleCreate}
              className="flex-1 px-4 py-3 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
            >
              Create Room
            </button>
            <button
              onClick={handleJoin}
              className="flex-1 px-4 py-3 rounded bg-green-600 text-white font-semibold hover:bg-green-700 transition shadow"
            >
              Join Room
            </button>
          </div>
        </div>
        <div className="mt-8 text-center text-gray-400 text-xs">
          <span className="block mb-1">Create or join a collaborative whiteboard room.</span>
          <span>
            <span className="text-blue-400">Editor</span> can draw, <span className="text-green-400">Viewer</span> can only view.
          </span>
        </div>
      </div>
    </div>
  );
}
