"use client";

import { use, useEffect, useState } from "react";
import { socket } from "@/src/library/socket";
import { useRouter } from "next/navigation";
import { getPlayerId } from "@/src/library/playerId";

type GamePageProps = {
  params: Promise<{
    code: string;
  }>;
};

type GamePlayer = {
  id: string;
  name: string;
  role: "imposter" | "innocent";
  isHost: boolean;
};

type GameState = {
  mode: string;
  category: string;
  word: string;
  imposterMode: string;
  imposterWord: string;
  phase: "discussion" | "voting" | "transition" | "reveal" | "results";
  currentTurn: number;
  round: number;
  spokenPlayers: number[];
  votes?: Record<string, string>;

  roundMessage?: string;
  voteResults?: {
    voter: string;
    target: string;
  }[];

  playAgainVotes?: Record<string, boolean>;
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

  const [playerId, setPlayerId] = useState("");

  const [transitionCountdown, setTransitionCountdown] = useState(3);

  useEffect(() => {
    const storedPlayerId = getPlayerId();

    setPlayerId(storedPlayerId);
    socket.connect();

    socket.emit("join-lobby", {
      code,
      playerName: "",
      playerId: storedPlayerId,
    });

    socket.emit("get-lobby", {
      code,
      playerId: storedPlayerId,
    });

    const handleLobbyUpdate = (updatedLobby: any) => {
      console.log("Game lobby update:", updatedLobby);

      if (!updatedLobby?.gameState) {
        router.push(`/lobby/${code}`);
        return;
      }

      setGameState(updatedLobby.gameState);
    };

    const handleReturnToLobby = () => {
      router.push(`/lobby/${code}`);
    };

    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("return-to-lobby", handleReturnToLobby);

    return () => {
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("return-to-lobby", handleReturnToLobby);
    };
  }, [code, router]);

  useEffect(() => {
    if (gameState?.phase !== "transition") {
      return;
    }

    setTransitionCountdown(3);

    const timer = setInterval(() => {
      setTransitionCountdown((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 1;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [gameState?.phase, gameState?.roundMessage]);

  useEffect(() => {
    if (!gameState || gameState.phase !== "discussion") {
      return;
    }

    setTimeLeft(45);

    const timer = setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          clearInterval(timer);

          const activePlayer =
            gameState.players[gameState.currentTurn];

          if (activePlayer?.id === playerId) {
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
    playerId,
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

  useEffect(() => {
    if (gameState?.phase === "discussion") {
      setCardOpened(false);
    }
  }, [
    gameState?.phase,
    gameState?.word,
    gameState?.round,
  ]);

  const currentPlayer = gameState?.players.find(
    (player) => player.id === playerId
  );

  const hasPressedPlayAgain = Boolean(
    gameState?.playAgainVotes?.[playerId || ""]
  );

  const playAgainCount = Object.keys(
    gameState?.playAgainVotes || {}
  ).length;

  if (!gameState || !currentPlayer) {
    return (
      <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-4 overflow-x-hidden">
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

  if (gameState.phase === "transition") {
    return (
      <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl sm:text-5xl font-bold text-center mb-5">
          Next Round
        </h1>

        <p className="text-lg sm:text-xl text-yellow-300 text-center mb-8">
          {gameState.roundMessage}
        </p>

        <p className="text-7xl sm:text-8xl font-bold font-mono">
          {transitionCountdown}
        </p>
      </main>
    );
  }

  if (gameState.phase === "voting") {
    return (
      <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-4 overflow-x-hidden">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-center">Voting Phase</h1>

        <p className="text-xl text-gray-400 mb-8">
          Round {gameState.round} is complete.
        </p>
        
        <p className="text-sm text-gray-400 mb-4">
          Votes submitted: {Object.keys(gameState.votes || {}).length} / {gameState.players.length}
        </p>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          {gameState.players.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelectedVote(player.id)}
              disabled={hasSubmittedVote}
              className={`px-4 py-3 rounded-xl border transition ${
                hasSubmittedVote
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-zinc-700"
              } ${
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
            disabled={hasSubmittedVote}
            className={`px-4 py-3 rounded-xl border transition ${
              hasSubmittedVote
                ? "cursor-not-allowed opacity-60"
                : "hover:bg-zinc-700"
            } ${
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
          
          {hasSubmittedVote && (
            <p className="mt-3 text-green-400 text-sm text-center">
              Waiting for the other players to finish voting...
            </p>
          )}

        </div>
            
        <button
          onClick={() => {
            socket.emit("return-to-lobby", { code });
            router.push(`/lobby/${code}`);
          }}
          className="mt-6 w-full max-w-sm bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
        >
          Return to Lobby
        </button>
      </main>
    );
  }

  if (gameState.phase === "reveal") {
    return (
      <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-4">
        <p className="text-lg text-gray-400 mb-4">
          The group voted out...
        </p>

        <h1 className="text-4xl sm:text-6xl font-bold text-center">
          {gameState.votedPlayerName}
        </h1>

        <p className="mt-8 text-lg text-gray-500">
          Revealing role...
        </p>
      </main>
    );
  }

  if (gameState.phase === "results") {
    return (
      <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-4 overflow-x-hidden">
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

        {/* Vote summary */}
        {gameState.voteResults &&
          gameState.voteResults.length > 0 && (
            <div className="w-full max-w-sm mb-6">
              <h2 className="text-xl font-semibold text-center mb-3">
                Vote Summary
              </h2>

              <div className="flex flex-col gap-2">
                {gameState.voteResults.map((vote, index) => (
                  <div
                    key={`${vote.voter}-${vote.target}-${index}`}
                    className="flex items-center justify-between gap-3 bg-zinc-800 rounded-xl px-4 py-3"
                  >
                    <span className="font-medium truncate">
                      {vote.voter}
                    </span>

                    <span
                      className={
                        vote.target === "Skip"
                          ? "text-yellow-400"
                          : vote.target === gameState.votedPlayerName
                          ? "text-red-400"
                          : "text-gray-400"
                      }
                    >
                      → {vote.target}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        <div className="w-full max-w-sm flex flex-col gap-3">
          <p className="text-sm text-center text-gray-400">
            Ready to play again: {playAgainCount} /{" "}
            {gameState.players.length}
          </p>

          <button
            onClick={() => {
              socket.emit("play-again", { code });
            }}
            disabled={hasPressedPlayAgain}
            className={`w-full px-6 py-3 rounded-xl font-semibold transition ${
              hasPressedPlayAgain
                ? "bg-green-800 text-green-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-500"
            }`}
          >
            {hasPressedPlayAgain
              ? "✓ Ready to Play Again"
              : "Play Again"}
          </button>

          <button
            onClick={() => {
              socket.emit("return-to-lobby", { code });
              router.push(`/lobby/${code}`);
            }}
            className="w-full bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
          >
            Return to Lobby
          </button>
        </div>
      </main>
    );
  }

  function nextTurn(){
    socket.emit("next-turn", {
      code,
    });
  }

  return (
    <main className="min-h-dvh bg-black text-white p-3 sm:p-4 overflow-x-hidden flex flex-col">

      {/* Header */}
      <div className="w-full flex flex-col items-center text-center mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
          HiddenParty.IO
        </h1>

        <p className="text-base sm:text-xl text-gray-400 mb-2">
          Category: {gameState.category}
        </p>

        <p className="text-base sm:text-lg text-gray-400 mb-2">
          Round {gameState.round}
        </p>

        {gameState.roundMessage && (
          <div className="w-full max-w-xl rounded-xl border border-yellow-500 bg-yellow-500/10 px-4 py-3 text-center">
            <p className="font-semibold text-yellow-300">
              {gameState.roundMessage}
            </p>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        {/* LEFT SIDE */}
        <section className="flex flex-col items-center text-center">

          <p className="text-xl sm:text-2xl font-bold mb-4">
            Current Turn:{" "}
            {gameState.players[gameState.currentTurn]?.name}
          </p>

          {/* Timer */}
          <div className="mb-4 text-center">
            <p className="text-sm text-gray-400 mb-1">
              Time Remaining
            </p>

            <p
              className={`text-4xl sm:text-5xl font-mono font-bold ${
                timeLeft <= 5 ? "text-red-500" : "text-white"
              }`}
            >
              {timeLeft}
            </p>
          </div>

          {/* Turn Order */}
          <div className="text-center w-full max-w-sm">
            <p className="text-sm text-gray-400 mb-2">
              Turn Order
            </p>

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

                  {gameState.spokenPlayers.includes(index) &&
                    index !== gameState.currentTurn &&
                    " ✓"}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT SIDE */}
        <section className="flex flex-col items-center">

          {/* Envelope */}
          <div
            onClick={() => setCardOpened(!cardOpened)}
            className="cursor-pointer"
          >
            {!cardOpened ? (
              <div className="relative w-[85vw] max-w-80 h-44 sm:h-52 bg-zinc-900 border-4 border-zinc-700 rounded-2xl flex items-center justify-center shadow-xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full border-t-[90px] border-t-zinc-800 border-l-[160px] border-l-transparent border-r-[160px] border-r-transparent" />
                <div className="absolute bottom-0 left-0 w-full h-full border-b-[90px] border-b-zinc-800 border-l-[160px] border-l-transparent border-r-[160px] border-r-transparent" />
                <h2 className="z-10 text-2xl sm:text-3xl font-bold">
                  Open Envelope
                </h2>
              </div>
            ) : (
              <div className="w-[85vw] max-w-80 h-44 sm:h-52 bg-white text-black border-4 border-zinc-300 rounded-2xl flex flex-col items-center justify-center text-center shadow-xl">
                <p className="text-sm text-gray-500 mb-2">
                  Category
                </p>

                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {gameState.category}
                </h2>

                {currentPlayer.role === "imposter" ? (
                  gameState.imposterMode === "similar-word" ? (
                    <p className="text-3xl sm:text-4xl font-bold">
                      {gameState.imposterWord}
                    </p>
                  ) : (
                    <p className="text-xl font-semibold">
                      You are the Imposter
                    </p>
                  )
                ) : (
                  <p className="text-3xl sm:text-4xl font-bold">
                    {gameState.word}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Finish Turn */}
          <button
            onClick={nextTurn}
            disabled={
              gameState.players[gameState.currentTurn]?.id !== playerId
            }
            className="mt-6 w-full max-w-80 bg-blue-600 px-6 py-3 rounded-xl hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed"
          >
            {gameState.players[gameState.currentTurn]?.id === playerId
              ? "Finish Turn"
              : `Waiting for ${gameState.players[gameState.currentTurn]?.name}`}
          </button>

          {/* Return to Lobby */}
          <button
            onClick={() => {
              socket.emit("return-to-lobby", { code });
              router.push(`/lobby/${code}`);
            }}
            className="mt-4 w-full max-w-80 bg-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-600"
          >
            Return to Lobby
          </button>
        </section>
      </div>

      {/* Previous Vote */}
      {gameState.roundMessage &&
        gameState.voteResults &&
        gameState.voteResults.length > 0 && (
          <div className="mt-12 pt-6 border-t border-zinc-800 w-full flex flex-col items-center">
            <p className="text-sm uppercase tracking-wider text-gray-500 mb-4">
              Previous Round Votes
            </p>

            <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
              {gameState.voteResults.map((vote, index) => (
                <div
                  key={`${vote.voter}-${vote.target}-${index}`}
                  className="rounded-full bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm"
                >
                  <span className="font-semibold">
                    {vote.voter}
                  </span>

                  <span className="text-gray-500">
                    {" "}→{" "}
                  </span>

                  <span
                    className={
                      vote.target === "Skip"
                        ? "text-yellow-400"
                        : "text-gray-300"
                    }
                  >
                    {vote.target}
                  </span>
                </div>
              ))}
            </div>
          </div>
      )}
    </main>
  );
}