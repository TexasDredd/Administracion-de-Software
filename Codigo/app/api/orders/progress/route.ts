import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { orders, orderAssignments, eventLogs } from "@/src/lib/db/schema";
import { produceEvent } from "@/src/lib/kafka/client";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, driverId, newStatus } = body;

    // Validate request parameters
    if (!orderId || !driverId || !newStatus) {
      return NextResponse.json({ error: "Missing orderId, driverId, or newStatus" }, { status: 400 });
    }

    const allowedStatuses = ["ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "STANDBY", "OUT_FOR_PICKUP", "PICKED_UP"];
    if (!allowedStatuses.includes(newStatus)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}` }, { status: 400 });
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
    const updatedOrder = await db.transaction(async (tx) => {
      // 1. Update the Order status
      const [orderRow] = await tx
        .update(orders)
        .set({
          status: newStatus,
          updatedAt: now
        })
        .where(eq(orders.id, orderId))
        .returning();

      // 2. Log event locally in database
      await tx.insert(eventLogs).values({
        orderId,
        eventType: "driver.order.status_updated",
        payload: JSON.stringify({
          status: newStatus,
          driverId,
          updatedAt: now.toISOString()
        }),
        timestamp: now
      });

      return orderRow;
    });

    console.log(`[Order Progress] Order ${orderId} updated to ${newStatus} by ${driverId}.`);

    // C. Produce event to Kafka: tasks.lifecycle.progress topic
    const eventPayload = {
      orderId,
      driverId,
      status: newStatus,
      updatedAt: now.toISOString(),
      timestamp: now.toISOString()
    };

    await produceEvent(
      "tasks.lifecycle.progress",
      "driver.order.status_updated",
      eventPayload
    );

    console.log(`[Kafka Produced] driver.order.status_updated event published to Kafka.`);

    return NextResponse.json({
      success: true,
      message: `Task successfully updated to ${newStatus}!`,
      order: updatedOrder
    });

  } catch (error: any) {
    console.error("POST progress error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
