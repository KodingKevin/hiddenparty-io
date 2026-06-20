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
  phase: "discussion" | "voting" | "results";
  currentTurn: number;
  round: number;
  players: GamePlayer[];
};

export default function GamePage({ params }: GamePageProps) {
  const { code } = use(params);

  const [gameState, setGameState] = useState<GameState | null>(null);

  const router = useRouter();
  
  const [cardOpened, setCardOpened] = useState(false);

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
  }, [code, router]);

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

  if (gameState.phase === "voting") {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <h1 className="text-5xl font-bold mb-6">Voting Phase</h1>

        <p className="text-xl text-gray-400 mb-8">
          Round {gameState.round} is complete.
        </p>

        <p className="text-lg text-gray-300 mb-6">
          Voting system coming next.
        </p>

        <button
          onClick={() => {
            socket.emit("return-to-lobby", { code });
            router.push(`/lobby/${code}`);
          }}
          className="mt-8 bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
        >
          Return to Lobby
        </button>
      </main>
    );
  }

  function nextTurn(){
    socket.emit("next-turn", {
      code,
    });
  }

  return (
  <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
    <h1 className="text-5xl font-bold mb-6">HiddenParty.IO</h1>

    <p className="text-xl text-gray-400 mb-4">
      Category: {gameState.category}
    </p>

    <p className="text-lg text-gray-400 mb-2">
      Round {gameState.round}
    </p>

    <p className="text-2xl font-bold mb-6">
      Current Turn: {gameState.players[gameState.currentTurn]?.name}
    </p>

      <div
    onClick={() => setCardOpened(!cardOpened)}
    className="cursor-pointer"
  >
    {!cardOpened ? (
      <div className="w-80 h-52 bg-zinc-900 border-4 border-zinc-700 rounded-2xl flex items-center justify-center shadow-xl">
        <h2 className="text-3xl font-bold">
          Open Envelope
        </h2>
      </div>
    ) : (
      <div className="w-80 h-52 bg-white text-black border-4 border-zinc-300 rounded-2xl flex flex-col items-center justify-center shadow-xl">
        <p className="text-sm text-gray-500 mb-2">
          Category
        </p>
      
        <h2 className="text-3xl font-bold mb-6">
          {gameState.category}
        </h2>

        {currentPlayer.role === "imposter" ? (
          gameState.imposterMode === "similar-word" ? (
            <p className="text-4xl font-bold">
              {gameState.imposterWord}
            </p>
          ) : (
            <p className="text-xl font-semibold">
              You are the Imposter
            </p>
          )
        ) : (
          <p className="text-4xl font-bold">
            {gameState.word}
          </p>
        )}
      </div>
    )}
  </div>

    <button
      onClick={(e) => {
        e.stopPropagation();
        setCardOpened(false);
      }}
      className="mt-6 bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
    >
      Hide Card
    </button>
    
    <button
      onClick={nextTurn}
      className="mt-6 bg-blue-600 px-6 py-3 rounded-xl hover:bg-blue-500"
    > 
      Next Turn 
    </button>

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