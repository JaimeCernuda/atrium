import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@atrium/shared";

export type AtriumSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AtriumSocket | null = null;

export function getSocket(): AtriumSocket {
  if (!socket) {
    socket = io({ withCredentials: true, autoConnect: false });
  }
  return socket;
}
