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
  const [error, setError] = useState("");

  const router = useRouter();

  function createLobby() {
    const newCode = generateRoomCode();
    router.push(`/lobby/${newCode}`);
  }

  function joinLobby() {
    const trimmedCode = roomCode.trim().toUpperCase();

    if (!trimmedCode) {
      setError("Please enter a room code.");
      return;
    }

    setError("");
    router.push(`/lobby/${trimmedCode}`);
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-6xl font-bold mb-4">
        HiddenParty.IO
      </h1>

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
        onChange={(e) => {
          setRoomCode(e.target.value.toUpperCase());

          if (error) {
            setError("");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter"){
            joinLobby();
          }
        }} 
        maxLength={5} 
        className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none uppercase tracking-widest"
      />

      {error && (
        <p className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </main>
  );
}