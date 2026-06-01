import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { orders, orderAssignments, eventLogs } from "@/src/lib/db/schema";
import { produceEvent } from "@/src/lib/kafka/client";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, driverId } = body;

    // Validate request parameters
    if (!orderId || !driverId) {
      return NextResponse.json({ error: "Missing orderId or driverId" }, { status: 400 });
    }

    // A. Verify driver assignment
    const assignment = await db
      .select()
      .from(orderAssignments)
      .where(
        and(
          eq(orderAssignments.orderId, orderId),
          eq(orderAssignments.driverId, driverId)
        )
      )
      .limit(1);

    if (assignment.length === 0) {
      return NextResponse.json({ error: "Unauthorized. This task is not assigned to you." }, { status: 403 });
    }

    const now = new Date();

    // B. Perform DB updates inside a transaction
    const completedOrder = await db.transaction(async (tx) => {
      // 1. Immediately update the Order status to COMPLETED locally
      const [orderRow] = await tx
        .update(orders)
        .set({
          status: "COMPLETED",
          updatedAt: now
        })
        .where(eq(orders.id, orderId))
        .returning();

      // 2. Log event locally in database
      await tx.insert(eventLogs).values({
        orderId,
        eventType: "driver.order.completed",
        payload: JSON.stringify({
          status: "COMPLETED",
          driverId,
          completedAt: now.toISOString()
        }),
        timestamp: now
      });

      return orderRow;
    });

    console.log(`[Order Completed] Order ${orderId} finalized by driver ${driverId}.`);

    // C. Produce event to Kafka: tasks.lifecycle.completed topic
    const eventPayload = {
      orderId,
      driverId,
      status: "COMPLETED",
      completedAt: now.toISOString(),
      timestamp: now.toISOString()
    };

    await produceEvent(
      "tasks.lifecycle.completed",
      "driver.order.completed",
      eventPayload
    );

    console.log(`[Kafka Produced] driver.order.completed event published to Kafka.`);

    return NextResponse.json({
      success: true,
      message: "Order successfully completed and published to Kafka!",
      order: completedOrder
    });

  } catch (error: any) {
    console.error("POST complete error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
