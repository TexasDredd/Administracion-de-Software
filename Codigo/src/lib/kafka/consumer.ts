import { consumer } from "./client";
import { serverEvents } from "./events";
import { db } from "@/src/lib/db/db";
import { orders } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

declare global {
  var _kafkaConsumerStarted: boolean | undefined;
}

export async function startKafkaConsumer() {
  // Prevent duplicate consumer loops during Next.js hot-reloading
  if (global._kafkaConsumerStarted) {
    console.log("Kafka Consumer is already running (singleton).");
    return;
  }

  global._kafkaConsumerStarted = true;
  console.log("Initializing Kafka Consumer singleton...");

  try {
    await consumer.connect();
    console.log("Kafka Consumer connected successfully.");

    // Subscribe to the three lifecycle topics
    const topics = [
      "tasks.lifecycle.assigned",
      "tasks.lifecycle.progress",
      "tasks.lifecycle.completed"
    ];

    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
      console.log(`Subscribed to topic: ${topic}`);
    }

    // Run the consume loop
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const key = message.key?.toString() || "default";
          const rawValue = message.value?.toString();
          
          if (!rawValue) {
            console.warn(`[Kafka Consumer] Received empty message on topic ${topic}`);
            return;
          }

          const parsed = JSON.parse(rawValue);
          console.log(`[Kafka Consumer] Received event from topic: ${topic}`, parsed);

          // 1. If it's a completion event, persist the completed state to the Database (PostgreSQL)
          if (topic === "tasks.lifecycle.completed") {
            const { orderId } = parsed.payload;
            if (orderId) {
              console.log(`[Kafka Consumer] Asynchronously persisting task completion for Order ${orderId}...`);
              await db
                .update(orders)
                .set({
                  status: "COMPLETED",
                  updatedAt: new Date()
                })
                .where(eq(orders.id, orderId));
              console.log(`[Kafka Consumer] Order ${orderId} marked as COMPLETED in DB.`);
            }
          }

          // 2. Broadcast the event internally so active SSE connections can stream it to dashboards
          serverEvents.emit("kafka-event", {
            topic,
            key,
            event: parsed
          });

        } catch (err) {
          console.error(`[Kafka Consumer] Error processing message on topic ${topic}:`, err);
        }
      }
    });

    console.log("Kafka Consumer loop started successfully.");

  } catch (error) {
    console.error("Failed to start Kafka Consumer:", error);
    global._kafkaConsumerStarted = false;
  }
}
