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
  role?: "imposter" | "innocent";
  isHost: boolean;
  connected?: boolean;
};

type GameState = {
  mode: string;
  category: string;

  word?: string;

  imposterMode: string;

  imposterWord?: string;

  turnTime: number;

  phase:
    | "discussion"
    | "voting"
    | "transition"
    | "reveal"
    | "results";

  currentTurn: number;
  round: number;

  spokenPlayers: number[];

  votes?: Record<string, string>;

  roundMessage?: string;

  voteResults?: {
    voter: string;
    target: string;
  }[];

  eliminatedPlayers?: string[];

  playAgainCount?: number;
  hasPressedPlayAgain?: boolean;

  players: GamePlayer[];

  votedPlayerId?: string;
  votedPlayerName?: string;
  votedPlayerRole?: "imposter" | "innocent";

  innocentsWin?: boolean;

  endReason?:
    | "normal"
    | "host-ended";
};

export default function GamePage({ params }: GamePageProps) {
  const { code } = use(params);

  const [gameState, setGameState] = useState<GameState | null>(null);

  const router = useRouter();
  
  const [cardOpened, setCardOpened] = useState(false);

  const [timeLeft, setTimeLeft] = useState(45);

  const [selectedVote, setSelectedVote] = useState("");
  
  const [hasSubmittedVote, setHasSubmittedVote] = useState(false);

  const [playerId, setPlayerId] = useState("");

  const [transitionCountdown, setTransitionCountdown] = useState(3);

  const [showRevealedRole, setShowRevealedRole] = useState(false);

  const [hostAction, setHostAction] = useState<"end-game" | "return-lobby" | null>(null);

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
      console.log(
        "Game lobby update:",
        updatedLobby
      );

      if (!updatedLobby?.gameState) {
        router.push(`/lobby/${code}`);
        return;
      }

      const activeGamePlayer =
        updatedLobby.gameState.players?.find(
          (player: any) =>
            player.id === storedPlayerId
        );

      if (!activeGamePlayer) {
        router.push(`/lobby/${code}`);
        return;
      }

      setGameState(
        updatedLobby.gameState
      );
    };

    const handleReturnToLobby = () => {
      router.push(`/lobby/${code}`);
    };

    socket.on(
      "lobby-update",
      handleLobbyUpdate
    );

    socket.on(
      "return-to-lobby",
      handleReturnToLobby
    );

    return () => {
      socket.off(
        "lobby-update",
        handleLobbyUpdate
      );

      socket.off(
        "return-to-lobby",
        handleReturnToLobby
      );
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

    setTimeLeft(gameState.turnTime || 45);

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
    gameState?.turnTime,
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

  useEffect(() => {
    if (gameState?.phase !== "reveal") {
      setShowRevealedRole(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowRevealedRole(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [gameState?.phase, gameState?.votedPlayerId]);

  const currentPlayer = gameState?.players.find(
    (player) => player.id === playerId
  );
  
  const isHost = currentPlayer?.isHost;

  const eliminatedPlayers =
    gameState?.eliminatedPlayers || [];

  const isCurrentPlayerEliminated =
    eliminatedPlayers.includes(playerId);

  const activePlayers =
    gameState?.players.filter(
      (player) =>
        !eliminatedPlayers.includes(player.id) &&
        player.connected !== false
    ) || [];

  const imposters =
    gameState?.players.filter(
      (player) => player.role === "imposter"
    ) || [];

  const connectedGamePlayers =
    gameState?.players.filter(
      (player) => player.connected !== false
    ) || [];

  const hasPressedPlayAgain =
    gameState?.hasPressedPlayAgain ?? false;

  const playAgainCount =
    gameState?.playAgainCount ?? 0;

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

  function renderHostControls() {
    if (!isHost) return null;

    return (
      <div className="mt-6 w-full max-w-80 border-t border-zinc-800 pt-5">
        <p className="text-xs uppercase tracking-wide text-gray-500 text-center mb-3">
          Host Controls
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={() =>
              setHostAction("end-game")
            }
            className="w-full bg-red-900/60 border border-red-800 px-6 py-3 rounded-xl hover:bg-red-800 transition"
          >
            End Game
          </button>

          <button
            onClick={() =>
              setHostAction("return-lobby")
            }
            className="w-full bg-zinc-800 border border-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-700 transition"
          >
            Return Everyone to Lobby
          </button>
        </div>
      </div>
    );
  }

  function renderHostActionModal() {
    if (!hostAction) return null;

    return (
      <div
        onClick={() => setHostAction(null)}
        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl"
        >
          <h2 className="text-2xl font-bold text-center mb-3">
            {hostAction === "end-game"
              ? "End Game?"
              : "Return Everyone?"}
          </h2>

          <p className="text-sm text-gray-400 text-center mb-6">
            {hostAction === "end-game"
              ? "This will immediately end the current game for everyone."
              : "This will cancel the current game and send everyone back to the lobby."}
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setHostAction(null)}
              className="flex-1 bg-zinc-700 hover:bg-zinc-600 px-4 py-3 rounded-xl transition"
            >
              Cancel
            </button>

            <button
              onClick={() => {
                if (hostAction === "end-game") {
                  socket.emit("host-end-game", {
                    code,
                  });
                } else {
                  socket.emit(
                    "host-return-everyone",
                    { code }
                  );
                }

                setHostAction(null);
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold transition ${
                hostAction === "end-game"
                  ? "bg-red-700 hover:bg-red-600"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {hostAction === "end-game"
                ? "End Game"
                : "Return Everyone"}
            </button>
          </div>
        </div>
      </div>
    );
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
        {renderHostControls()}
        {renderHostActionModal()}
      </main>
    );
  }

  if (gameState.phase === "voting") {
    return (
      <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-4 overflow-x-hidden">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 text-center">
          Voting
        </h1>

        <p className="text-lg text-gray-400 mb-2 text-center">
          Who do you think is the Imposter?
        </p>

        <p className="text-sm text-gray-500 mb-6">
          Round {gameState.round}
        </p>
        
        <div className="mb-6 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-center">
          <p className="text-sm text-gray-400">
            Votes Submitted
          </p>

          <p className="text-2xl font-bold mt-1">
            {Object.keys(gameState.votes || {}).length}
            {" / "}
            {activePlayers.length}
          </p>
        </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {gameState.players
          .filter(
            (player) =>
              !eliminatedPlayers.includes(player.id) &&
              player.connected !== false &&
              player.id !== playerId
          )
          .map((player) => (
            <button
              key={player.id}
              onClick={() => setSelectedVote(player.id)}
              disabled={hasSubmittedVote}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 ${
                hasSubmittedVote
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-zinc-700 hover:scale-[1.02]"
              } ${
                selectedVote === player.id
                  ? "bg-blue-600 border-blue-400 ring-2 ring-blue-400/40"
                  : "bg-zinc-800 border-zinc-700"
              }`}
            >
              <span className="font-medium">
                {player.name}
              </span>

              {selectedVote === player.id && (
                <span className="text-sm">
                  ✓ Selected
                </span>
              )}
            </button>
          ))}

          <button
            onClick={() => setSelectedVote("skip")}
            disabled={hasSubmittedVote}
            className={`mt-2 px-4 py-3 rounded-xl border border-dashed transition-all duration-200 ${
              hasSubmittedVote
                ? "cursor-not-allowed opacity-60"
                : "hover:bg-yellow-500/10"
            } ${
              selectedVote === "skip"
                ? "bg-yellow-500/20 border-yellow-400 text-yellow-300"
                : "bg-zinc-900 border-zinc-600 text-gray-300"
            }`}
          >
            {selectedVote === "skip"
              ? "✓ Skip Selected"
              : "Skip Vote"}
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
        {renderHostControls()}
        {renderHostActionModal()}
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

        {!showRevealedRole ? (
          <p className="mt-8 text-lg text-gray-500">
            Revealing role...
          </p>
        ) : (
          <p
            className={`mt-8 text-3xl sm:text-5xl font-bold ${
              gameState.votedPlayerRole === "imposter"
                ? "text-red-500"
                : "text-green-400"
            }`}
          >
            {gameState.votedPlayerRole === "imposter"
              ? "THE IMPOSTER"
              : "INNOCENT"}
          </p>
        )}
        {renderHostControls()}
        {renderHostActionModal()}
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

        {gameState.endReason === "host-ended" ? (
          <div className="text-center mb-8">
            <p className="text-2xl font-bold text-yellow-400">
              Game Ended by Host
            </p>

            <p className="mt-2 text-gray-400">
              The game was ended early.
            </p>
          </div>
        ) : (
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
          </div>
        )}

        {gameState.endReason !== "host-ended" && (
          <p
            className={`text-4xl font-bold ${
              gameState.innocentsWin
                ? "text-green-500"
                : "text-red-500"
            }`}
          >
            {gameState.innocentsWin
              ? "Innocents Win!"
              : imposters.length === 1
              ? "Imposter Wins!"
              : "Imposters Win!"}
          </p>
        )}

        <div className="mt-8 mb-8 w-full max-w-sm">
          <h2 className="text-xl font-semibold text-center mb-3">
            Imposters
          </h2>

          <div className="flex flex-col gap-2">
            {imposters.map((player) => {
              const eliminated =
                eliminatedPlayers.includes(player.id);

              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    eliminated
                      ? "bg-zinc-800 text-zinc-500"
                      : "bg-red-950/40 border border-red-900"
                  }`}
                >
                  <span className="font-medium">
                    {player.name}
                  </span>

                  <span
                    className={
                      eliminated
                        ? "text-gray-500"
                        : "text-red-400"
                    }
                  >
                    {eliminated
                      ? "Eliminated"
                      : "Survived"}
                  </span>
                </div>
              );
            })}
          </div>
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
            {connectedGamePlayers.length}
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
          {!isCurrentPlayerEliminated && (
            <div className="mb-4 text-center">
              {/* Timer */}

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
          )}
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
                    eliminatedPlayers.includes(player.id)
                      ? "bg-zinc-900 text-zinc-500 line-through opacity-60"
                      : player.connected === false
                      ? "bg-zinc-900 text-zinc-500 opacity-60"
                      : index === gameState.currentTurn
                      ? "bg-blue-600 ring-2 ring-blue-400 scale-[1.03] animate-pulse"
                      : gameState.spokenPlayers.includes(index)
                      ? "bg-green-700"
                      : "bg-zinc-800"
                  }`}
                >
                  {player.name}
                  {player.connected === false &&
                    !eliminatedPlayers.includes(player.id) && (
                      <span className="ml-2 text-xs text-yellow-400">
                        Reconnecting...
                      </span>
                  )}
                  {eliminatedPlayers.includes(player.id) && (
                    <span className="ml-2 text-xs text-red-400">
                      Eliminated
                    </span>
                  )}
                  
                  {index === gameState.currentTurn && (
                    <span className="ml-2">
                      🎤 Speaking
                    </span>
                  )}

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

          {/* Role Card */}
          <div
            onClick={() => setCardOpened((current) => !current)}
            className="w-[85vw] max-w-80 h-44 sm:h-52 cursor-pointer [perspective:1000px]"
          >
            <div
              className={`
                relative
                w-full
                h-full
                transition-transform
                duration-500
                [transform-style:preserve-3d]
                ${
                  cardOpened
                    ? "[transform:rotateY(180deg)]"
                    : ""
                }
              `}
            >
              {/* FRONT - Closed Envelope */}
              <div className="absolute inset-0 [backface-visibility:hidden]">
                <div className="relative w-full h-full bg-zinc-900 border-4 border-zinc-700 rounded-2xl flex items-center justify-center shadow-xl overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-full border-t-[90px] border-t-zinc-800 border-l-[160px] border-l-transparent border-r-[160px] border-r-transparent" />

                  <div className="absolute bottom-0 left-0 w-full h-full border-b-[90px] border-b-zinc-800 border-l-[160px] border-l-transparent border-r-[160px] border-r-transparent" />

                  <div className="z-10 text-center">
                    <h2 className="text-2xl sm:text-3xl font-bold">
                      Top Secret
                    </h2>

                    <p className="mt-2 text-sm text-gray-400">
                      Tap to reveal
                    </p>
                  </div>
                </div>
              </div>

              {/* BACK - Role / Word */}
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="w-full h-full bg-white text-black border-4 border-zinc-300 rounded-2xl flex flex-col items-center justify-center text-center shadow-xl px-4">
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
                      <div>
                        <p className="text-xl sm:text-2xl font-bold text-red-600">
                          You are the Imposter
                        </p>

                        <p className="mt-2 text-sm text-gray-500">
                          Blend in.
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="text-3xl sm:text-4xl font-bold">
                      {gameState.word}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {isCurrentPlayerEliminated && (
            <div className="mb-4 w-full max-w-80 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-center">
              <p className="font-semibold text-red-300">
                You have been eliminated
              </p>

              <p className="mt-1 text-sm text-gray-400">
                You can continue watching the game.
              </p>
            </div>
          )}

          {/* Finish Turn */}
          <button
            onClick={nextTurn}
            disabled={
              isCurrentPlayerEliminated ||
              gameState.players[gameState.currentTurn]?.id !==
                playerId
            }
            className={`mt-6 w-full max-w-80 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
              isCurrentPlayerEliminated
                ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                : gameState.players[gameState.currentTurn]?.id === playerId
                ? "bg-blue-600 hover:bg-blue-500 hover:scale-105 ring-2 ring-blue-400"
                : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
            >
          {isCurrentPlayerEliminated
            ? "Spectating"
            : gameState.players[gameState.currentTurn]?.id === playerId
            ? "Finish Turn"
            : `Waiting for ${
                gameState.players[gameState.currentTurn]?.name
              }`}
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

          {/* Host Controls */}
          {renderHostControls()}
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
      {renderHostActionModal()}

    </main>
  );
}