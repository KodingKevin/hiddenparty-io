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

    // Joining a lobby
    socket.on("join-lobby", ({ code, playerName }) => {

      // Create lobby if it doesn't exist
      if (!lobbies[code]) {
        lobbies[code] = {
          players: [],
          settings: {},
        };
      }

      // Add player
      lobbies[code].players.push({
        id: socket.id,
        name: playerName,
      });

      // Join Socket.IO room
      socket.join(code);

      // Send updated lobby to everyone
      io.to(code).emit("lobby-update", lobbies[code]);

      console.log(lobbies);
    });

    // Disconnect handling
    socket.on("disconnect", () => {

      console.log("User disconnected:", socket.id);

      for (const code in lobbies) {

        lobbies[code].players =
          lobbies[code].players.filter(
            (player: any) => player.id !== socket.id
          );

        io.to(code).emit("lobby-update", lobbies[code]);
      }
    });

  });

  return io;
}