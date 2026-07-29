"use client"; 
// Tells Next.js this page should run in the browser.
// Needed for interactivity like buttons, state, and inputs.

import { use, useEffect, useState } from "react";
// useState -> lets the UI remember/change values
// use -> unwraps the Promise version of params in Next.js 16

import { socket } from "@/src/library/socket";

import { useRouter } from "next/navigation";

// Defines the structure of the props passed into this page.
type LobbyPageProps = {
  // In Next.js 16, params is now a Promise.
  params: Promise<{
    code: string;
  }>;
};

// Main page component
export default function LobbyPage({ params }: LobbyPageProps) {

  // Extracts the room code from the params Promise.
  // Example URL:
  // /lobby/ABCDE
  // code = "ABCDE"
  const { code } = use(params);

  const router = useRouter();
  // React state for the list of players currently in the lobby.
  // players = current array
  // setPlayers = function used to update the array
  type Player = {
    id : string;
    name : string; 
    isReady : boolean;
    isHost : boolean;
    location: string;
  };

const [players, setPlayers] = useState<Player[]>([]);

  // Stores the text currently typed into the input box.
  const [playerName, setPlayerName] = useState("");
  
  //stores the updated name into the box
  const [currentPlayerName, setCurrentPlayerName] = useState("");

  //limits the name size
  const max_name_length = 16;

  useEffect(() => {
    socket.connect();

    socket.emit("get-lobby", {
      code,
    });

    socket.emit("join-lobby", {
      code,
      playerName: "",
    });

    socket.on("lobby-update", (lobby) => {
      console.log("Lobby updated:", lobby);

      setPlayers(lobby.players);

      const currentPlayerData = lobby.players.find(
        (player: Player) => player.id === socket.id
      );

      if (currentPlayerData) {
        setCurrentPlayerName(currentPlayerData.name);
      }

      if (lobby.settings?.mode) {
        setGameMode(lobby.settings.mode);
        setImposterMode(lobby.settings.imposter.imposterMode);
        setRoleCount(lobby.settings.socialDeduction.roleCount);
      }
    });

    socket.on("game-started", (lobby) => {
      console.log("Game started!", lobby);
      router.push(`/game/${code}`);
    });

    return () => {
      socket.off("lobby-update");
      socket.off("game-started");
    };
  }, [code, router]);
  // Stores the currently selected game mode
  const [gameMode, setGameMode] = useState("imposter");

  //imposter setting
  const [imposterMode, setImposterMode] = useState("no-word");

  //Mafia/werewolf settings
  const [roleCount, setRoleCount] = useState(2);

  // Runs when the Join button is clicked.
    function addPlayer() {
    const trimmedName = playerName.trim().slice(0, max_name_length);

    if (!trimmedName) return;

    const nameExists = players.some(
        (player) =>
        player.name.toLowerCase() === trimmedName.toLowerCase() &&
        player.name.toLowerCase() !== currentPlayerName.toLowerCase()
    );

    if (nameExists) {
        alert("Name already taken");
        return;
    }

    setCurrentPlayerName(trimmedName);
    socket.emit("join-lobby", {
      code,
      playerName: trimmedName,
    });
    localStorage.setItem(`hiddenparty-name-${code}`, trimmedName);
    setPlayerName("");
    }

    function toggleReady() {
    if (!currentPlayerName) return;

    socket.emit("toggle-ready", {
      code,
    });

  }

  // Finds the current player's object in the players array
  const currentPlayer = players.find(
    (player) => player.name === currentPlayerName
  );

  const isHost = currentPlayer?.isHost;

  const allPlayersReady = players.length > 0 && players.every((player) => player.isReady);

  const canStartGame = isHost && players.length >= 3 && allPlayersReady;

  let startMessage = "";

  if (!isHost){
    startMessage = "Only the host can start the game";
  } else if (players.length < 3){
    startMessage = "Need at least 3 players to start";
  } else if (!allPlayersReady){
    startMessage = "All players must be ready";
  }
  const gameSettings = {
    mode: gameMode,
    players,
    imposter:{
      imposterMode,
    },
    socialDeduction:{
      roleCount,
    },
  };

  function updateSettings(newSetting : typeof gameSettings){
    if (!isHost) return;

    socket.emit("update-settings", {
      code,
      settings: newSetting,
    });
  }

  function startGame(){
    if (!canStartGame){
      alert(startMessage);
      return;
    }

    socket.emit("start-game", {
      code
    });
  }
  // JSX = HTML-like UI returned by the component.
  return (
    <main className="relative min-h-dvh bg-black text-white p-4 sm:p-6 overflow-x-hidden">
      <div className="w-full">

        {/* Centered title and room code */}
        <div className="text-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold">
            Lobby
          </h1>

          <div className="mt-3 inline-block bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-3">
            <p className="text-2xl sm:text-3xl font-mono">
              {code}
            </p>
          </div>
        </div>

        {/* Centered Game Mode and controls */}
        <div className="w-full max-w-2xl mx-auto">

          {/* Game settings */}
          <section className="w-full bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h2 className="text-2xl font-semibold mb-4">
              Game Mode
            </h2>

            <select
              disabled={!isHost}
              value={gameMode}
              onChange={(e) => {
                const newMode = e.target.value;

                setGameMode(newMode);

                updateSettings({
                  ...gameSettings,
                  mode: newMode,
                });
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none"
            >
              <option value="imposter">Imposter</option>
              <option value="mafia">Mafia</option>
              <option value="werewolf">Werewolf</option>
            </select>

            {gameMode === "imposter" && (
              <div className="mt-5">
                <label className="block mb-2 text-sm text-gray-400">
                  Imposter Mode
                </label>

                <select
                  disabled={!isHost}
                  value={imposterMode}
                  onChange={(e) => {
                    const newImposterMode = e.target.value;

                    setImposterMode(newImposterMode);

                    updateSettings({
                      ...gameSettings,
                      imposter: {
                        imposterMode: newImposterMode,
                      },
                    });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none"
                >
                  <option value="no-word">No Word</option>
                  <option value="similar-word">
                    Similar Word
                  </option>
                </select>
              </div>
            )}

            {(gameMode === "mafia" ||
              gameMode === "werewolf") && (
              <div className="mt-5">
                <label className="block mb-2 text-sm text-gray-400">
                  Special Roles
                </label>

                <select
                  disabled={!isHost}
                  value={roleCount}
                  onChange={(e) => {
                    const newRoleCount = Number(e.target.value);

                    setRoleCount(newRoleCount);

                    updateSettings({
                      ...gameSettings,
                      socialDeduction: {
                        roleCount: newRoleCount,
                      },
                    });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
                    (number) => (
                      <option key={number} value={number}>
                        {number}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
          </section>

          {/* Name and game controls */}
          <div className="w-full mt-6 flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Update your name"
                value={playerName}
                maxLength={max_name_length}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addPlayer();
                  }
                }}
                className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none"
              />

              <button
                onClick={addPlayer}
                className="shrink-0 bg-blue-600 px-5 rounded-xl hover:bg-blue-500"
              >
                Update
              </button>
            </div>

            <p className="text-xs text-right text-gray-500">
              {playerName.length} / {max_name_length}
            </p>

            <button
              onClick={toggleReady}
              disabled={!currentPlayerName}
              className="w-full bg-blue-600 px-6 py-3 rounded-xl text-lg font-semibold hover:bg-purple-500 transition disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed"
            >
              {currentPlayer?.isReady ? "Unready" : "Ready"}
            </button>

            {isHost ? (
              <>
                <button
                  onClick={startGame}
                  disabled={!canStartGame}
                  title={!canStartGame ? startMessage : ""}
                  className="w-full bg-green-600 px-6 py-3 rounded-xl text-lg font-semibold hover:bg-green-500 transition disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed"
                >
                  Start {gameMode} Game
                </button>

                {!canStartGame && (
                  <p className="text-sm text-center text-gray-400">
                    {startMessage}
                  </p>
                )}
              </>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-400">
                  Waiting for the host to start the game...
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Players ready:{" "}
                  {players.filter(
                    (player) => player.isReady
                  ).length}{" "}
                  / {players.length}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Upper-right player list */}
        <section className="w-full mt-6 lg:mt-0 lg:fixed lg:top-6 lg:right-6 lg:w-72 bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">
              Players
            </h2>

            <span className="text-sm text-gray-400">
              {players.length}
            </span>
          </div>

          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {players.map((player) => (
              <div
                key={player.id}
                className={`bg-zinc-800 px-3 py-2 rounded-xl flex items-center gap-2 ${
                  player.id === socket.id
                    ? "border border-blue-500"
                    : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium leading-tight break-all ${
                      player.name.length > 14
                        ? "text-xs"
                        : player.name.length > 10
                        ? "text-sm"
                        : "text-base"
                    }`}
                  >
                    {player.name}
                  </p>

                  {player.id === socket.id && (
                    <span className="inline-block mt-1 text-[10px] text-gray-400">
                      You
                    </span>
                  )}
                </div>

                <div className="shrink-0 flex gap-1">
                  {player.isReady && (
                    <span className="text-[10px] bg-green-500 text-black px-2 py-1 rounded-full">
                      Ready
                    </span>
                  )}

                  {player.isHost && (
                    <span className="text-[10px] bg-blue-500 text-black px-2 py-1 rounded-full">
                      Host
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}