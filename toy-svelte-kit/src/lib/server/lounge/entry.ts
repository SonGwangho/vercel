import { createServer } from "node:http";
import { attachLoungeSockets } from "./socket";

const server = createServer((_request, response) => { response.writeHead(426, { "content-type": "text/plain" }); response.end("WebSocket connection required"); });
attachLoungeSockets(server, {
  databaseUrl: process.env.DATABASE_URL ?? "",
  secret: process.env.LOUNGE_SOCKET_SECRET || process.env.DATABASE_URL || "",
  scope: `campground-v1:${process.env.VERCEL_ENV ?? "local"}:${process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"}`
});
export default server;
