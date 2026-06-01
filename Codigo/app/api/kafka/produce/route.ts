import { NextResponse } from "next/server";
import { produceEvent } from "@/src/lib/kafka/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[Kafka Test Ping] Producing ping event at ${timestamp}...`);
    
    await produceEvent(
      "tasks.lifecycle.progress", 
      "test.ping", 
      { 
        message: "Kafka broker connectivity verified!",
        timestamp 
      }
    );
    
    console.log("[Kafka Test Ping] Event published successfully.");
    
    return NextResponse.json({ 
      success: true, 
      message: "Test ping event successfully produced to Kafka topic tasks.lifecycle.progress!",
      timestamp
    });

  } catch (error: any) {
    console.error("[Kafka Test Ping Error] Failed to publish event:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || String(error) 
    }, { status: 500 });
  }
}
