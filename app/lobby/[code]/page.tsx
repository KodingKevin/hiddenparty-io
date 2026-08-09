"use client"; 
// Tells Next.js this page should run in the browser.
// Needed for interactivity like buttons, state, and inputs.

import { use, useEffect, useState } from "react";
// useState -> lets the UI remember/change values
// use -> unwraps the Promise version of params in Next.js 16

import { socket } from "@/src/library/socket";

import { useRouter } from "next/navigation";

import { getPlayerId } from "@/src/library/playerId";

import { gameWords } from "@/src/library/gamewords";

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
    id: string;
    socketId?: string;
    name: string;
    isReady: boolean;
    isHost: boolean;
    location: string;
    connected?: boolean;
  };

  const [players, setPlayers] = useState<Player[]>([]);

  // Stores the text currently typed into the input box.
  const [playerName, setPlayerName] = useState("");
  
  //stores the updated name into the box
  const [currentPlayerName, setCurrentPlayerName] = useState("");

  //adds player ID state
  const [playerId, setPlayerId] = useState("");

  //limits the name size
  const max_name_length = 16;

  //Catagory List
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    Object.keys(gameWords)
  );

  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const [tempCategories, setTempCategories] = useState<string[]>(
    Object.keys(gameWords)
  );

  const [imposterCount, setImposterCount] = useState(1);

  useEffect(() => {
    const storedPlayerId = getPlayerId();

    setPlayerId(storedPlayerId);

    socket.connect();

    socket.emit("get-lobby", {
      code,
      playerId: storedPlayerId,
    });

    socket.emit("join-lobby", {
      code,
      playerName: "",
      playerId: storedPlayerId,
    });

    socket.on("lobby-update", (lobby) => {
      console.log("Lobby updated:", lobby);

      setPlayers(lobby.players);

      const currentPlayerData = lobby.players.find(
        (player: Player) =>
          player.id === storedPlayerId
      );

      if (currentPlayerData) {
        setCurrentPlayerName(currentPlayerData.name);
      }

      if (lobby.settings?.mode) {
        setGameMode(lobby.settings.mode);

        setImposterMode(
          lobby.settings.imposter?.imposterMode ||
            "no-word"
        );
        
        setImposterCount(
          lobby.settings.imposter?.imposterCount || 1
        );

        setRoleCount(
          lobby.settings.socialDeduction?.roleCount || 2
        );
      }

      if (lobby.settings?.categories){
        setSelectedCategories(lobby.settings.categories);
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

    if (!trimmedName || !playerId) return;

    const nameExists = players.some(
      (player) =>
        player.name.toLowerCase() === trimmedName.toLowerCase() &&
        player.id !== playerId
    );

    if (nameExists) {
        alert("Name already taken");
        return;
    }

    setCurrentPlayerName(trimmedName);

    socket.emit("join-lobby", {
      code,
      playerName: trimmedName,
      playerId,
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
    (player) => player.id === playerId
  );

  const isHost = currentPlayer?.isHost;

  const allPlayersReady = players.length > 0 && players.every((player) => player.isReady);

  const canStartGame = isHost && players.length >= 3 
                       && allPlayersReady&& selectedCategories.length > 0;

  let startMessage = "";

  if (!isHost) {
    startMessage = "Only the host can start the game";
  } else if (players.length < 3) {
    startMessage = "Need at least 3 players to start";
  } else if (!allPlayersReady) {
    startMessage = "All players must be ready";
  } else if (selectedCategories.length === 0) {
    startMessage = "Select at least one category";
  }

  const gameSettings = {
    mode: gameMode,
    players,
    categories: selectedCategories,
    imposter:{
      imposterMode,
      imposterCount,
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

  function openCategoryModal() {
    setTempCategories(selectedCategories);
    setShowCategoryModal(true);
  }

  function saveCategorySettings() {
    setSelectedCategories(tempCategories);

    updateSettings({
      ...gameSettings,
      categories: tempCategories,
    });

    setShowCategoryModal(false);
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
        <div className="w-full max-w-xl mx-auto">

          {/* Game settings */}
          <section className="w-full bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <h2 className="text-xl font-semibold mb-3">
              Game Settings
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
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-base outline-none hover:border-zinc-500 transition"
            >
              <option value="imposter">Imposter</option>
              <option value="mafia">Mafia</option>
              <option value="werewolf">Werewolf</option>
            </select>

            {gameMode === "imposter" && (
              <div className="mt-3">
                <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
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
                        imposterCount,
                      },
                    });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-base outline-none hover:border-zinc-500 transition"
                >
                  {[1, 2, 3].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                  <option value="no-word">No Word</option>
                  <option value="similar-word">
                    Similar Word
                  </option>
                </select>
              </div>
            )}

            <div className="mt-3">
              <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
                Categories
              </label>

              <button
                type="button"
                disabled={!isHost}
                onClick={openCategoryModal}
                className="
                w-full
                bg-zinc-800
                border
                border-zinc-700
                rounded-lg
                px-4
                py-2
                sm:py-2.5
                text-sm
                sm:text-base
                transition
                hover:border-blue-500
                "
              >
                <div className="w-full flex justify-between items-center">
                  <span>Choose Categories</span>

                  <span className="text-sm text-gray-400">
                    {selectedCategories.length} selected
                  </span>
                </div>
              </button>
            </div>

            {(gameMode === "mafia" ||
              gameMode === "werewolf") && (
              <div className="mt-5">
                <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-base outline-none hover:border-zinc-500 transition"
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
              disabled={!currentPlayerName || currentPlayer?.connected === false}
              className="
              inline-flex
              items-center
              justify-center
              px-8
              py-3
              rounded-xl
              bg-blue-600
              hover:bg-blue-500
              font-semibold
              mx-auto
              transition
              "
            >
              {currentPlayer?.isReady ? "Unready" : "Ready"}
            </button>

            {isHost ? (
              <>
                <button
                  onClick={startGame}
                  disabled={!canStartGame}
                  title={!canStartGame ? startMessage : ""}
                  className="
                    inline-flex
                    items-center
                    justify-center
                    px-8
                    py-3
                    rounded-xl
                    bg-green-600
                    hover:bg-green-500
                    font-semibold
                    mx-auto
                    transition
                    disabled:bg-zinc-700
                    disabled:text-zinc-400
                    disabled:cursor-not-allowed
                  "                
                  > 
                  Start Game
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
                className={`px-3 py-2 rounded-xl flex items-center gap-2 transition ${
                  player.connected === false
                    ? "bg-zinc-900 opacity-60"
                    : "bg-zinc-800"
                } ${
                  player.id === playerId
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

                  {player.id === playerId && (
                    <span className="inline-block mt-1 text-[10px] text-gray-400">
                      You
                    </span>
                  )}

                  {player.connected === false && (
                    <span className="inline-block mt-1 text-[10px] text-red-400">
                      Reconnecting...
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
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">

          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl p-6">

            <div className="flex justify-between items-center mb-5">
              <h2 className="text-2xl font-bold">
                Categories
              </h2>

              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-2xl text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

              {Object.keys(gameWords).map((category) => {

                const selected =
                  tempCategories.includes(category);

                return (
                  <button
                    key={category}
                    onClick={() => {
                      setTempCategories((current) =>
                        selected
                          ? current.filter(
                              (item) => item !== category
                            )
                          : [...current, category]
                      );
                    }}
                    className={`px-3 py-3 rounded-xl border ${
                      selected
                        ? "bg-blue-600 border-blue-400"
                        : "bg-zinc-800 border-zinc-700"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}

            </div>

            <div className="flex gap-3 mt-6">

              <button
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 bg-zinc-700 rounded-xl py-3"
              >
                Cancel
              </button>

              <button
                disabled={tempCategories.length === 0}
                onClick={saveCategorySettings}
                className="flex-1 bg-blue-600 rounded-xl py-3 disabled:bg-zinc-700"
              >
                Save Settings
              </button>

            </div>

          </div>

        </div>
      )}
    </main>
  );
}