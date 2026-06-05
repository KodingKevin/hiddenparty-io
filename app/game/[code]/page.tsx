"use client";

import { use, useEffect, useState } from "react";
import { socket } from "@/src/library/socket";
import { useRouter } from "next/navigation";
type GamePageProps = {
  params: Promise<{
    code: string;
  }>;
};

type GamePlayer = {
  id: string;
  name: string;
  role: "imposter" | "crewmate";
};

type GameState = {
  mode: string;
  category: string;
  word: string;
  imposterMode: string;
  imposterWord: string;
  players: GamePlayer[];
};

export default function GamePage({ params }: GamePageProps) {
  const { code } = use(params);

  const [gameState, setGameState] = useState<GameState | null>(null);

  const router = useRouter();
  
  useEffect(() => {
    socket.connect();

    socket.emit("get-lobby", {
      code,
    });

    socket.on("lobby-update", (lobby) => {
      if (lobby.gameState) {
        setGameState(lobby.gameState);
      }
    });

    socket.on("return-to-lobby", () => {
      router.push(`/lobby/${code}`);
    })

    return () => {
      socket.off("lobby-update");
      socket.off("return-to-lobby");
    };
  }, [code]);

  const currentPlayer = gameState?.players.find(
    (player) => player.id === socket.id
  );

  if (!gameState || !currentPlayer) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading game...
      </main>
    );
  }

  return (
  <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
    <h1 className="text-5xl font-bold mb-6">HiddenParty.IO</h1>

    <p className="text-xl text-gray-400 mb-4">
      Category: {gameState.category}
    </p>

    {currentPlayer.role === "imposter" ? (
      <div className="bg-red-900 border border-red-600 rounded-2xl p-8 text-center">
        <h2 className="text-3xl font-bold mb-4">
          You are the Imposter
        </h2>

        {gameState.imposterMode === "similar-word" ? (
          <>
            <p className="text-gray-300 mb-4">
              Your word is:
            </p>

            <p className="text-5xl font-mono">
              {gameState.imposterWord}
            </p>
          </>
        ) : (
          <p className="text-gray-300">
            You only know the category. Try to blend in.
          </p>
        )}
      </div>
    ) : (
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-center">
        <h2 className="text-3xl font-bold mb-4">Your Word</h2>

        <p className="text-5xl font-mono">
          {gameState.word}
        </p>
      </div>
    )}

    <button 
      onClick={() => {
        socket.emit("return-to-lobby", {code});
        router.push(`/lobby/${code}`);
      }}
      className="mt-8 bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
      > Return to Lobby 
    </button>
  </main>
);
}