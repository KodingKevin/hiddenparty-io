import { Server } from "socket.io";

// Stores all active lobbies
const lobbies: Record<string, any> = {};

export function setupSocket(server: any) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("get-lobby", ({ code }) => {
    if (!lobbies[code]) {
        lobbies[code] = {
        players: [],
        settings: {},
        };
    }

    socket.join(code);

    socket.emit("lobby-update", lobbies[code]);
    });

    // Joining a lobby
    socket.on("join-lobby", ({ code, playerName }) => {
    if (!lobbies[code]) {
        lobbies[code] = {
        players: [],
        settings: {},
        };
    }

    const existingPlayer = lobbies[code].players.find(
        (player: any) => player.id === socket.id
    );

    if (existingPlayer) {
        existingPlayer.name =
        playerName?.trim() || existingPlayer.name;
    } else {
        const playerNumber = lobbies[code].players.length + 1;

        lobbies[code].players.push({
        id: socket.id,
        name: playerName?.trim() || `Player ${playerNumber}`,
        isReady: false,
        isHost: lobbies[code].players.length === 0,
        });
    }

    socket.join(code);

    io.to(code).emit("lobby-update", lobbies[code]);

    console.log(lobbies);
    });

    //to sync up settings through the server
    socket.on("update-settings", ({code, settings}) => {
        const lobby = lobbies[code];

        if(!lobby) return;

        lobby.settings = settings;

        io.to(code).emit("lobby-update", lobby);
    });

    // Toggle ready status
    socket.on("toggle-ready", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const player = lobby.players.find(
        (player: any) => player.id === socket.id
      );

      if (!player) return;

      player.isReady = !player.isReady;

      io.to(code).emit("lobby-update", lobby);
    });

    //game start
    socket.on("start-game", ({ code }) => {
        const lobby = lobbies[code];

        if (!lobby) return;

        const players = lobby.players;

        if (players.length < 3) return;

        const categories = {
          Food: ["Pizza", "Burger", "Taco"],
          Animals: ["Tiger", "Elephant", "Panda"],
          Movies: ["Shrek", "Titanic", "Avatar"],
        };

        const categoryNames = Object.keys(categories);

        const randomCategory = categoryNames[Math.floor(Math.random() * categoryNames.length)];

        const words = categories[randomCategory as keyof typeof categories];

        const randomWord = words[Math.floor(Math.random() * words.length)];

        const imposterIndex = Math.floor(Math.random() * players.length);

        lobby.gameStarted = true;
        lobby.gameState = {
          mode : lobby.settings?.mode || "imposter",
          category: randomCategory,
          word: randomWord,
          players: players.map((player: any, index: number) => ({
            ...player,
            role: index === imposterIndex ? "imposter" : "crewmate",
          })),
        };

        io.to(code).emit("game-started", lobby);
    });

    // Disconnect handling
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      for (const code in lobbies) {
        lobbies[code].players = lobbies[code].players.filter(
          (player: any) => player.id !== socket.id
        );

        io.to(code).emit("lobby-update", lobbies[code]);
      }
    });
  });

  return io;
}