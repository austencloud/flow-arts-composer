import { createServer } from "node:http";
import { SignallingServer } from "@epicgames-ps/lib-pixelstreamingsignalling-ue5.8";

// Vite terminates browser TLS and proxies /unreal-stream to the player socket.
// Both native sockets stay on this machine. No SFU, TURN, or public listener.
const host = "127.0.0.1";
const streamerPort = 18888;
const playerPort = 18889;

const httpServer = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(
    JSON.stringify({
      service: "composer-viewer",
      streamerReady: !!signalling.streamerRegistry.find("ComposerViewer"),
    })
  );
});
const signalling = new SignallingServer({
  httpServer,
  streamerPort,
  playerPort,
  streamerWsOptions: { host },
  peerOptions: {},
  maxSubscribers: 1,
  playerKeepaliveTimeout: 30000,
});
httpServer.listen(playerPort, host);

console.log(
  `Composer Pixel Streaming signalling: streamer ws://${host}:${streamerPort}, player ws://${host}:${playerPort}`
);
