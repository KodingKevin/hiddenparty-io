"use client"; 
// Tells Next.js this page should run in the browser.
// Needed for interactivity like buttons, state, and inputs.

import { use, useEffect, useState } from "react";
// useState -> lets the UI remember/change values
// use -> unwraps the Promise version of params in Next.js 16

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

  // React state for the list of players currently in the lobby.
  // players = current array
  // setPlayers = function used to update the array
const [players, setPlayers] = useState<string[]>([]);

  // Stores the text currently typed into the input box.
  const [playerName, setPlayerName] = useState("");
  
  //stores the updated name into the box
  const [currentPlayerName, setCurrentPlayerName] = useState("");

  useEffect(() => {
    const savedName = localStorage.getItem(`hiddenparty-name-${code}`);

    if (savedName) {
        setCurrentPlayerName(savedName);
        setPlayerName(savedName);
        setPlayers((oldPlayers) => {
        if (oldPlayers.includes(savedName)) return oldPlayers;
        return [...oldPlayers, savedName];
        });
     }
    }, [code]);
  // Stores the currently selected game mode
  const [gameMode, setGameMode] = useState("imposter");

  // Runs when the Join button is clicked.
    function addPlayer() {
    const trimmedName = playerName.trim();

    if (!trimmedName) return;

    const nameExists = players.some(
        (player) =>
        player.toLowerCase() === trimmedName.toLowerCase() &&
        player.toLowerCase() !== currentPlayerName.toLowerCase()
    );

    if (nameExists) {
        alert("Name already taken");
        return;
    }

    if (currentPlayerName) {
        setPlayers(
        players.map((player) =>
            player === currentPlayerName ? trimmedName : player
        )
        );
    } else {
        setPlayers([...players, trimmedName]);
    }

    setCurrentPlayerName(trimmedName);
    localStorage.setItem(`hiddenparty-name-${code}`, trimmedName);
    setPlayerName("");
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
        value={gameMode}

        // Updates game mode when user selects an option
        onChange={(e) => setGameMode(e.target.value)}

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
              // key helps React track list items efficiently
              className="bg-zinc-800 px-4 py-3 rounded-xl"
            >
              {player}
            </div>

          ))}

        </div>

        {/* Input + Join button row */}
        <div className="flex gap-2">

        <input
        type="text"
        placeholder="Enter Name"
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
            {currentPlayerName ? "Update" : "Join"}
          </button>

        </div>
      </div>

      {/* Start game button */}
      <button className="mt-10 bg-green-600 px-8 py-4 rounded-2xl text-xl hover:bg-green-500">
        Start {gameMode} Game
      </button>

    </main>
  );
}