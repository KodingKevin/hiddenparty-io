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
        existingPlayer.name = playerName;
      } else {
        lobbies[code].players.push({
          id: socket.id,
          name: playerName,
          isReady: false,
        });
      }

      socket.join(code);

      io.to(code).emit("lobby-update", lobbies[code]);

      console.log(lobbies);
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