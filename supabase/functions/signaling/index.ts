const rooms = new Map();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const upgrade = req.headers.get("upgrade") || "";

    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket connection", {
        status: 426,
        headers: corsHeaders,
      });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);

    let userId: string | null = null;
    let roomId: string | null = null;

    socket.onopen = () => {
      console.log("WebSocket connection opened");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type } = message;

        switch (type) {
          case "join":
            userId = message.username;
            roomId = message.roomId;

            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Map());
            }

            const room = rooms.get(roomId);
            room.set(userId, socket);

            console.log(`User ${userId} joined room ${roomId}`);

            room.forEach((peerSocket, peerId) => {
              if (peerId !== userId && peerSocket.readyState === WebSocket.OPEN) {
                peerSocket.send(JSON.stringify({
                  type: "user-joined",
                  from: userId,
                  roomId: roomId
                }));
              }
            });
            break;

          case "offer":
          case "answer":
          case "ice-candidate":
            if (roomId && rooms.has(roomId)) {
              const room = rooms.get(roomId);
              const targetSocket = room.get(message.to);

              if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                targetSocket.send(JSON.stringify({
                  type: message.type,
                  from: userId,
                  roomId: roomId,
                  offer: message.offer,
                  answer: message.answer,
                  candidate: message.candidate
                }));
              }
            }
            break;

          default:
            console.log("Unknown message type:", type);
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");

      if (roomId && userId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.delete(userId);

        room.forEach((peerSocket, peerId) => {
          if (peerSocket.readyState === WebSocket.OPEN) {
            peerSocket.send(JSON.stringify({
              type: "user-left",
              from: userId,
              roomId: roomId
            }));
          }
        });

        if (room.size === 0) {
          rooms.delete(roomId);
        }
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  } catch (error) {
    console.error("Error in signaling server:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});