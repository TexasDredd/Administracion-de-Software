import { NextRequest } from "next/server";
import { serverEvents } from "@/src/lib/kafka/events";
import { startKafkaConsumer } from "@/src/lib/kafka/consumer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const role = searchParams.get("role"); // 'OFFICE' | 'DRIVER'

  if (!userId || !role) {
    return new Response(JSON.stringify({ error: "Missing userId or role" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  console.log(`[SSE Connection] Client connected: userId=${userId}, role=${role}`);

  // Ensure Kafka consumer is up and listening
  // It runs in the background as a singleton
  startKafkaConsumer().catch(err => {
    console.error("Error starting Kafka Consumer in SSE connection:", err);
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send initial handshake connection event
      const initMessage = `data: ${JSON.stringify({ type: "connection", message: "SSE Connection Established" })}\n\n`;
      controller.enqueue(encoder.encode(initMessage));

      // Keepalive heartbeat interval to prevent gateway timeouts (e.g. AWS ALB, NGINX, Cloudflare)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch (err) {
          // Client disconnected
          clearInterval(heartbeat);
        }
      }, 15000);

      // 2. Define the event listener for incoming Kafka events
      const onKafkaEvent = (data: { topic: string; key: string; event: any }) => {
        try {
          const { topic, event } = data;
          const { payload } = event;

          let shouldPush = false;

          if (role === "OFFICE") {
            // Office sees all operational event updates
            shouldPush = true;
          } else if (role === "DRIVER") {
            // Drivers only receive events related to their assignments
            if (payload && (payload.driverId === userId || payload.driver_id === userId)) {
              shouldPush = true;
            }
          }

          if (shouldPush) {
            // console.log(`[SSE Push] Pushing event to ${userId} (${role}) on topic ${topic}`);
            const sseData = `data: ${JSON.stringify({ topic, event })}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        } catch (err) {
          console.error(`[SSE Push Error] Failed to push to client ${userId}:`, err);
        }
      };

      // Register the event emitter listener
      serverEvents.on("kafka-event", onKafkaEvent);

      // 3. Handle connection close and cleanup
      req.signal.addEventListener("abort", () => {
        console.log(`[SSE Connection] Client disconnected: userId=${userId}`);
        clearInterval(heartbeat);
        serverEvents.off("kafka-event", onKafkaEvent);
        try {
          controller.close();
        } catch (e) {}
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Encoding": "none"
    }
  });
}
