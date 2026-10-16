import { SignallingServer } from "@epicgames-ps/lib-pixelstreamingsignalling-ue5.8";

// Vite terminates browser TLS and proxies /unreal-stream to the player socket.
// Both native sockets stay on this machine. No SFU, TURN, or public listener.
const host = "127.0.0.1";
const streamerPort = 18888;
const playerPort = 18889;

new SignallingServer({
  streamerPort,
  playerPort,
  streamerWsOptions: { host },
  playerWsOptions: { host },
  peerOptions: {},
  maxSubscribers: 1,
  playerKeepaliveTimeout: 30000,
});

console.log(
  `Composer Pixel Streaming signalling: streamer ws://${host}:${streamerPort}, player ws://${host}:${playerPort}`,
);
