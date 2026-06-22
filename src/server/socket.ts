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
        location: "lobby",
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

        const imposterMode = lobby.settings?.imposter?.imposterMode || "no-word";

        const similarWord = words.find((word) => word !== randomWord) || "Mystery";


        lobby.gameStarted = true;
        lobby.gameState = {
          mode : lobby.settings?.mode || "imposter",
          category: randomCategory,
          word: randomWord,
          imposterMode,
          imposterWord: similarWord,
          phase: "discussion",
          currentTurn: 0,
          round: 1,
          players: players.map((player: any, index: number) => ({
            ...player,
            location:"game",
            role: index === imposterIndex ? "imposter" : "crewmate",
          })),
        };
      io.to(code).emit("game-started", lobby);
    })
    
    //next turn event
    socket.on("next-turn", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;

      const totalPlayers = lobby.gameState.players.length;

      lobby.gameState.currentTurn += 1;

      if (lobby.gameState.currentTurn >= totalPlayers){
        lobby.gameState.phase = "voting";
        lobby.gameState.currentTurn = 0;

        io.to(code).emit("lobby-update", lobby);
        return;
      }

      io.to(code).emit("lobby-update", lobby);
    });

    //players sumbitting their votes at the voting phase
    socket.on("submit-vote", ({ code, vote })=>{
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;

      if (!lobby.gameState.votes){
        lobby.gameState.votes = {};
      }

      lobby.gameState.votes[socket.id] = vote;

      const voteCount = Object.keys(lobby.gameState.votes).length;
      const totalPlayers = lobby.gameState.players.length;

      if (voteCount >= totalPlayers){
        lobby.gameState.phase = "results";
      }
      io.to(code).emit("lobby-update", lobby);
    });

    //return to lobby
    socket.on("return-to-lobby", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const player = lobby.players.find(
        (player : any) => player.id === socket.id
      );

      if (!player) return;
      
      player.location = "lobby";
      player.isReady = false;

      io.to(code).emit("lobby-update", lobby);
    })
    
    // Disconnect handling
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      for (const code in lobbies) {
        const leavingPlayer = lobbies[code].players.find(
          (player: any) => player.id === socket.id
        );
        if (leavingPlayer?.isHost){
          lobbies[code].gameStarted = false;
          lobbies[code].gameState = null;

          lobbies[code].players = lobbies[code].players.map((player: any) => ({
            ...player,
            isReady: false,
            location: "lobby"
          }));
        }

        lobbies[code].players = lobbies[code].players.filter(
          (player: any) => player.id !== socket.id
        );

        io.to(code).emit("lobby-update", lobbies[code]);
      }
    });
  });

  return io;
}