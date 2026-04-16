import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Room } from "@atrium/shared";

const PORT = Number(process.env.PORT ?? 8090);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/rooms", async (): Promise<Room[]> => [
  { id: "lobby", name: "Lobby", disableMeeting: true, color: "#9e9e9e" },
]);

await app.listen({ port: PORT, host: "0.0.0.0" });
