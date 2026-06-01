import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { 
  clients, 
  orders, 
  orderItems, 
  eventLogs 
} from "@/src/lib/db/schema";
import { produceEvent } from "@/src/lib/kafka/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      clientName, 
      clientPhone, 
      clientEmail, 
      clientAddress, 
      division, 
      items,
      pickupDate 
    } = body;

    // Validate request parameters
    if (!clientName || !clientAddress || !division || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ 
        error: "Missing required fields: clientName, clientAddress, division, or items manifest list." 
      }, { status: 400 });
    }

    const allowedDivisions = ["PARTY", "EVENTS"];
    if (!allowedDivisions.includes(division)) {
      return NextResponse.json({ error: "Invalid division. Must be 'PARTY' or 'EVENTS'." }, { status: 400 });
    }

    // A. Perform database operations inside an atomic transaction
    const now = new Date();
    const newOrder = await db.transaction(async (tx) => {
      // 1. Create client profile
      const [clientRow] = await tx
        .insert(clients)
        .values({
          name: clientName.trim(),
          phone: clientPhone ? clientPhone.trim() : null,
          email: clientEmail ? clientEmail.trim().toLowerCase() : null,
          address: clientAddress.trim(),
          createdAt: now
        })
        .returning();

      // 2. Create the PENDING order (Oncoming client task waiting for assignment)
      const [orderRow] = await tx
        .insert(orders)
        .values({
          clientId: clientRow.id,
          division: division,
          status: "PENDING", // ONCOMING
          pickupDate: pickupDate ? pickupDate.trim() : null,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      // 3. Insert manifest loadout items
      const itemValues = items.map((item: any) => ({
        orderId: orderRow.id,
        productId: item.productId,
        productType: item.productType, // 'PARTY' | 'EVENTS'
        quantity: item.quantity
      }));
      await tx.insert(orderItems).values(itemValues);

      // 4. Create local DB event audit
      await tx.insert(eventLogs).values({
        orderId: orderRow.id,
        eventType: "client.order.created",
        payload: JSON.stringify({
          clientName: clientRow.name,
          clientAddress: clientRow.address,
          itemsCount: items.length
        }),
        timestamp: now
      });

      return {
        order: orderRow,
        client: clientRow
      };
    });

    console.log(`[Client Portal] Order ${newOrder.order.id} submitted by client '${clientName}'.`);

    // B. Publish Event to Kafka: tasks.lifecycle.assigned topic
    // The main dispatch system listens to this topic and will auto-refresh the Office unassigned contracts board in real-time!
    const eventPayload = {
      orderId: newOrder.order.id,
      clientId: newOrder.client.id,
      clientName: newOrder.client.name,
      clientAddress: newOrder.client.address,
      division: newOrder.order.division,
      status: "PENDING",
      pickupDate: newOrder.order.pickupDate,
      timestamp: now.toISOString()
    };

    await produceEvent(
      "tasks.lifecycle.assigned",
      "client.order.created",
      eventPayload
    );

    console.log(`[Kafka Produced] client.order.created event published to Kafka.`);

    return NextResponse.json({
      success: true,
      message: "Order successfully submitted! Our logistics team will review and dispatch a specialist shortly.",
      orderId: newOrder.order.id
    });

  } catch (error: any) {
    console.error("[Client Portal API Error] Failed to submit order:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
