"use client"; 
// Tells Next.js this page should run in the browser.
// Needed for interactivity like buttons, state, and inputs.

import { use, useEffect, useRef, useState } from "react";
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
    waitingForNextGame?: boolean;
  };

  type ChatMessage = {
    id: string;
    playerId: string;
    playerName: string;
    message: string;
    timestamp: number;
  }

  const [chatMessages, setChatMessages] =
    useState<ChatMessage[]>([]);

  const [chatInput, setChatInput] =
    useState("");

  const chatBottomRef = useRef<HTMLDivElement | null>(null);

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
  
  //number of imposters
  const [imposterCount, setImposterCount] = useState(1);

  //timer setting
  const [turnTime, setTurnTime] = useState(45);

  //chat setting
  const [chatEnabled, setChatEnabled] = useState(true);

  //lock lobby state
  const [lobbyLocked, setLobbyLocked] = useState(false);

  //transfer host role
  const [hostTransferTarget, setHostTransferTarget] = useState<Player | null>(null);

  //kick players
  const [kickTarget, setKickTarget] = useState<Player | null>(null);
      
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

      if (lobby.chatMessages){
        setChatMessages(lobby.chatMessages);
      }

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

        setTurnTime(
          lobby.settings.imposter?.turnTime || 45
        );

        setRoleCount(
          lobby.settings.socialDeduction?.roleCount || 2
        );

        setChatEnabled(
          lobby.settings?.chatEnabled ?? true
        );
      }

      if (lobby.settings?.categories) {
        setSelectedCategories(
          lobby.settings.categories
        );
      }

      setLobbyLocked(Boolean(lobby.locked));
    });

    socket.on("lobby-locked", () => {
      router.push("/");
    });

    socket.on("kicked-from-lobby", () => {
      router.push("/");
    });

    socket.on("chat-message", (message) => {
      setChatMessages((current) => [
        ...current,
        message,
      ]);
    });

    socket.on("game-started", (lobby) => {
      console.log("Game started!", lobby);
      router.push(`/game/${code}`);
    });

    return () => {
      socket.off("lobby-update");
      socket.off("game-started");
      socket.off("kicked-from-lobby");
      socket.off("lobby-locked");
      socket.off("chat-message");
    };
  }, [code, router]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [chatMessages]);

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

    function kickPlayer(targetPlayerId: string) {
      if (!isHost) return;

      socket.emit("kick-player", {
        code,
        targetPlayerId,
      });
    }

    function transferHost(targetPlayerId: string) {
      if (!isHost) return;

      socket.emit("transfer-host", {
        code,
        targetPlayerId,
      });
    }

    function toggleLobbyLock() {
      if (!isHost) return;

      socket.emit("toggle-lobby-lock", {
        code,
      });
    }

    function sendChatMessage() {
      const message = chatInput.trim();

      if (!message || !chatEnabled) return;

      socket.emit("send-chat-message", {
        code,
        message,
      });

      setChatInput("");
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

  const connectedPlayers = players.filter(
    (player) =>
      player.connected !== false &&
      !player.waitingForNextGame
  );

  const totalConnectedPlayers = players.filter(
    (player) => player.connected !== false
  );

  const maxSelectableImposters = Math.max(
    1,
    Math.min(
      3,
      connectedPlayers.length - 1
    )
  );

  const allPlayersReady =
    connectedPlayers.length > 0 &&
    connectedPlayers.every(
      (player) => player.isReady
    );

  const canStartGame =
    Boolean(isHost) &&
    connectedPlayers.length >= 3 &&
    allPlayersReady &&
    selectedCategories.length > 0;

  let startMessage = "";

  if (!isHost) {
    startMessage = "Only the host can start the game";
  } else if (connectedPlayers.length < 3) {
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
      turnTime,
    },

    chatEnabled,

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
      return;
    }

    socket.emit("start-game", {
      code
    });
  }
  // JSX = HTML-like UI returned by the component.
  return (
    <main className="relative min-h-dvh bg-black text-white p-4 sm:p-6 overflow-x-hidden">
      <div className="w-full flex justify-center mb-8">
          <button
              onClick={() => navigator.clipboard.writeText(code)}
              className="
                inline-flex
                items-center
                gap-3
                bg-zinc-900
                border
                border-zinc-700
                rounded-2xl
                px-8
                py-4
                hover:border-blue-500
                transition
              "
          >
              📋

              <span className="text-4xl sm:text-5xl font-mono font-bold tracking-widest">
                  {code}
              </span>
          </button>
      </div>

        {/* Centered Game Mode and controls */}
        <div className="w-full max-w-xl mx-auto">

          {/* Game settings */}
          <section className="w-full bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <h2 className="text-xl font-semibold mb-4">
              Game Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Game Mode */}
              <div>
                <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
                  Game Mode
                </label>

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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base outline-none hover:border-zinc-500 transition"
                >
                  <option value="imposter">Imposter</option>
                  <option value="mafia">Mafia</option>
                  <option value="werewolf">Werewolf</option>
                </select>
              </div>

              {/* Imposter Mode */}
              {gameMode === "imposter" && (
                <div>
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
                          turnTime,
                        },
                      });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base outline-none hover:border-zinc-500 transition"
                  >
                    <option value="no-word">No Word</option>
                    <option value="similar-word">
                      Similar Word
                    </option>
                  </select>
                </div>
              )}

              {/* Number of Imposters */}
              {gameMode === "imposter" && (
                <div>
                  <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
                    Number of Imposters
                  </label>

                  <select
                    disabled={!isHost}
                    value={imposterCount}
                    onChange={(e) => {
                      const newCount = Number(e.target.value);
                      setImposterCount(newCount);

                      updateSettings({
                        ...gameSettings,
                        imposter: {
                          imposterMode,
                          imposterCount: newCount,
                          turnTime,
                        },
                      });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base outline-none hover:border-zinc-500 transition"
                  >
                      {Array.from(
                        { length: maxSelectableImposters },
                        (_, index) => index + 1
                      ).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {gameMode === "imposter" && (
                <div>
                  <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
                    Turn Timer
                  </label>

                  <select
                    disabled={!isHost}
                    value={turnTime}
                    onChange={(e) => {
                      const newTurnTime = Number(e.target.value);

                      setTurnTime(newTurnTime);

                      updateSettings({
                        ...gameSettings,
                        imposter: {
                          ...gameSettings.imposter,
                          turnTime: newTurnTime,
                        },
                      });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base outline-none hover:border-zinc-500 transition"
                  >
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                    <option value={120}>120 seconds</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
                  Lobby Chat
                </label>

                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => {
                    const newValue = !chatEnabled;

                    setChatEnabled(newValue);

                    updateSettings({
                      ...gameSettings,
                      chatEnabled: newValue,
                    });
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm sm:text-base transition ${
                    chatEnabled
                      ? "bg-green-700 border-green-500 hover:bg-green-600"
                      : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                  }`}
                >
                  {chatEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              {/* Categories */}
              <div>
                <label className="block mb-1 text-xs uppercase tracking-wide text-gray-500">
                  Categories
                </label>

                <button
                  type="button"
                  disabled={!isHost}
                  onClick={openCategoryModal}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base hover:border-blue-500 transition"
                >
                  <div className="flex justify-between items-center gap-2">
                    <span>Choose Categories</span>

                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {selectedCategories.length} selected
                    </span>
                  </div>
                </button>
              </div>

            </div>

            {(gameMode === "mafia" ||
              gameMode === "werewolf") && (
              <div className="mt-4">
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base"
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
              disabled={
                !currentPlayerName ||
                currentPlayer?.connected === false ||
                currentPlayer?.waitingForNextGame
              }
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
                disabled:bg-zinc-700
                disabled:text-zinc-400
                disabled:cursor-not-allowed
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
                  {connectedPlayers.filter(
                    (player) => player.isReady
                  ).length}{" "}
                  / {connectedPlayers.length}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Upper-right player list */}
        <div className="w-full mt-6 lg:mt-0 lg:fixed lg:top-6 lg:right-6 lg:w-72">
          <section className="w-full bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">
              Players
            </h2>

            <span className="text-sm text-gray-400">
              {totalConnectedPlayers.length}
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

                  {player.waitingForNextGame &&
                    player.connected !== false && (
                      <span className="inline-block mt-1 text-[10px] text-yellow-400">
                        Waiting for next game
                      </span>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  {player.isReady &&
                    !player.waitingForNextGame && (
                      <span className="text-[10px] bg-green-500 text-black px-2 py-1 rounded-full">
                        Ready
                      </span>
                  )}

                  {player.isHost && (
                    <span className="text-[10px] bg-blue-500 text-black px-2 py-1 rounded-full">
                      👑 Host
                    </span>
                  )}

                  {isHost &&
                    !player.isHost &&
                    player.id !== playerId &&
                    !player.waitingForNextGame &&
                    player.connected !== false && (
                    <>
                      <button
                        onClick={() => setHostTransferTarget(player)}
                        className="text-[10px] bg-yellow-500 text-black hover:bg-yellow-400 px-2 py-1 rounded-full transition"
                      >
                        Make Host
                      </button>

                      <button
                        onClick={() => setKickTarget(player)}
                        className="text-[10px] bg-red-600 hover:bg-red-500 px-2 py-1 rounded-full transition"
                      >
                        Kick
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* Lock Lobby */}
        {isHost && (
          <button
            onClick={toggleLobbyLock}
            className={`mt-3 w-full rounded-xl py-3 font-semibold transition ${
              lobbyLocked
                ? "bg-yellow-600 hover:bg-yellow-500"
                : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            }`}
          >
            {lobbyLocked
              ? "🔒 Lobby Locked"
              : "🔓 Lock Lobby"}
          </button>
        )}

        {/* Lobby Chat */}
        {chatEnabled && (
          <section className="mt-3 w-full bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                Lobby Chat
              </h2>

              <span className="text-xs text-gray-500">
                {chatMessages.length}
              </span>
            </div>

            <div className="h-52 overflow-y-auto flex flex-col gap-2 pr-1 mb-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-gray-500 text-center mt-8">
                  No messages yet.
                </p>
              ) : (
                chatMessages.map((chatMessage) => (
                  <div
                    key={chatMessage.id}
                    className={`rounded-xl px-3 py-2 ${
                      chatMessage.playerId === playerId
                        ? "bg-blue-600/20 border border-blue-500/30"
                        : "bg-zinc-800"
                    }`}
                  >
                    <p className="text-xs text-gray-400 mb-1">
                      {chatMessage.playerName}
                    </p>

                    <p className="text-sm break-words">
                      {chatMessage.message}
                    </p>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                maxLength={200}
                placeholder="Send a message..."
                onChange={(e) =>
                  setChatInput(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendChatMessage();
                  }
                }}
                className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"
              />

              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim()}
                className="shrink-0 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 rounded-xl text-sm font-semibold transition"
              >
                Send
              </button>
            </div>

            <p className="mt-2 text-[10px] text-right text-gray-600">
              {chatInput.length} / 200
            </p>
          </section>
        )}
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
                    className={`
                      px-3
                      py-3
                      min-h-[64px]
                      rounded-xl
                      border
                      flex
                      items-center
                      justify-center
                      text-center
                      leading-tight
                      transition-all
                      duration-200
                      ${
                        selected
                          ? "bg-blue-600 border-blue-400 hover:bg-blue-500 hover:scale-105"
                          : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-blue-500 hover:scale-105"
                      }
                    `}
                  >
                  {category === "WeatherAndNature"
                    ? "Weather & Nature"
                    : category}
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
      {hostTransferTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-3">
              Transfer Host
            </h2>

            <p className="text-gray-400 mb-6">
              Make{" "}
              <span className="text-white font-semibold">
                {hostTransferTarget.name}
              </span>{" "}
              the new host?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setHostTransferTarget(null)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 rounded-xl py-3 transition"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  transferHost(hostTransferTarget.id);
                  setHostTransferTarget(null);
                }}
                className="flex-1 bg-yellow-500 text-black hover:bg-yellow-400 rounded-xl py-3 font-semibold transition"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {kickTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-3">
              Kick Player
            </h2>

            <p className="text-gray-400 mb-6">
              Remove{" "}
              <span className="text-white font-semibold">
                {kickTarget.name}
              </span>{" "}
              from the lobby?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setKickTarget(null)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 rounded-xl py-3 transition"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  kickPlayer(kickTarget.id);
                  setKickTarget(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-3 font-semibold transition"
              >
                Kick
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}