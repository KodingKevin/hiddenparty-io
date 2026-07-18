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
  spokenPlayers: number[];
  votes?: Record<string, string>;
  players: GamePlayer[];
  votedPlayerId?: string;
  votedPlayerName?: string;
  votedPlayerRole?: "imposter" | "innocent";
  innocentsWin?: boolean;
};

export default function GamePage({ params }: GamePageProps) {
  const { code } = use(params);

  const [gameState, setGameState] = useState<GameState | null>(null);

  const router = useRouter();
  
  const [cardOpened, setCardOpened] = useState(false);

  const [timeLeft, setTimeLeft] = useState(30);

  const [selectedVote, setSelectedVote] = useState("");
  
  const [hasSubmittedVote, setHasSubmittedVote] = useState(false);

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

  useEffect(() => {
    if (!gameState || gameState.phase !== "discussion") {
      return;
    }

    setTimeLeft(30);

    const timer = setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          clearInterval(timer);

          const activePlayer =
            gameState.players[gameState.currentTurn];

          if (activePlayer?.id === socket.id) {
            socket.emit("next-turn", {
              code,
            });
          }

          return 0;
        }

        return currentTime - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [
    code,
    gameState?.currentTurn,
    gameState?.phase,
    gameState?.players,
  ]);

  useEffect(() => {
    if (gameState?.phase === "voting") {
      setHasSubmittedVote(false);
      setSelectedVote("");
    }
  }, [gameState?.phase]);

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

  function submitVote() {
    if (!selectedVote) return;

    socket.emit("submit-vote", {
      code,
      vote: selectedVote,
    });

    setHasSubmittedVote(true);
  }

  if (gameState.phase === "voting") {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <h1 className="text-5xl font-bold mb-6">Voting Phase</h1>

        <p className="text-xl text-gray-400 mb-8">
          Round {gameState.round} is complete.
        </p>
        
        <p className="text-sm text-gray-400 mb-4">
          Votes submitted: {Object.keys(gameState.votes || {}).length} / {gameState.players.length}
        </p>

        <div className="flex flex-col gap-3 w-80">
          {gameState.players.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelectedVote(player.id)}
              className={`px-4 py-3 rounded-xl border ${
                selectedVote === player.id
                  ? "bg-blue-600 border-blue-400"
                  : "bg-zinc-800 border-zinc-700"
              }`}
            >
              Vote {player.name}
            </button>
          ))}

          <button
            onClick={() => setSelectedVote("skip")}
            className={`px-4 py-3 rounded-xl border ${
              selectedVote === "skip"
                ? "bg-blue-600 border-blue-400"
                : "bg-zinc-800 border-zinc-700"
            }`}
          >
            Skip Vote
          </button>

          <button
            onClick={submitVote}
            disabled={!selectedVote || hasSubmittedVote}
            className={`mt-4 px-6 py-3 rounded-xl transition-all duration-200 ${
              hasSubmittedVote
                ? "bg-green-700 text-white cursor-not-allowed"
                : !selectedVote
                ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-500 hover:scale-105"
            }`}
          >
            {hasSubmittedVote ? "✓ Vote Submitted" : "Submit Vote"}
          </button>
        </div>
            
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

  if (gameState.phase === "results") {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <h1 className="text-5xl font-bold mb-6">Results</h1>

        <p className="text-xl text-gray-400 mb-4">
          The word was:
        </p>

        <p className="text-5xl font-mono mb-8">
          {gameState.word}
        </p>

        <div className="text-center mb-8">
          <p className="text-xl text-gray-300 mb-3">
            {gameState.votedPlayerName} was voted out.
          </p>

          <p className="text-2xl font-bold mb-6">
            They were{" "}
            {gameState.votedPlayerRole === "imposter"
              ? "the Imposter!"
              : "Innocent."}
          </p>

          <p
            className={`text-4xl font-bold ${
              gameState.innocentsWin
                ? "text-green-500"
                : "text-red-500"
            }`}
          >
            {gameState.innocentsWin
              ? "Innocents Win!"
              : "Imposter Wins!"}
          </p>
        </div>

        <button
          onClick={() => {
            socket.emit("return-to-lobby", { code });
            router.push(`/lobby/${code}`);
          }}
          className="bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
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

    <div className="mb-6 text-center">
      <p className="text-sm text-gray-400 mb-2">
        Time Remaining
      </p>

      <p
        className={`text-5xl font-mono font-bold ${
          timeLeft <= 5 ? "text-red-500" : "text-white"
        }`}
      >
        {timeLeft}
      </p>
    </div>

      <div className="mb-6 text-center">
        <p className="text-sm text-gray-400 mb-2">Turn Order</p>
      <div className="flex flex-col gap-2">
        {gameState.players.map((player, index) => (
          <div
            key={player.id}
            className={`px-4 py-2 rounded-xl ${
              index === gameState.currentTurn
                ? "bg-blue-600"
                : gameState.spokenPlayers.includes(index)
                ? "bg-green-700"
                : "bg-zinc-800"
            }`}
          >
            {player.name}
            {index === gameState.currentTurn && " 🎤"}
            {gameState.spokenPlayers.includes(index) && " ✓"}
          </div>
        ))}
      </div>
    </div>

    <div
    onClick={() => setCardOpened(!cardOpened)}
    className="cursor-pointer"
    >
    {!cardOpened ? (
      <div className="relative w-80 h-52 bg-zinc-900 border-4 border-zinc-700 rounded-2xl flex items-center justify-center shadow-xl overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full border-t-[90px] border-t-zinc-800 border-l-[160px] border-l-transparent border-r-[160px] border-r-transparent" />

        <div className="absolute bottom-0 left-0 w-full h-full border-b-[90px] border-b-zinc-800 border-l-[160px] border-l-transparent border-r-[160px] border-r-transparent" />

        <h2 className="z-10 text-3xl font-bold">
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
      onClick={nextTurn}
      disabled={
        gameState.players[gameState.currentTurn]?.id !== socket.id
      }
      className="mt-6 bg-blue-600 px-6 py-3 rounded-xl hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed"
    >
      {gameState.players[gameState.currentTurn]?.id === socket.id
        ? "Finish Turn"
        : `Waiting for ${gameState.players[gameState.currentTurn]?.name}`}
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