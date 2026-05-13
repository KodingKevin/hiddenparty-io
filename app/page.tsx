"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function generateRoomCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";

  for (let i = 0; i < 5; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  return code;
}

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const router = useRouter();

  function createLobby() {
    const newCode = generateRoomCode();
    router.push(`/lobby/${newCode}`);
  }

  function joinLobby() {
    if (!roomCode) {
      alert("Enter a room code");
      return;
    }

    router.push(`/lobby/${roomCode.toUpperCase()}`);
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-6xl font-bold mb-4">HiddenParty.IO</h1>

      <p className="text-xl text-gray-400 mb-8">
        Social deduction games with friends.
      </p>

      <div className="flex gap-4 mb-6">
        <button
          onClick={createLobby}
          className="bg-blue-600 px-6 py-3 rounded-xl hover:bg-blue-500"
        >
          Create Lobby
        </button>

        <button
          onClick={joinLobby}
          className="bg-gray-700 px-6 py-3 rounded-xl hover:bg-gray-600"
        >
          Join Lobby
        </button>
      </div>

      <input
        type="text"
        placeholder="Enter Room Code"
        value={roomCode}
        onChange={(e) => setRoomCode(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none"
      />
    </main>
  );
}