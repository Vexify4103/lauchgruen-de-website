import type { Server as SocketIOServer } from "socket.io";

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    });
  });
}
