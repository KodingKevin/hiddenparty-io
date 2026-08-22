import { io } from "socket.io-client";

const socketUrl =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

export const socket = io(
  socketUrl,
  {
    autoConnect: false,
  }
);