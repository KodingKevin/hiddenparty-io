import { createServer } from "http";
import { setupSocket } from "./src/server/socket";

const httpServer = createServer();

setupSocket(httpServer);

httpServer.listen(3001, () => {
  console.log("Socket.IO server running on http://localhost:3001");
});