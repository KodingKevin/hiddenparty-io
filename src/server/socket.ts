import { Server } from "socket.io";

import { gameWords } from "../library/gamewords";
// Stores all active lobbies
const lobbies: Record<string, any> = {};

//helper function to assist with voting logic
type VoteResult = {
  voter: string;
  target: string;
};

function startNextRound(
  lobby: any,
  roundMessage: string,
  voteResults: VoteResult[]
) {
  const activePlayers =
    getActivePlayers(lobby.gameState);

  lobby.gameState.round += 1;
  lobby.gameState.phase = "discussion";

  const randomActivePlayer =
    activePlayers[
      Math.floor(Math.random() * activePlayers.length)
    ];

  lobby.gameState.currentTurn =
    lobby.gameState.players.findIndex(
      (player: any) =>
        player.id === randomActivePlayer.id
    );
  lobby.gameState.spokenPlayers = [];
  lobby.gameState.votes = {};

  lobby.gameState.roundMessage = roundMessage;
  lobby.gameState.voteResults = voteResults;
}

function getActivePlayers(gameState: any) {
  const eliminatedPlayers =
    gameState.eliminatedPlayers || [];

  return gameState.players.filter(
    (player: any) =>
      !eliminatedPlayers.includes(player.id)
  );
}

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
        locked: false,  
        };
    }

    socket.join(code);

    socket.emit("lobby-update", lobbies[code]);
    });

    // Joining a lobby
    socket.on(
      "join-lobby",
      ({ code, playerName, playerId }) => {
        if (!lobbies[code]) {
          lobbies[code] = {
            players: [],
            settings: {},
          };
        }

        if (!playerId) return;

        const lobby = lobbies[code];

        const existingPlayer = lobby.players.find(
          (player: any) => player.id === playerId
        );

        if (lobby.locked && !existingPlayer) {
          socket.emit("lobby-locked");
          return;
        }

        if (existingPlayer) {
          existingPlayer.name =
            playerName?.trim() || existingPlayer.name;

          existingPlayer.socketId = socket.id;
          existingPlayer.connected = true;

          if (lobby.gameState?.players) {
            const existingGamePlayer =
              lobby.gameState.players.find(
                (player: any) =>
                  player.id === playerId
              );

            if (existingGamePlayer) {
              existingGamePlayer.socketId = socket.id;
              existingGamePlayer.connected = true;
              existingGamePlayer.name =
                existingPlayer.name;
            }
          }
        } else {
          const playerNumber =
            lobby.players.length + 1;

          lobby.players.push({
            id: playerId,
            socketId: socket.id,
            name:
              playerName?.trim() ||
              `Player ${playerNumber}`,
            isReady: false,
            isHost: lobby.players.length === 0,
            location: "lobby",
            connected: true,
          });
        }

        socket.join(code);

        io.to(code).emit(
          "lobby-update",
          lobby
        );

        console.log(lobbies);
      }
    );

    // Sync settings through the server
    socket.on("update-settings", ({ code, settings }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      lobby.settings = settings;

      io.to(code).emit("lobby-update", lobby);
    });

    //host control to kick a player
    socket.on("kick-player", ({ code, targetPlayerId }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const host = lobby.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!host?.isHost) return;

      const targetPlayer = lobby.players.find(
        (player: any) => player.id === targetPlayerId
      );

      if (!targetPlayer) return;
      if (targetPlayer.isHost) return;

      lobby.players = lobby.players.filter(
        (player: any) => player.id !== targetPlayerId
      );

      if (lobby.gameState?.players) {
        lobby.gameState.players =
          lobby.gameState.players.filter(
            (player: any) => player.id !== targetPlayerId
          );
      }

      if (targetPlayer.socketId) {
        io.to(targetPlayer.socketId).emit("kicked-from-lobby");
      }

      io.to(code).emit("lobby-update", lobby);
    });

    //Toggle lock lobby
    socket.on("toggle-lobby-lock", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const host = lobby.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!host?.isHost) return;

      lobby.locked = !lobby.locked;

      io.to(code).emit("lobby-update", lobby);
    });

    // Toggle ready status
    socket.on("toggle-ready", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const player = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!player) return;

      player.isReady = !player.isReady;

      io.to(code).emit("lobby-update", lobby);
    });

    //host control on transferring host role
    socket.on("transfer-host", ({ code, targetPlayerId }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const currentHost = lobby.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!currentHost?.isHost) return;

      const targetPlayer = lobby.players.find(
        (player: any) => player.id === targetPlayerId
      );

      if (!targetPlayer) return;
      if (targetPlayer.id === currentHost.id) return;

      currentHost.isHost = false;
      targetPlayer.isHost = true;

      if (lobby.gameState?.players) {
        const oldGameHost = lobby.gameState.players.find(
          (player: any) => player.id === currentHost.id
        );

        const newGameHost = lobby.gameState.players.find(
          (player: any) => player.id === targetPlayer.id
        );

        if (oldGameHost) {
          oldGameHost.isHost = false;
        }

        if (newGameHost) {
          newGameHost.isHost = true;
        }
      }

      io.to(code).emit("lobby-update", lobby);
    });

    //game start
    socket.on("start-game", ({ code }) => {
        const lobby = lobbies[code];

        if (!lobby) return;

        const players = lobby.players.filter(
          (player: any) => player.connected !== false
        );

        const requestingPlayer = players.find(
          (player: any) => player.socketId === socket.id
        );

        if (!requestingPlayer?.isHost) return;

        if (players.length < 3) return;

        const everyoneReady = players.every(
          (player: any) => player.isReady
        );

        if (!everyoneReady) return;

        const selectedCategories =
          lobby.settings?.categories?.length > 0
            ? lobby.settings.categories
            : Object.keys(gameWords);

        const categoryNames = selectedCategories.filter(
          (category: string) => category in gameWords
        );

        const randomCategory = categoryNames[Math.floor(Math.random() * categoryNames.length)];

        const words = gameWords[randomCategory as keyof typeof gameWords];

        const randomWord = words[Math.floor(Math.random() * words.length)];

        const requestedImposterCount =
               lobby.settings?.imposter?.imposterCount || 1;

        const maxImposters = Math.max(
          1,
          Math.min(
            requestedImposterCount,
            players.length - 1
          )
        );

        const shuffledIndexes = players
          .map((_: any, index: number) => index)
          .sort(() => Math.random() - 0.5);

        const imposterIndexes = new Set(
          shuffledIndexes.slice(0, maxImposters)
        );

        const imposterMode = lobby.settings?.imposter?.imposterMode || "no-word";

        const otherWords = words.filter(
          (word) => word !== randomWord
        );

        const similarWord =
          otherWords[
            Math.floor(Math.random() * otherWords.length)
          ];

        const startingPlayer = Math.floor(Math.random() * players.length);

        lobby.gameStarted = true;
        lobby.gameState = {
          mode : lobby.settings?.mode || "imposter",
          category: randomCategory,
          word: randomWord,
          imposterMode,
          imposterWord: similarWord,
          phase: "discussion",
          currentTurn: startingPlayer,
          round: 1,
          spokenPlayers: [],

          votes: {},
          roundMessage: undefined,
          voteResults: [],
          playAgainVotes: {},
          eliminatedPlayers: [],

          players: players.map((player: any, index: number) => ({
            ...player,
            location:"game",
            role: imposterIndexes.has(index) ? "imposter" : "innocent",
          })),
        };
      io.to(code).emit("game-started", lobby);
    });
    
    //next turn event
    socket.on("next-turn", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;

      const activePlayers = getActivePlayers(lobby.gameState);

      const totalPlayers = activePlayers.length;

      const activePlayer =
        lobby.gameState.players[lobby.gameState.currentTurn];

      if (activePlayer?.socketId !== socket.id) return;

      if (
        !lobby.gameState.spokenPlayers.includes(
          lobby.gameState.currentTurn
        )
      ) {
        lobby.gameState.spokenPlayers.push(
          lobby.gameState.currentTurn
        );
      }

      if (lobby.gameState.spokenPlayers.length >= totalPlayers) {
        lobby.gameState.phase = "voting";

        io.to(code).emit("lobby-update", lobby);
        return;
      }

      let nextIndex =
        (lobby.gameState.currentTurn + 1) %
        lobby.gameState.players.length;

      while (
        lobby.gameState.eliminatedPlayers?.includes(
          lobby.gameState.players[nextIndex].id
        )
      ) {
        nextIndex =
          (nextIndex + 1) %
          lobby.gameState.players.length;
      }

      lobby.gameState.currentTurn = nextIndex;

      io.to(code).emit("lobby-update", lobby);
    });

    //players sumbitting their votes at the voting phase
    socket.on("submit-vote", ({ code, vote }) => {
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;
      if (lobby.gameState.phase !== "voting") return;

      const voter = lobby.gameState.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!voter) return;

      if (lobby.gameState.eliminatedPlayers?.includes(voter.id)){
        return;
      }

      const validTarget =
        vote === "skip" ||
        lobby.gameState.players.some(
          (player: any) =>
            player.id === vote &&
            !lobby.gameState.eliminatedPlayers?.includes(
              player.id
            )
        );

      if (!validTarget) return;

      if (!lobby.gameState.votes) {
        lobby.gameState.votes = {};
      }

      // Prevent a player from voting more than once
      if (lobby.gameState.votes[voter.id]) {
        return;
      }

      lobby.gameState.votes[voter.id] = vote;

      const voteCount = Object.keys(lobby.gameState.votes).length;

      const totalPlayers = getActivePlayers(lobby.gameState).length;

      const voteResults = Object.entries(
        lobby.gameState.votes
      ).map(([voterId, targetId]) => {
        const voter = lobby.gameState.players.find(
          (player: any) => player.id === voterId
        );

        const target =
          targetId === "skip"
            ? undefined
            : lobby.gameState.players.find(
                (player: any) => player.id === targetId
              );

        return {
          voter: voter?.name || "Unknown Player",
          target:
            targetId === "skip"
              ? "Skip"
              : target?.name || "Unknown Player",
        };
      });

      lobby.gameState.voteResults = voteResults;
      if (voteCount < totalPlayers) {
        io.to(code).emit("lobby-update", lobby);
        return;
      }

      const voteTotals: Record<string, number> = {};

      Object.values(lobby.gameState.votes).forEach((submittedVote: any) => {
        voteTotals[submittedVote] =
          (voteTotals[submittedVote] || 0) + 1;
      });

      const highestVoteCount = Math.max(...Object.values(voteTotals));

      const highestVotes = Object.keys(voteTotals).filter(
        (target) => voteTotals[target] === highestVoteCount
      );

      // Tie vote
      if (highestVotes.length > 1) {
        lobby.gameState.phase = "transition";
        lobby.gameState.roundMessage =
          "The vote ended in a tie. Next round starting...";

        lobby.gameState.voteResults = voteResults;

        // Show transition screen immediately
        io.to(code).emit("lobby-update", lobby);

        setTimeout(() => {
          // Make sure the lobby/game still exists
          if (!lobbies[code]?.gameState) return;

          startNextRound(
            lobby,
            "The vote ended in a tie. Discussion continues.",
            voteResults
          );

          io.to(code).emit("lobby-update", lobby);
        }, 3000);

        return;
      }

      const winningVote = highestVotes[0];

      // Skip vote won
      if (winningVote === "skip") {
        lobby.gameState.phase = "transition";
        lobby.gameState.roundMessage = "The group voted to skip. Next round starting...";

        lobby.gameState.voteResults = voteResults;

        // Show transition screen immediately
        io.to(code).emit("lobby-update", lobby);

        setTimeout(() => {
          if (!lobbies[code]?.gameState) return;

          startNextRound(
            lobby,
            "The group voted to skip. Discussion continues.",
            voteResults
          );

          io.to(code).emit("lobby-update", lobby);
        }, 3000);

        return;
      }

      const votedPlayer = lobby.gameState.players.find(
        (player: any) => player.id === winningVote
      );

      lobby.gameState.roundMessage = undefined;
      lobby.gameState.voteResults = voteResults;

      lobby.gameState.votedPlayerId = winningVote;

      lobby.gameState.votedPlayerName =
        votedPlayer?.name || "Unknown Player";

      lobby.gameState.votedPlayerRole =
        votedPlayer?.role || "innocent";

      if (!lobby.gameState.eliminatedPlayers) {
        lobby.gameState.eliminatedPlayers = [];
      }

      if (
        votedPlayer &&
        !lobby.gameState.eliminatedPlayers.includes(
          votedPlayer.id
        )
      ) {
        lobby.gameState.eliminatedPlayers.push(
          votedPlayer.id
        );
      }

      lobby.gameState.phase = "reveal";

      io.to(code).emit("lobby-update", lobby);

      setTimeout(() => {
        if (!lobbies[code]?.gameState) return;

        const remainingImposters =
          lobby.gameState.players.filter(
            (player: any) =>
              player.role === "imposter" &&
              !lobby.gameState.eliminatedPlayers.includes(
                player.id
              )
          );

        const remainingInnocents =
          lobby.gameState.players.filter(
            (player: any) =>
              player.role === "innocent" &&
              !lobby.gameState.eliminatedPlayers.includes(
                player.id
              )
          );

        if (remainingImposters.length === 0) {
          lobby.gameState.innocentsWin = true;
          lobby.gameState.phase = "results";

          io.to(code).emit("lobby-update", lobby);
          return;
        }

        if (
          remainingImposters.length >=
          remainingInnocents.length
        ) {
          lobby.gameState.innocentsWin = false;
          lobby.gameState.phase = "results";

          io.to(code).emit("lobby-update", lobby);
          return;
        }

        startNextRound(
          lobby,
          `${votedPlayer?.name} was eliminated.`,
          voteResults
        );

        io.to(code).emit("lobby-update", lobby);
      }, 3000);

      return;
    });

    //play again
    socket.on("play-again", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;
      if (lobby.gameState.phase !== "results") return;

      const player = lobby.gameState.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!player) return;

      if (!lobby.gameState.playAgainVotes) {
        lobby.gameState.playAgainVotes = {};
      }

      // Prevent duplicate Play Again submissions
      if (lobby.gameState.playAgainVotes[player.id]) {
        return;
      }

      lobby.gameState.playAgainVotes[player.id] = true;

      const readyCount = Object.keys(
        lobby.gameState.playAgainVotes
      ).length;

      const totalPlayers = lobby.gameState.players.length;

      // Update everyone while waiting
      if (readyCount < totalPlayers) {
        io.to(code).emit("lobby-update", lobby);
        return;
      }

      // Everyone pressed Play Again
      const players = lobby.players.filter(
        (player: any) => player.connected !== false
      );

      const selectedCategories =
        lobby.settings?.categories?.length > 0
          ? lobby.settings.categories
          : Object.keys(gameWords);

      const categoryNames = selectedCategories.filter(
        (category: string) => category in gameWords
      );

      const randomCategory =
        categoryNames[
          Math.floor(Math.random() * categoryNames.length)
        ];

      const words =
        gameWords[randomCategory as keyof typeof gameWords];

      const randomWord =
        words[Math.floor(Math.random() * words.length)];

      const otherWords = words.filter(
        (word) => word !== randomWord
      );

      const similarWord =
        otherWords[
          Math.floor(Math.random() * otherWords.length)
        ];

      const requestedImposterCount =
        lobby.settings?.imposter?.imposterCount || 1;

      const maxImposters = Math.max(
        1,
        Math.min(
          requestedImposterCount,
          players.length - 1
        )
      );

      const shuffledIndexes = players
        .map((_: any, index: number) => index)
        .sort(() => Math.random() - 0.5);

      const imposterIndexes = new Set(
        shuffledIndexes.slice(0, maxImposters)
      );

      const imposterMode =
        lobby.settings?.imposter?.imposterMode || "no-word";

      const startingPlayer =
        Math.floor(Math.random() * players.length);

      lobby.gameState = {
        mode: lobby.settings?.mode || "imposter",
        category: randomCategory,
        word: randomWord,
        imposterMode,
        imposterWord: similarWord,
        phase: "discussion",
        currentTurn: startingPlayer,
        round: 1,
        spokenPlayers: [],

        votes: {},
        roundMessage: undefined,
        voteResults: [],
        playAgainVotes: {},
        eliminatedPlayers: [],

        players: players.map(
          (player: any, index: number) => ({
            ...player,
            location: "game",
            role:
              imposterIndexes.has(index)
                ? "imposter"
                : "innocent",
          })
        ),
      };

      io.to(code).emit("lobby-update", lobby);
    });

    //return to lobby
    socket.on("return-to-lobby", ({ code }) => {
      const lobby = lobbies[code];

      if (!lobby) return;

      const player = lobby.players.find(
        (player : any) => player.socketId === socket.id
      );

      if (!player) return;
      
      player.location = "lobby";
      player.isReady = false;

      if (lobby.gameState?.players) {
        lobby.gameState.players =
          lobby.gameState.players.filter(
            (gamePlayer: any) =>
              gamePlayer.id !== player.id
          );

        if (lobby.gameState.playAgainVotes) {
          delete lobby.gameState.playAgainVotes[player.id];
        }
      }
      
      io.to(code).emit("lobby-update", lobby);
    });
    
  // Disconnect handling
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const code in lobbies) {
      const lobby = lobbies[code];

      const leavingPlayer = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      // This socket was not part of this lobby
      if (!leavingPlayer) {
        continue;
      }

      const leavingPlayerId = leavingPlayer.id;

      /*
      * Do not remove the player immediately.
      * Mark them disconnected and give them 15 seconds
      * to reconnect after refreshing.
      */
      leavingPlayer.connected = false;
      leavingPlayer.socketId = null;

      const leavingGamePlayer =
        lobby.gameState?.players?.find(
          (player: any) =>
            player.id === leavingPlayerId
        );

      if (leavingGamePlayer) {
        leavingGamePlayer.connected = false;
        leavingGamePlayer.socketId = null;
      }

      io.to(code).emit("lobby-update", lobby);

      setTimeout(() => {
        const currentLobby = lobbies[code];

        if (!currentLobby) return;

        const currentPlayer =
          currentLobby.players.find(
            (player: any) =>
              player.id === leavingPlayerId
          );

        // Player was already removed
        if (!currentPlayer) return;

        // Player reconnected during the grace period
        if (currentPlayer.connected) {
          console.log(
            `${currentPlayer.name} reconnected`
          );

          return;
        }

        console.log(
          `${currentPlayer.name} did not reconnect`
        );

        // Remove player from main lobby list
        currentLobby.players =
          currentLobby.players.filter(
            (player: any) =>
              player.id !== leavingPlayerId
          );

        // Host did not reconnect
        if (currentPlayer.isHost) {
          currentLobby.gameStarted = false;
          currentLobby.gameState = null;

          currentLobby.players =
            currentLobby.players.map(
              (player: any, index: number) => ({
                ...player,
                isHost: index === 0,
                isReady: false,
                location: "lobby",
              })
            );

          io.to(code).emit("return-to-lobby");
          io.to(code).emit(
            "lobby-update",
            currentLobby
          );

          if (currentLobby.players.length === 0) {
            delete lobbies[code];
          }

          return;
        }

        // Remove non-host from active game
        if (currentLobby.gameState?.players) {
          const disconnectedGamePlayerIndex =
            currentLobby.gameState.players.findIndex(
              (player: any) =>
                player.id === leavingPlayerId
            );

          currentLobby.gameState.players =
            currentLobby.gameState.players.filter(
              (player: any) =>
                player.id !== leavingPlayerId
            );

          // Remove their vote
          if (currentLobby.gameState.votes) {
            delete currentLobby.gameState.votes[
              leavingPlayerId
            ];

            // Remove votes targeting them
            for (
              const voterId in
              currentLobby.gameState.votes
            ) {
              if (
                currentLobby.gameState.votes[
                  voterId
                ] === leavingPlayerId
              ) {
                delete currentLobby.gameState.votes[
                  voterId
                ];
              }
            }
          }

          // Remove their Play Again vote
          if (
            currentLobby.gameState.playAgainVotes
          ) {
            delete currentLobby.gameState
              .playAgainVotes[leavingPlayerId];
          }

          const remainingPlayers =getActivePlayers(currentLobby.gameState).length;

          // End game if fewer than three remain
          if (remainingPlayers < 3) {
            currentLobby.gameStarted = false;
            currentLobby.gameState = null;

            currentLobby.players =
              currentLobby.players.map(
                (player: any) => ({
                  ...player,
                  isReady: false,
                  location: "lobby",
                })
              );

            io.to(code).emit("return-to-lobby");

            io.to(code).emit(
              "lobby-update",
              currentLobby
            );

            return;
          }

          // Restart discussion if someone leaves
          if (
            currentLobby.gameState.phase ===
              "discussion" ||
            currentLobby.gameState.phase ===
              "voting" ||
            currentLobby.gameState.phase ===
              "transition"
          ) {
            currentLobby.gameState.phase =
              "discussion";

            const activePlayers = getActivePlayers(currentLobby.gameState);

            const randomPlayer =
              activePlayers[
                Math.floor(Math.random() * activePlayers.length)
              ];

            currentLobby.gameState.currentTurn =
              currentLobby.gameState.players.findIndex(
                (player: any) =>
                  player.id === randomPlayer.id
              );

            currentLobby.gameState.spokenPlayers =
              [];

            currentLobby.gameState.votes = {};
            currentLobby.gameState.voteResults = [];

            currentLobby.gameState.roundMessage =
              `${currentPlayer.name} disconnected. The round has restarted.`;
          }

          console.log(
            `${currentPlayer.name} removed from game at index`,
            disconnectedGamePlayerIndex
          );
        }

        io.to(code).emit(
          "lobby-update",
          currentLobby
        );

        if (currentLobby.players.length === 0) {
          delete lobbies[code];
        }
      }, 15000);
    }
  });

  }); // close io.on("connection")

  return io;
}