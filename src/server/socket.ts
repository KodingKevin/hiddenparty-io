import { Server } from "socket.io";

import { gameWords } from "../library/gamewords";
// Stores all active lobbies
const lobbies: Record<string, any> = {};

//store private session
const playerSessions:
  Record<
    string,
    Record<string, string>
  > = {};

//auto kick players once time is out
const kickedPlayers:
  Record<string, Set<string>> = {};

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
      !eliminatedPlayers.includes(player.id) &&
      player.connected !== false
  );
}

function isSocketInLobby(
  socket: any,
  code: unknown
) {
  if (!isValidLobbyCode(code)) {
    return false;
  }

  return (
    socket.data?.lobbyCode === code &&
    Boolean(socket.data?.playerId)
  );
}

function isValidLobbyCode(code: unknown) {
  return (
    typeof code === "string" &&
    /^[A-Z0-9]{4,8}$/.test(code)
  );
}

function isValidPlayerId(playerId: unknown) {
  return (
    typeof playerId === "string" &&
    playerId.length >= 8 &&
    playerId.length <= 100
  );
}

function isValidPlayerToken(playerToken: unknown) {
  return (
    typeof playerToken === "string" &&
    playerToken.length >= 16 &&
    playerToken.length <= 200
  );
}

function sanitizePlayerName(name: unknown) {
  if (typeof name !== "string") {
    return "";
  }

  return name
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 16);
}

function getLobbyForPlayer(
  lobby: any,
  playerId: string
) {
  // No active game
  if (!lobby.gameState) {
    return lobby;
  }

  const currentGamePlayer =
    lobby.gameState.players.find(
      (player: any) =>
        player.id === playerId
    );

  // Player is only waiting in the lobby.
  // Do not send them the active game's secrets.
  if (!currentGamePlayer) {
    return {
      ...lobby,
      gameState: null,
    };
  }

  const showAllRoles =
    lobby.gameState.phase === "results";

  const safePlayers =
    lobby.gameState.players.map(
      (player: any) => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        connected: player.connected,

        // Only reveal your own role during the game.
        // Reveal everyone's role on Results.
        role:
          showAllRoles ||
          player.id === playerId
            ? player.role
            : undefined,
      })
    );

  const isImposter =
    currentGamePlayer.role === "imposter";

  return {
    ...lobby,

    gameState: {
      mode: lobby.gameState.mode,
      category: lobby.gameState.category,
      imposterMode: lobby.gameState.imposterMode,
      turnTime: lobby.gameState.turnTime,
      phase: lobby.gameState.phase,
      currentTurn: lobby.gameState.currentTurn,
      round: lobby.gameState.round,
      spokenPlayers: lobby.gameState.spokenPlayers,

      roundMessage:
        lobby.gameState.phase === "discussion" ||
        lobby.gameState.phase === "transition"
          ? lobby.gameState.roundMessage
          : undefined,

      voteResults:
        lobby.gameState.phase === "reveal" ||
        lobby.gameState.phase === "results"
          ? lobby.gameState.voteResults
          : [],
      eliminatedPlayers: lobby.gameState.eliminatedPlayers,

      playAgainCount:
        Object.keys(
          lobby.gameState.playAgainVotes || {}
        ).length,

      hasPressedPlayAgain:
        Boolean(
          lobby.gameState.playAgainVotes?.[
            playerId
          ]
        ),

      votedPlayerId:
        lobby.gameState.phase === "reveal" ||
        lobby.gameState.phase === "results"
          ? lobby.gameState.votedPlayerId
          : undefined,

      votedPlayerName:
        lobby.gameState.phase === "reveal" ||
        lobby.gameState.phase === "results"
          ? lobby.gameState.votedPlayerName
          : undefined,

      votedPlayerRole:
        lobby.gameState.phase === "reveal" ||
        lobby.gameState.phase === "results"
          ? lobby.gameState.votedPlayerRole
          : undefined,

      innocentsWin:
        lobby.gameState.phase === "results"
          ? lobby.gameState.innocentsWin
          : undefined,

      endReason:
        lobby.gameState.phase === "results"
          ? lobby.gameState.endReason
          : undefined,

      players: safePlayers,

      // Only expose which players submitted,
      // never who they voted for.
      votes: Object.fromEntries(
        Object.keys(
          lobby.gameState.votes || {}
        ).map((voterId) => [
          voterId,
          "submitted",
        ])
      ),

      // Innocents see normal word.
      // Imposters only see it on Results.
      word:
        showAllRoles || !isImposter
          ? lobby.gameState.word
          : undefined,

      // Similar-word imposters see their own word.
      imposterWord:
        showAllRoles ||
        (
          isImposter &&
          lobby.gameState.imposterMode ===
            "similar-word"
        )
          ? lobby.gameState.imposterWord
          : undefined,
    },
  };
}

function emitLobbyUpdate(
  io: Server,
  code: string,
  lobby: any
) {
  lobby.players.forEach(
    (player: any) => {
      if (!player.socketId) return;

      const safeLobby =
        getLobbyForPlayer(
          lobby,
          player.id
        );

      io.to(player.socketId).emit(
        "lobby-update",
        safeLobby
      );
    }
  );
}

const socketRateLimits =
  new Map<
    string,
    Record<
      string,
      {
        count: number;
        resetAt: number;
      }
    >
  >();

function isRateLimited(
  socketId: string,
  action: string,
  maxRequests: number,
  windowMs: number
) {
  const now = Date.now();

  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(
      socketId,
      {}
    );
  }

  const socketLimits =
    socketRateLimits.get(socketId)!;

  const current =
    socketLimits[action];

  if (
    !current ||
    now >= current.resetAt
  ) {
    socketLimits[action] = {
      count: 1,
      resetAt: now + windowMs,
    };

    return false;
  }

  current.count += 1;

  return (
    current.count >
    maxRequests
  );
}

function resolveVotes(
  io: Server,
  code: string,
  lobby: any
) {
  if (!lobby?.gameState) return;

  const voteResults = Object.entries(
    lobby.gameState.votes || {}
  ).map(([voterId, targetId]) => {
    const voter = lobby.gameState.players.find(
      (player: any) => player.id === voterId
    );

    const target =
      targetId === "skip"
        ? undefined
        : lobby.gameState.players.find(
            (player: any) =>
              player.id === targetId
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

  const voteTotals: Record<string, number> = {};

  Object.values(
    lobby.gameState.votes || {}
  ).forEach((submittedVote: any) => {
    voteTotals[submittedVote] =
      (voteTotals[submittedVote] || 0) + 1;
  });

  const voteTargets =
    Object.keys(voteTotals);

  // Safety check
  if (voteTargets.length === 0) {
    return;
  }

  const highestVoteCount = Math.max(
    ...Object.values(voteTotals)
  );

  const highestVotes =
    voteTargets.filter(
      (target) =>
        voteTotals[target] === highestVoteCount
    );

  // Tie
  if (highestVotes.length > 1) {
    lobby.gameState.phase = "transition";

    lobby.gameState.roundMessage =
      "The vote ended in a tie. Next round starting...";

    emitLobbyUpdate(
      io,
      code,
      lobby
    );

    setTimeout(() => {
      if (!lobbies[code]?.gameState) return;

      startNextRound(
        lobby,
        "The vote ended in a tie. Discussion continues.",
        voteResults
      );

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    }, 3000);

    return;
  }

  const winningVote = highestVotes[0];

  // Skip wins
  if (winningVote === "skip") {
    lobby.gameState.phase = "transition";

    lobby.gameState.roundMessage =
      "The group voted to skip. Next round starting...";

    emitLobbyUpdate(
      io,
      code,
      lobby
    );

    setTimeout(() => {
      if (!lobbies[code]?.gameState) return;

      startNextRound(
        lobby,
        "The group voted to skip. Discussion continues.",
        voteResults
      );

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    }, 3000);

    return;
  }

  const votedPlayer =
    lobby.gameState.players.find(
      (player: any) =>
        player.id === winningVote
    );

  // Target disappeared before vote resolution
  if (!votedPlayer) {
    startNextRound(
      lobby,
      "The voted player is no longer in the game. Discussion continues.",
      voteResults
    );

    emitLobbyUpdate(
      io,
      code,
      lobby
    );

    return;
  }

  lobby.gameState.roundMessage = undefined;

  lobby.gameState.votedPlayerId =
    votedPlayer.id;

  lobby.gameState.votedPlayerName =
    votedPlayer.name;

  lobby.gameState.votedPlayerRole =
    votedPlayer.role;

  if (!lobby.gameState.eliminatedPlayers) {
    lobby.gameState.eliminatedPlayers = [];
  }

  if (
    !lobby.gameState.eliminatedPlayers.includes(
      votedPlayer.id
    )
  ) {
    lobby.gameState.eliminatedPlayers.push(
      votedPlayer.id
    );
  }

  lobby.gameState.phase = "reveal";

  emitLobbyUpdate(
    io,
    code,
    lobby
  );

  setTimeout(() => {
    if (!lobbies[code]?.gameState) return;

    const remainingImposters =
      lobby.gameState.players.filter(
        (player: any) =>
          player.role === "imposter" &&
          !lobby.gameState.eliminatedPlayers.includes(
            player.id
          ) &&
          player.connected !== false
      );

    const remainingInnocents =
      lobby.gameState.players.filter(
        (player: any) =>
          player.role === "innocent" &&
          !lobby.gameState.eliminatedPlayers.includes(
            player.id
          ) &&
          player.connected !== false
      );

    // All imposters eliminated
    if (remainingImposters.length === 0) {
      lobby.gameState.innocentsWin = true;
      lobby.gameState.phase = "results";

      emitLobbyUpdate(
        io,
        code,
        lobby
      );

      return;
    }

    // Imposters reach parity
    if (
      remainingImposters.length >=
      remainingInnocents.length
    ) {
      lobby.gameState.innocentsWin = false;
      lobby.gameState.phase = "results";

      emitLobbyUpdate(
        io,
        code,
        lobby
      );

      return;
    }

    startNextRound(
      lobby,
      `${votedPlayer.name} was eliminated.`,
      voteResults
    );

    emitLobbyUpdate(
      io,
      code,
      lobby
    );
  }, 3000);
}

function canStartPlayAgain(lobby: any) {
  if (!lobby?.gameState) return false;
  if (lobby.gameState.phase !== "results") {
    return false;
  }

  const connectedGamePlayers =
    lobby.gameState.players.filter(
      (player: any) =>
        player.connected !== false
    );

  if (connectedGamePlayers.length < 3) {
    return false;
  }

  const readyCount =
    connectedGamePlayers.filter(
      (player: any) =>
        lobby.gameState.playAgainVotes?.[
          player.id
        ]
    ).length;

  return (
    readyCount ===
    connectedGamePlayers.length
  );
}

function startPlayAgainGame(
  io: Server,
  code: string,
  lobby: any
) {
  if (!lobby?.gameState) return;

  // Only players still participating in the game
  const players =
    lobby.gameState.players.filter(
      (player: any) =>
        player.connected !== false
    );

  if (players.length < 3) return;

  const selectedCategories =
    lobby.settings?.categories?.length > 0
      ? lobby.settings.categories
      : Object.keys(gameWords);

  const categoryNames =
    selectedCategories.filter(
      (category: string) =>
        category in gameWords
    );

  if (categoryNames.length === 0) return;

  const randomCategory =
    categoryNames[
      Math.floor(
        Math.random() *
          categoryNames.length
      )
    ];

  const words =
    gameWords[
      randomCategory as keyof typeof gameWords
    ];

  const randomWord =
    words[
      Math.floor(
        Math.random() * words.length
      )
    ];

  const otherWords =
    words.filter(
      (word) =>
        word !== randomWord
    );

  const imposterMode =
    lobby.settings?.imposter
      ?.imposterMode ||
    "no-word";

  if (
    imposterMode === "similar-word" &&
    otherWords.length === 0
  ) {
    return;
  }

  const similarWord =
    imposterMode === "similar-word"
      ? otherWords[
          Math.floor(
            Math.random() *
            otherWords.length
          )
        ]
      : undefined;

  const requestedImposterCount =
    lobby.settings?.imposter
      ?.imposterCount || 1;

  const maxImposters =
    Math.max(
      1,
      Math.min(
        requestedImposterCount,
        players.length - 1
      )
    );

  const shuffledIndexes =
    players
      .map(
        (_: any, index: number) =>
          index
      )
      .sort(
        () => Math.random() - 0.5
      );

  const imposterIndexes =
    new Set(
      shuffledIndexes.slice(
        0,
        maxImposters
      )
    );

  const startingPlayer =
    Math.floor(
      Math.random() *
        players.length
    );

  players.forEach(
    (player: any) => {
      const lobbyPlayer =
        lobby.players.find(
          (lobbyPlayer: any) =>
            lobbyPlayer.id === player.id
        );

      if (lobbyPlayer) {
        lobbyPlayer.location = "game";
        lobbyPlayer.waitingForNextGame = false;
      }
    }
  );

  lobby.gameState = {
    mode:
      lobby.settings?.mode ||
      "imposter",

    category:
      randomCategory,

    word:
      randomWord,

    imposterMode,

    imposterWord:
      similarWord,

    turnTime:
      lobby.settings?.imposter
        ?.turnTime || 45,

    phase:
      "discussion",

    currentTurn:
      startingPlayer,

    round: 1,

    spokenPlayers: [],

    endReason: "normal",

    votes: {},

    roundMessage:
      undefined,

    voteResults: [],

    playAgainVotes: {},

    eliminatedPlayers: [],

    players:
      players.map(
        (
          player: any,
          index: number
        ) => ({
          ...player,
          location: "game",

          role:
            imposterIndexes.has(
              index
            )
              ? "imposter"
              : "innocent",
        })
      ),
  };

  emitLobbyUpdate(
    io,
    code,
    lobby
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
    socket.on(
      "get-lobby",
      ({ code }) => {
        if (!isSocketInLobby(socket, code)) {
          return;
        }
        if (!lobbies[code]) {
          lobbies[code] = {
            players: [],
            settings: {},
            locked: false,
            chatMessages: [],
          };
        }

        socket.join(code);

        const lobby = lobbies[code];

        const playerId =
          socket.data.playerId;

        // Socket has not joined as a player yet.
        // Never expose an active game.
        if (!playerId) {
          socket.emit(
            "lobby-update",
            {
              ...lobby,
              gameState: null,
            }
          );

          return;
        }

        const safeLobby =
          getLobbyForPlayer(
            lobby,
            playerId
          );

        socket.emit(
          "lobby-update",
          safeLobby
        );
      }
    );

    // Joining a lobby
    socket.on(
      "join-lobby",
      ({
        code,
        playerName,
        playerId,
        playerToken,
      }) => {
        // 1. Validate incoming values
        if (
          !isValidLobbyCode(code) ||
          !isValidPlayerId(playerId) ||
          !isValidPlayerToken(playerToken)
        ) {
          socket.emit(
            "invalid-join-request"
          );

          return;
        }

        // 2. Sanitize name
        const safePlayerName =
          sanitizePlayerName(
            playerName
          );

        // 3. Create lobby if necessary
        if (!lobbies[code]) {
          lobbies[code] = {
            players: [],
            settings: {},
            locked: false,
            chatMessages: [],
          };
        }

        // 4. Prevent socket from switching rooms
        if (
          socket.data.lobbyCode &&
          socket.data.lobbyCode !== code
        ) {
          socket.emit(
            "already-in-another-lobby"
          );

          return;
        }

        const lobby =
          lobbies[code];

        // 5. NOW existingPlayer exists
        const existingPlayer =
          lobby.players.find(
            (player: any) =>
              player.id === playerId
          );

        // 6. Rate-limit actual name changes
        if (
          existingPlayer &&
          safePlayerName &&
          safePlayerName !==
            existingPlayer.name &&
          isRateLimited(
            socket.id,
            "name-change",
            5,
            10000
          )
        ) {
          return;
        } 

        // Locked lobby blocks brand-new players
        if (
          lobby.locked &&
          !existingPlayer
        ) {
          socket.emit(
            "lobby-locked"
          );

          return;
        }

        if (!playerSessions[code]) {
          playerSessions[code] = {};
        }

        if (!kickedPlayers[code]) {
          kickedPlayers[code] =
            new Set<string>();
        }

        const savedToken =
          playerSessions[code][playerId];

        // A player explicitly kicked from this lobby
        // cannot reclaim the same player identity.
        if (
          kickedPlayers[code].has(playerId)
        ) {
          socket.emit(
            "kicked-from-lobby"
          );

          return;
        }

        if (savedToken) {
          // This player ID already belongs
          // to an existing browser/session.
          if (savedToken !== playerToken) {
            socket.emit(
              "player-session-invalid"
            );

            return;
          }
        } else {
          // Completely new player identity
          playerSessions[code][playerId] =
            playerToken;
        }
        
        // Authentication succeeded.
        // NOW bind this socket to the player.
        socket.data.playerId = playerId;
        socket.data.lobbyCode = code;

        if (existingPlayer) {
          existingPlayer.name =
            safePlayerName || existingPlayer.name;

          existingPlayer.socketId = socket.id;
          existingPlayer.connected = true;

          if (
            lobby.gameStarted &&
            !lobby.gameState?.players?.some(
              (player: any) =>
                player.id === playerId
            )
          ) {
            existingPlayer.waitingForNextGame = true;
          }

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

          const isGameInProgress =
            lobby.gameStarted === true &&
            lobby.gameState != null;

          lobby.players.push({
            id: playerId,
            socketId: socket.id,
            name:
              safePlayerName ||
              `Player ${playerNumber}`,
            isReady: false,
            isHost: lobby.players.length === 0,
            location: "lobby",
            connected: true,
            waitingForNextGame: isGameInProgress,
          });
        }

        socket.join(code);

        emitLobbyUpdate(
          io,
          code,
          lobby
        );

        console.log(lobbies);
      }
    );

    // Sync settings through the server
    socket.on("update-settings", ({ code, settings }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      // Game settings cannot change
      // while a match is active.
      if (
        lobby.gameStarted &&
        lobby.gameState
      ) {
        return;
      }

      if (
        isRateLimited(
          socket.id,
          "settings",
          15,
          5000
        )
      ) {
        return;
      }

      const requestingPlayer = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!requestingPlayer?.isHost) return;

      lobby.settings = settings;

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    // Host control to kick a player
    socket.on(
      "kick-player",
      ({ code, targetPlayerId }) => {
        if (!isSocketInLobby(socket, code)) {
          return;
        }
        const lobby = lobbies[code];

        if (!lobby) return;

        if (
          isRateLimited(
            socket.id,
            "host-action",
            10,
            5000
          )
        ) {
          return;
        }

        const host =
          lobby.players.find(
            (player: any) =>
              player.socketId === socket.id
          );

        if (!host?.isHost) return;

        const targetPlayer =
          lobby.players.find(
            (player: any) =>
              player.id === targetPlayerId
          );

        if (!targetPlayer) return;

        // Host cannot kick themselves
        if (targetPlayer.isHost) return;

        if (!kickedPlayers[code]) {
          kickedPlayers[code] =
            new Set<string>();
        }

        kickedPlayers[code].add(
          targetPlayerId
        );

        const targetSocketId =
          targetPlayer.socketId;

        // Revoke the kicked player's socket authorization
        if (targetSocketId) {
          const targetSocket =
            io.sockets.sockets.get(
              targetSocketId
            );

          if (targetSocket) {
            targetSocket.data.playerId =
              undefined;

            targetSocket.data.lobbyCode =
              undefined;

            targetSocket.leave(code);
          }
        }

        // Remove from main lobby
        lobby.players =
          lobby.players.filter(
            (player: any) =>
              player.id !== targetPlayerId
          );

        // Handle active game cleanup
        if (lobby.gameState?.players) {
          lobby.gameState.players =
            lobby.gameState.players.filter(
              (player: any) =>
                player.id !== targetPlayerId
            );

          // Remove their submitted vote
          if (lobby.gameState.votes) {
            delete lobby.gameState.votes[
              targetPlayerId
            ];

            // Remove votes targeting them
            for (
              const voterId in
              lobby.gameState.votes
            ) {
              if (
                lobby.gameState.votes[
                  voterId
                ] === targetPlayerId
              ) {
                delete lobby.gameState.votes[
                  voterId
                ];
              }
            }
          }

          // Remove Play Again vote
          if (
            lobby.gameState.playAgainVotes
          ) {
            delete lobby.gameState
              .playAgainVotes[
                targetPlayerId
              ];
          }

          const remainingPlayers =
            getActivePlayers(
              lobby.gameState
            ).length;

          // Not enough players to continue
          if (remainingPlayers < 3) {
            lobby.gameStarted = false;
            lobby.gameState = null;

            lobby.players =
              lobby.players.map(
                (
                  player: any,
                  index: number
                ) => ({
                  ...player,
                  isHost: index === 0,
                  isReady: false,
                  location: "lobby",
                  waitingForNextGame: false,
                })
              );

            if (targetSocketId) {
              io.to(targetSocketId).emit(
                "kicked-from-lobby"
              );
            }

            io.to(code).emit(
              "return-to-lobby"
            );

            emitLobbyUpdate(
              io,
              code,
              lobby
            );
            return;
          }

          // Results: kicking someone may make
          // everyone remaining ready
          if (
            lobby.gameState.phase ===
              "results" &&
            canStartPlayAgain(lobby)
          ) {
            if (targetSocketId) {
              io.to(targetSocketId).emit(
                "kicked-from-lobby"
              );
            }

            startPlayAgainGame(
              io,
              code,
              lobby
            );

            return;
          }

          // Voting: resolve if all remaining
          // active players have voted
          if (
            lobby.gameState.phase ===
            "voting"
          ) {
            const voteCount =
              Object.keys(
                lobby.gameState.votes || {}
              ).length;

            const totalPlayers =
              getActivePlayers(
                lobby.gameState
              ).length;

            if (
              totalPlayers > 0 &&
              voteCount >= totalPlayers
            ) {
              if (targetSocketId) {
                io.to(targetSocketId).emit(
                  "kicked-from-lobby"
                );
              }

              resolveVotes(
                io,
                code,
                lobby
              );

              return;
            }
          }

          // Restart active round after kick
          if (
            lobby.gameState.phase ===
              "discussion" ||
            lobby.gameState.phase ===
              "voting" ||
            lobby.gameState.phase ===
              "transition"
          ) {
            const activePlayers =
              getActivePlayers(
                lobby.gameState
              );

            if (activePlayers.length > 0) {
              const randomPlayer =
                activePlayers[
                  Math.floor(
                    Math.random() *
                      activePlayers.length
                  )
                ];

              lobby.gameState.phase =
                "discussion";

              lobby.gameState.currentTurn =
                lobby.gameState.players.findIndex(
                  (player: any) =>
                    player.id ===
                    randomPlayer.id
                );

              lobby.gameState.spokenPlayers =
                [];

              lobby.gameState.votes = {};

              lobby.gameState.voteResults =
                [];

              lobby.gameState.roundMessage =
                `${targetPlayer.name} was removed from the game. The round has restarted.`;
            }
          }
        }

        if (targetSocketId) {
          io.to(targetSocketId).emit(
            "kicked-from-lobby"
          );
        }

        emitLobbyUpdate(
          io,
          code,
          lobby
        );
      }
    );

    //Toggle lock lobby
    socket.on("toggle-lobby-lock", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      if (
        isRateLimited(
          socket.id,
          "host-action",
          10,
          5000
        )
      ) {
        return;
      }

      const host = lobby.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!host?.isHost) return;

      lobby.locked = !lobby.locked;

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    //chat abilities
    socket.on("send-chat-message", ({ code, message }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      if (lobby.settings?.chatEnabled === false) {
        return;
      }

      if (
        isRateLimited(
          socket.id,
          "chat",
          10,
          5000
        )
      ) {
        return;
      }

      const player = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!player) return;

      const trimmedMessage = message?.trim();

      if (!trimmedMessage) return;

      const chatMessage = {
        id: `${Date.now()}-${player.id}`,
        playerId: player.id,
        playerName: player.name,
        message: trimmedMessage.slice(0, 200),
        timestamp: Date.now(),
      };

      if (!lobby.chatMessages) {
        lobby.chatMessages = [];
      }

      lobby.chatMessages.push(chatMessage);

      // Prevent chat history from growing forever
      lobby.chatMessages =
        lobby.chatMessages.slice(-50);

      io.to(code).emit(
        "chat-message",
        chatMessage
      );
    });

    // Toggle ready status
    socket.on("toggle-ready", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      // Ready state only belongs to the lobby,
      // not an active match.
      if (
        lobby.gameStarted &&
        lobby.gameState
      ) {
        return;
      }

      if (
        isRateLimited(
          socket.id,
          "ready",
          5,
          3000
        )
      ) {
        return;
      }

      const player = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!player) return;

      if (player.waitingForNextGame) {
        return;
      }

      player.isReady = !player.isReady;

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    //host control on transferring host role
    socket.on("transfer-host", ({ code, targetPlayerId }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      if (
        isRateLimited(
          socket.id,
          "host-action",
          10,
          5000
        )
      ) {
        return;
      }

      const currentHost = lobby.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!currentHost?.isHost) return;

      const targetPlayer = lobby.players.find(
        (player: any) =>
          player.id === targetPlayerId
      );

      if (!targetPlayer) return;
      if (targetPlayer.id === currentHost.id) return;

      // Cannot transfer host to a disconnected player
      if (targetPlayer.connected === false) {
        return;
      }

      // During an active game, the new host
      // must still be participating in the game.
      if (lobby.gameState?.players) {
        const targetGamePlayer =
          lobby.gameState.players.find(
            (player: any) =>
              player.id === targetPlayerId &&
              player.connected !== false
          );

        if (!targetGamePlayer) {
          return;
        }
      }

      // Make sure only one lobby player is host
      lobby.players.forEach(
        (player: any) => {
          player.isHost =
            player.id === targetPlayer.id;
        }
      );

      // Keep host status synced in active game
      if (lobby.gameState?.players) {
        lobby.gameState.players.forEach(
          (player: any) => {
            player.isHost =
              player.id === targetPlayer.id;
          }
        );
      }
      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    socket.on("host-end-game", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;

      if (
        isRateLimited(
          socket.id,
          "host-action",
          10,
          5000
        )
      ) {
        return;
      }

      const host = lobby.gameState.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!host?.isHost) return;

      lobby.gameState.endReason = "host-ended";
      lobby.gameState.phase = "results";

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    socket.on("host-return-everyone", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      if (
        isRateLimited(
          socket.id,
          "host-action",
          10,
          5000
        )
      ) {
        return;
      }

      const host = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!host?.isHost) return;

      lobby.gameStarted = false;
      lobby.gameState = null;

      lobby.players = lobby.players.map(
        (player: any) => ({
          ...player,
          isReady: false,
          location: "lobby",
          waitingForNextGame: false,
        })
      );

      io.to(code).emit("return-to-lobby");

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    //game start
    socket.on("start-game", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      // Do not allow another game to start
      // while one is already running.
      if (
        lobby.gameStarted ||
        lobby.gameState
      ) {
        return;
      }

      const players = lobby.players.filter(
        (player: any) =>
          player.connected !== false &&
          !player.waitingForNextGame
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

      if (categoryNames.length === 0) {
        return;
      }

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

      if (
        imposterMode === "similar-word" &&
        otherWords.length === 0
      ) {
        return;
      }

      const similarWord =
        imposterMode === "similar-word"
          ? otherWords[
              Math.floor(
                Math.random() *
                otherWords.length
              )
            ]
          : undefined;

      const startingPlayer = Math.floor(Math.random() * players.length);

      players.forEach(
        (player: any) => {
          player.location = "game";
          player.waitingForNextGame = false;
        }
      );

      lobby.gameStarted = true;
      lobby.gameState = {
        mode : lobby.settings?.mode || "imposter",
        category: randomCategory,
        word: randomWord,
        imposterMode,
        imposterWord: similarWord,
        turnTime: lobby.settings?.imposter?.turnTime || 45,
        phase: "discussion",
        currentTurn: startingPlayer,
        round: 1,
        spokenPlayers: [],

        votes: {},
        roundMessage: undefined,
        voteResults: [],
        playAgainVotes: {},
        eliminatedPlayers: [],
        endReason: "normal",

        players: players.map((player: any, index: number) => ({
          ...player,
          location:"game",
          role: imposterIndexes.has(index) ? "imposter" : "innocent",
        })),
      };

      players.forEach(
        (player: any) => {
          if (!player.socketId) return;

          const safeLobby =
            getLobbyForPlayer(
              lobby,
              player.id
            );

          io.to(player.socketId).emit(
            "game-started",
            safeLobby
          );
        }
      );

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });
    
    //next turn event
    socket.on("next-turn", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
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

        emitLobbyUpdate(
          io,
          code,
          lobby
        );
        return;
      }

      let nextIndex =
        (lobby.gameState.currentTurn + 1) %
        lobby.gameState.players.length;

      while (
        lobby.gameState.eliminatedPlayers?.includes(
          lobby.gameState.players[nextIndex].id
        ) ||
        lobby.gameState.players[nextIndex].connected === false
      ) {
        nextIndex =
          (nextIndex + 1) %
          lobby.gameState.players.length;
      }

      lobby.gameState.currentTurn = nextIndex;

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });

    //players sumbitting their votes at the voting phase
    socket.on("submit-vote", ({ code, vote }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby?.gameState) return;
      if (lobby.gameState.phase !== "voting") return;

      if (
        isRateLimited(
          socket.id,
          "vote",
          3,
          5000
        )
      ) {
        return;
      }

      const voter = lobby.gameState.players.find(
        (player: any) => player.socketId === socket.id
      );

      if (!voter) return;

      if (lobby.gameState.eliminatedPlayers?.includes(voter.id)){
        return;
      }

      // Prevent voting for yourself
      if (vote === voter.id) {
        return;
      }
      
      const validTarget =
        vote === "skip" ||
        lobby.gameState.players.some(
          (player: any) =>
            player.id === vote &&
            player.connected !== false &&
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

      const voteCount = Object.keys(
        lobby.gameState.votes
      ).length;

      const totalPlayers =
        getActivePlayers(
          lobby.gameState
        ).length;

      if (voteCount < totalPlayers) {
        emitLobbyUpdate(
          io,
          code,
          lobby
        );

        return;
      }

      resolveVotes(
        io,
        code,
        lobby
      );
    });

    //play again
    socket.on(
      "play-again",
      ({ code }) => {
        if (!isSocketInLobby(socket, code)) {
          return;
        }
        const lobby =
          lobbies[code];

        if (!lobby?.gameState) return;

        if (
          lobby.gameState.phase !==
          "results"
        ) {
          return;
        }

        const player =
          lobby.gameState.players.find(
            (player: any) =>
              player.socketId ===
              socket.id
          );

        if (!player) return;

        if (
          !lobby.gameState
            .playAgainVotes
        ) {
          lobby.gameState
            .playAgainVotes = {};
        }

        // Prevent duplicates
        if (
          lobby.gameState
            .playAgainVotes[player.id]
        ) {
          return;
        }

        lobby.gameState
          .playAgainVotes[player.id] =
          true;

        if (
          !canStartPlayAgain(lobby)
        ) {
          emitLobbyUpdate(
            io,
            code,
            lobby
          );

          return;
        }

        startPlayAgainGame(
          io,
          code,
          lobby
        );
      }
    );

    // return to lobby
    socket.on("return-to-lobby", ({ code }) => {
      if (!isSocketInLobby(socket, code)) {
        return;
      }
      const lobby = lobbies[code];

      if (!lobby) return;

      const player = lobby.players.find(
        (player: any) =>
          player.socketId === socket.id
      );

      if (!player) return;

      const leavingPlayerId = player.id;
      const wasHost = player.isHost;

      player.location = "lobby";
      player.isReady = false;
      player.waitingForNextGame = true;

      if (lobby.gameState?.players) {
        // Remove player from active game
        lobby.gameState.players =
          lobby.gameState.players.filter(
            (gamePlayer: any) =>
              gamePlayer.id !== leavingPlayerId
          );

        // Remove their vote
        if (lobby.gameState.votes) {
          delete lobby.gameState.votes[
            leavingPlayerId
          ];

          // Remove votes targeting them
          for (
            const voterId in
            lobby.gameState.votes
          ) {
            if (
              lobby.gameState.votes[voterId] ===
              leavingPlayerId
            ) {
              delete lobby.gameState.votes[
                voterId
              ];
            }
          }
        }

        // Remove their Play Again vote
        if (
          lobby.gameState
            .playAgainVotes
        ) {
          delete lobby.gameState
            .playAgainVotes[
              leavingPlayerId
            ];
        }

        const remainingPlayers =
          getActivePlayers(
            lobby.gameState
          ).length;

        // End active game if fewer than 3 remain
        if (remainingPlayers < 3) {
          lobby.gameStarted = false;
          lobby.gameState = null;

          lobby.players =
            lobby.players.map(
              (lobbyPlayer: any, index: number) => ({
                ...lobbyPlayer,
                isHost: index === 0,
                isReady: false,
                location: "lobby",
                waitingForNextGame: false,
              })
            );

          io.to(code).emit(
            "return-to-lobby"
          );

          emitLobbyUpdate(
            io,
            code,
            lobby
          );

          return;
        }

        // If host leaves the active game,
        // transfer host to another active player
        if (wasHost) {
          const newGameHost =
            lobby.gameState.players.find(
              (gamePlayer: any) =>
                gamePlayer.connected !== false
            );

          if (newGameHost) {
            const newHost =
              lobby.players.find(
                (lobbyPlayer: any) =>
                  lobbyPlayer.id === newGameHost.id
              );

            if (newHost) {
              lobby.players.forEach(
                (lobbyPlayer: any) => {
                  lobbyPlayer.isHost =
                    lobbyPlayer.id === newHost.id;
                }
              );

              lobby.gameState.players.forEach(
                (gamePlayer: any) => {
                  gamePlayer.isHost =
                    gamePlayer.id === newHost.id;
                }
              );
            }
          }
        }

        // If someone leaves Results and everyone
        // remaining already chose Play Again,
        // automatically start the next game.
        if (
          lobby.gameState.phase === "results" &&
          canStartPlayAgain(lobby)
        ) {
          startPlayAgainGame(
            io,
            code,
            lobby
          );

          return;
        }

        // If enough votes already remain, resolve them
        if (
          lobby.gameState.phase === "voting"
        ) {
          const voteCount =
            Object.keys(
              lobby.gameState.votes || {}
            ).length;

          const totalPlayers =
            getActivePlayers(
              lobby.gameState
            ).length;

          if (
            totalPlayers > 0 &&
            voteCount >= totalPlayers
          ) {
            resolveVotes(
              io,
              code,
              lobby
            );

            return;
          }
        }

        // Restart the round if someone leaves
        // during an active phase
        if (
          lobby.gameState.phase ===
            "discussion" ||
          lobby.gameState.phase ===
            "voting" ||
          lobby.gameState.phase ===
            "transition"
        ) {
          const activePlayers =
            getActivePlayers(
              lobby.gameState
            );

          lobby.gameState.phase =
            "discussion";

          const randomPlayer =
            activePlayers[
              Math.floor(
                Math.random() *
                  activePlayers.length
              )
            ];

          lobby.gameState.currentTurn =
            lobby.gameState.players.findIndex(
              (gamePlayer: any) =>
                gamePlayer.id === randomPlayer.id
            );

          lobby.gameState.spokenPlayers = [];
          lobby.gameState.votes = {};
          lobby.gameState.voteResults = [];

          lobby.gameState.roundMessage =
            `${player.name} returned to the lobby. The round has restarted.`;
        }
      }

      emitLobbyUpdate(
        io,
        code,
        lobby
      );
    });
    
  // Disconnect handling
  socket.on("disconnect", () => {
    socketRateLimits.delete(
      socket.id
    );
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

      // If the current speaker disconnects,
      // immediately move to the next active player.
      if (
        leavingGamePlayer &&
        lobby.gameState?.phase === "discussion"
      ) {
        const currentPlayer =
          lobby.gameState.players[
            lobby.gameState.currentTurn
          ];

        if (currentPlayer?.id === leavingPlayerId) {
          const activePlayers =
            getActivePlayers(lobby.gameState);

          // Only continue if someone else is active.
          if (activePlayers.length > 0) {
            let nextIndex =
              (lobby.gameState.currentTurn + 1) %
              lobby.gameState.players.length;

            while (
              lobby.gameState.eliminatedPlayers?.includes(
                lobby.gameState.players[nextIndex].id
              ) ||
              lobby.gameState.players[nextIndex]
                .connected === false
            ) {
              nextIndex =
                (nextIndex + 1) %
                lobby.gameState.players.length;
            }

            lobby.gameState.currentTurn = nextIndex;
          }
        }
      }

      emitLobbyUpdate(
        io,
        code,
        lobby
      );

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
          // Find another connected player to become host
          const newHost =
            currentLobby.players.find(
              (player: any) =>
                player.connected !== false
            );

          // Nobody remains in the lobby
          if (!newHost) {
            delete lobbies[code];
            delete playerSessions[code];
            delete kickedPlayers[code];
            return;
          }

          // Remove old host from active game
          if (currentLobby.gameState?.players) {
            currentLobby.gameState.players =
              currentLobby.gameState.players.filter(
                (player: any) =>
                  player.id !== leavingPlayerId
              );
          }

          // Remove old host's vote
          if (currentLobby.gameState?.votes) {
            delete currentLobby.gameState.votes[
              leavingPlayerId
            ];

            // Remove votes targeting the old host
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

          // Remove old host's Play Again vote
          if (
            currentLobby.gameState?.playAgainVotes
          ) {
            delete currentLobby.gameState
              .playAgainVotes[leavingPlayerId];
          }

          //make sure enough players remain
          const remainingPlayers =
            currentLobby.gameState
              ? getActivePlayers(
                  currentLobby.gameState
                ).length
              : currentLobby.players.filter(
                  (player: any) =>
                    player.connected !== false
                ).length;

          if (remainingPlayers < 3) {
            currentLobby.gameStarted = false;
            currentLobby.gameState = null;

            currentLobby.players =
              currentLobby.players.map(
                (player: any, index: number) => ({
                  ...player,
                  isHost: index === 0,
                  isReady: false,
                  location: "lobby",
                  waitingForNextGame: false,
                })
              );

            io.to(code).emit(
              "return-to-lobby"
            );

            emitLobbyUpdate(
              io,
              code,
              currentLobby
            );

            return;
          }

          // Make sure only one lobby player is host
          currentLobby.players.forEach(
            (player: any) => {
              player.isHost = false;
            }
          );

          newHost.isHost = true;

          // Sync host status into active game
          if (currentLobby.gameState?.players) {
            currentLobby.gameState.players.forEach(
              (player: any) => {
                player.isHost =
                  player.id === newHost.id;
              }
            );
          }

          // Results / Play Again
          if (
            currentLobby.gameState?.phase === "results" &&
            canStartPlayAgain(currentLobby)
          ) {
            startPlayAgainGame(
              io,
              code,
              currentLobby
            );

            return;
          }

          // Handle voting after the host disconnects
          if (
            currentLobby.gameState?.phase === "voting"
          ) {
            const voteCount = Object.keys(
              currentLobby.gameState.votes || {}
            ).length;

            const totalPlayers =
              getActivePlayers(
                currentLobby.gameState
              ).length;

            // Enough votes remain — resolve normally
            if (
              totalPlayers > 0 &&
              voteCount >= totalPlayers
            ) {
              resolveVotes(
                io,
                code,
                currentLobby
              );

              return;
            }

            // Not enough votes remain — restart discussion
            const activePlayers =
              getActivePlayers(
                currentLobby.gameState
              );

            if (activePlayers.length > 0) {
              currentLobby.gameState.phase =
                "discussion";

              const randomPlayer =
                activePlayers[
                  Math.floor(
                    Math.random() *
                      activePlayers.length
                  )
                ];

              currentLobby.gameState.currentTurn =
                currentLobby.gameState.players.findIndex(
                  (player: any) =>
                    player.id === randomPlayer.id
                );

              currentLobby.gameState.spokenPlayers = [];
              currentLobby.gameState.votes = {};
              currentLobby.gameState.voteResults = [];

              currentLobby.gameState.roundMessage =
                `${currentPlayer.name} disconnected during voting. The round has restarted.`;
            }
          }

          // Restart the round if host disconnected
          // during discussion or transition
          if (
            currentLobby.gameState?.phase === "discussion" ||
            currentLobby.gameState?.phase === "transition"
          ) {
            const activePlayers =
              getActivePlayers(
                currentLobby.gameState
              );

            if (activePlayers.length > 0) {
              currentLobby.gameState.phase =
                "discussion";

              const randomPlayer =
                activePlayers[
                  Math.floor(
                    Math.random() *
                      activePlayers.length
                  )
                ];

              currentLobby.gameState.currentTurn =
                currentLobby.gameState.players.findIndex(
                  (player: any) =>
                    player.id === randomPlayer.id
                );

              currentLobby.gameState.spokenPlayers = [];
              currentLobby.gameState.votes = {};
              currentLobby.gameState.voteResults = [];

              currentLobby.gameState.roundMessage =
                `${currentPlayer.name} disconnected. The round has restarted.`;
            }
          }

          emitLobbyUpdate(
            io,
            code,
            currentLobby
          );

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
                (
                  player: any,
                  index: number
                ) => ({
                  ...player,
                  isHost: index === 0,
                  isReady: false,
                  location: "lobby",
                  waitingForNextGame: false,
                })
              );

            io.to(code).emit(
              "return-to-lobby"
            );

            emitLobbyUpdate(
              io,
              code,
              currentLobby
            );

            return;
          }

          if (
            currentLobby.gameState.phase === "results" &&
            canStartPlayAgain(currentLobby)
          ) {
            startPlayAgainGame(
              io,
              code,
              currentLobby
            );

            return;
          }

          // Check whether voting can finish
          // after a player disconnects
          if (
            currentLobby.gameState.phase === "voting"
          ) {
            const voteCount = Object.keys(
              currentLobby.gameState.votes || {}
            ).length;

            const totalPlayers =
              getActivePlayers(
                currentLobby.gameState
              ).length;

            if (
              totalPlayers > 0 &&
              voteCount >= totalPlayers
            ) {
              resolveVotes(
                io,
                code,
                currentLobby
              );

              return;
            }
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

        emitLobbyUpdate(
          io,
          code,
          currentLobby
        );

        if (currentLobby.players.length === 0) {
          delete lobbies[code];
          delete playerSessions[code];
          delete kickedPlayers[code];
        }
      }, 15000);
    }
  });

  }); // close io.on("connection")

  return io;
}