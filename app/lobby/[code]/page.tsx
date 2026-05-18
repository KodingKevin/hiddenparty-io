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
  };

const [players, setPlayers] = useState<Player[]>([]);

  // Stores the text currently typed into the input box.
  const [playerName, setPlayerName] = useState("");
  
  //stores the updated name into the box
  const [currentPlayerName, setCurrentPlayerName] = useState("");

  useEffect(() => {
    //connects to socket server
    socket.connect();
    
    socket.emit("get-lobby", {
      code,
    });

    //auto joins
    socket.emit("join-lobby", {
      code,
      playerName: "",
    });

    // Listen for lobby updates
    socket.on("lobby-update", (lobby) =>{
      console.log("Lobby updated:", lobby);
      setPlayers(lobby.players);
      const currentPlayerData = lobby.players.find(
        (player: Player) => player.id === socket.id
      );

      if (currentPlayerData) {
        setCurrentPlayerName(currentPlayerData.name);
      }

      if (lobby.settings?.mode){
        setGameMode(lobby.settings.mode);
        setImposterMode(lobby.settings.imposter.imposterMode);
        setRoleCount(lobby.settings.socialDeduction.roleCount);
      }
    });

    //cleanup
    return () => {
      socket.off("lobby-update");
      socket.off("game-started");
    };
  }, [code]);
  // Stores the currently selected game mode
  const [gameMode, setGameMode] = useState("imposter");

  //imposter setting
  const [imposterMode, setImposterMode] = useState("no-word");

  //Mafia/werewolf settings
  const [roleCount, setRoleCount] = useState(2);

  // Runs when the Join button is clicked.
    function addPlayer() {
    const trimmedName = playerName.trim();

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

    socket.on("game-started", (lobby) => {
      console.log("Game started!", lobby);
    });

    socket.on("game-started", () => {
      router.push( `/game/${code}`);
    });
  }

  // Finds the current player's object in the players array
  const currentPlayer = players.find(
    (player) => player.name === currentPlayerName
  );

  const isHost = currentPlayer?.isHost;

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
    if (!isHost) return;

    socket.emit("start-game", {
      code
    });
  }
  // JSX = HTML-like UI returned by the component.
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center py-20">
      
      {/* Lobby title */}
      <h1 className="text-5xl font-bold mb-4">
        Lobby
      </h1>

      {/* Displays the room code from the URL */}
      <div className="text-4xl font-mono bg-zinc-900 border border-zinc-700 px-8 py-4 rounded-2xl mb-10">
        {code}
      </div>

    {/* Game mode selection container */}
    <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">

    <h2 className="text-2xl font-semibold mb-4">
        Game Mode
    </h2>

    <select
        disabled={!isHost}
        value={gameMode}
        // Updates game mode when user selects an option
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
        <option value="imposter">
        Imposter
        </option>

        <option value="mafia">
        Mafia
        </option>

        <option value="werewolf">
        Werewolf
        </option>

    </select>
    {/* Imposter-specific settings */}
  {gameMode === "imposter" && (

    <div className="mt-6">

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
        <option value="no-word">
          No Word
        </option>

        <option value="similar-word">
          Similar Word
        </option>

      </select>

    </div>

  )}

  {/* Mafia/Werewolf role settings */}
  {(gameMode === "mafia" || gameMode === "werewolf") && (

    <div className="mt-6">

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
          socialDeduction:{
            roleCount: newRoleCount,
          },
        });
      }}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none"
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((number) => (
        <option key={number} value={number}>
          {number}
        </option>
      ))}
    </select>

    </div>

  )}
    </div>

      {/* Player list container */}
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        
        <h2 className="text-2xl font-semibold mb-4">
          Players
        </h2>

        {/* Loops through players array and creates UI for each player */}
        <div className="flex flex-col gap-3 mb-6">

          {players.map((player, index) => (

            <div
              key={index}
              className="bg-zinc-800 px-4 py-3 rounded-xl flex justify-between items-center"
            >
              <span>{player.name}</span>

            <div className="flex gap-2">
              {player.isReady && (
                <span className="text-xs bg-green-500 text-black px-2 py-1 rounded-full">
                  Ready
                </span>
              )}

              {player.isHost && (
                <span className="text-xs bg-blue-500 text-black px-2 py-1 rounded-full">
                  Host
                </span>
              )}
            </div>
            </div>
          ))}

        </div>

        {/* Input + Join button row */}
        <div className="flex gap-2">

        <input
        type="text"
        placeholder="Update your name"
        value={playerName}

        // Updates the text as the user types
        onChange={(e) => setPlayerName(e.target.value)}

        // Detects keyboard presses while focused on the input
        onKeyDown={(e) => {

            // If Enter was pressed
            if (e.key === "Enter") {

            // Run the same function as the Join button
            addPlayer();
            }
        }}

        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none"
        />

          <button
            // Runs addPlayer() when clicked
            onClick={addPlayer}

            className="bg-blue-600 px-5 rounded-xl hover:bg-blue-500"
          >
            Update
          </button>

        </div>
      </div>
      <button
        onClick={toggleReady}
        disabled={!currentPlayerName}
        className="mt-8 bg-blue-600 px-8 py-4 rounded-2xl text-xl hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-400"
      >
        {currentPlayer?.isReady ? "Unready" : "Ready"}
      </button>

      <button
        onClick={() => console.log(gameSettings)}
        className="mt-6 bg-zinc-700 px-8 py-4 rounded-2xl text-xl hover:bg-zinc-600"
        >
          View Game Setting
       </button>

      {/* Start game button */}
      <button  
        disabled={!isHost}
        onClick={startGame}
        className="mt-10 bg-blue-600 px-8 py-4 rounded-2xl text-xl hover:bg-green-500"
      >
        Start {gameMode} Game
      </button>

    </main>
  );
}