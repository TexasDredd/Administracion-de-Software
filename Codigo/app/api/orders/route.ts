import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { 
  orders, 
  orderAssignments, 
  clients, 
  orderItems,
  partyProducts,
  eventProducts,
  users,
  eventLogs
} from "@/src/lib/db/schema";
import { produceEvent } from "@/src/lib/kafka/client";
import { eq, and, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Helper to fetch and resolve item details (name, sku, category) for a given order
async function fetchOrderItems(orderId: string) {
  const itemsList = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      productType: orderItems.productType,
      quantity: orderItems.quantity
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const resolvedItems = await Promise.all(
    itemsList.map(async (item) => {
      let name = "Unknown Item";
      let sku = "N/A";
      let detail = "";

      if (item.productType === "PARTY") {
        const prod = await db
          .select({ name: partyProducts.name, sku: partyProducts.sku })
          .from(partyProducts)
          .where(eq(partyProducts.id, item.productId))
          .limit(1);
        if (prod.length > 0) {
          name = prod[0].name;
          sku = prod[0].sku;
        }
      } else {
        const prod = await db
          .select({ name: eventProducts.name, sku: eventProducts.sku, size: eventProducts.size, style: eventProducts.style })
          .from(eventProducts)
          .where(eq(eventProducts.id, item.productId))
          .limit(1);
        if (prod.length > 0) {
          name = prod[0].name;
          sku = prod[0].sku;
          detail = `Size: ${prod[0].size || ""}, Style: ${prod[0].style || ""}`;
        }
      }

      return {
        ...item,
        name,
        sku,
        detail
      };
    })
  );

  return resolvedItems;
}

// 1. GET: Fetch ongoing/unassigned orders
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    if (orderId) {
      const orderRecord = await db
        .select({
          id: orders.id,
          division: orders.division,
          status: orders.status,
          pickupDate: orders.pickupDate,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          driverId: orderAssignments.driverId,
          driverName: users.name,
          clientName: clients.name,
          clientPhone: clients.phone,
          clientEmail: clients.email,
          clientAddress: clients.address,
        })
        .from(orders)
        .leftJoin(orderAssignments, eq(orders.id, orderAssignments.orderId))
        .leftJoin(users, eq(orderAssignments.driverId, users.id))
        .innerJoin(clients, eq(orders.clientId, clients.id))
        .where(eq(orders.id, orderId))
        .limit(1);

      if (orderRecord.length === 0) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const items = await fetchOrderItems(orderId);
      return NextResponse.json({
        success: true,
        order: { ...orderRecord[0], items }
      });
    }

    const userId = searchParams.get("userId");
    const role = searchParams.get("role"); // 'OFFICE' | 'DRIVER'

    if (!userId || !role) {
      return NextResponse.json({ error: "Missing userId or role" }, { status: 400 });
    }

    if (role === "OFFICE") {
      // A. Fetch all active/completed orders (anything that is NOT status 'PENDING')
      const activeOrdersList = await db
        .select({
          id: orders.id,
          division: orders.division,
          status: orders.status,
          pickupDate: orders.pickupDate,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          driverId: orderAssignments.driverId,
          driverName: users.name,
          clientName: clients.name,
          clientPhone: clients.phone,
          clientAddress: clients.address,
        })
        .from(orders)
        .leftJoin(orderAssignments, eq(orders.id, orderAssignments.orderId))
        .leftJoin(users, eq(orderAssignments.driverId, users.id))
        .innerJoin(clients, eq(orders.clientId, clients.id))
        .where(sql`${orders.status} != 'PENDING'`);

      // B. Fetch all unassigned oncoming orders (status = 'PENDING')
      const oncomingOrdersList = await db
        .select({
          id: orders.id,
          division: orders.division,
          status: orders.status,
          pickupDate: orders.pickupDate,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          clientName: clients.name,
          clientEmail: clients.email,
          clientPhone: clients.phone,
          clientAddress: clients.address,
        })
        .from(orders)
        .innerJoin(clients, eq(orders.clientId, clients.id))
        .where(eq(orders.status, "PENDING"));

      // C. Resolve manifest items for active orders
      const activeWithItems = await Promise.all(
        activeOrdersList.map(async (order) => {
          const items = await fetchOrderItems(order.id);
          return { ...order, items };
        })
      );

      // D. Resolve manifest items for oncoming orders
      const oncomingWithItems = await Promise.all(
        oncomingOrdersList.map(async (order) => {
          const items = await fetchOrderItems(order.id);
          return { ...order, items };
        })
      );

      return NextResponse.json({
        success: true,
        activeOrders: activeWithItems,
        unassignedContracts: oncomingWithItems // Kept name unassignedContracts for frontend backwards-compatibility
      });

    } else if (role === "DRIVER") {
      // Fetch only active orders assigned to this driver
      const driverOrders = await db
        .select({
          id: orders.id,
          division: orders.division,
          status: orders.status,
          pickupDate: orders.pickupDate,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          clientName: clients.name,
          clientPhone: clients.phone,
          clientEmail: clients.email,
          clientAddress: clients.address, // place
        })
        .from(orders)
        .innerJoin(orderAssignments, eq(orders.id, orderAssignments.orderId))
        .innerJoin(clients, eq(orders.clientId, clients.id))
        .where(eq(orderAssignments.driverId, userId));

      // Resolve manifest items for driver's tasks
      const driverOrdersWithItems = await Promise.all(
        driverOrders.map(async (order) => {
          const items = await fetchOrderItems(order.id);
          return { ...order, items };
        })
      );

      return NextResponse.json({
        success: true,
        activeOrders: driverOrdersWithItems
      });
    }

    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  } catch (error: any) {
    console.error("GET orders error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

// 2. POST: Office Member assigns an oncoming PENDING order to a driver
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, driverId } = body; // Expects orderId (oncoming UUID) and driverId (Clerk ID)

    if (!orderId || !driverId) {
      return NextResponse.json({ error: "Missing orderId or driverId" }, { status: 400 });
    }

    // A. Verify the oncoming order exists and is currently PENDING
    const existingOrder = await db
      .select({
        id: orders.id,
        status: orders.status,
        division: orders.division,
        clientId: orders.clientId,
        clientName: clients.name,
        clientAddress: clients.address,
      })
      .from(orders)
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (existingOrder.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderRecord = existingOrder[0];
    if (orderRecord.status === "COMPLETED") {
      return NextResponse.json({ error: "Cannot re-assign a finished/completed order." }, { status: 400 });
    }

    // B. Fetch driver name to verify they exist
    const driverRecord = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, driverId))
      .limit(1);

    if (driverRecord.length === 0) {
      return NextResponse.json({ error: "Selected driver not found in the database." }, { status: 404 });
    }

    // Fetch items manifest
    const items = await fetchOrderItems(orderId);

    // C. Perform DB updates inside a transaction
    const now = new Date();
    const updatedOrder = await db.transaction(async (tx) => {
      // 1. Update the Order status to 'ASSIGNED' and reset timestamp
      const [orderRow] = await tx
        .update(orders)
        .set({
          status: "ASSIGNED",
          updatedAt: now
        })
        .where(eq(orders.id, orderId))
        .returning();

      // 2. Delete any existing assignment(s) for this order to enable clean re-assignment
      await tx.delete(orderAssignments).where(eq(orderAssignments.orderId, orderId));

      // 3. Insert new Assignment
      await tx.insert(orderAssignments).values({
        orderId,
        driverId,
        assignedAt: now
      });

      // 3. Log event locally
      await tx.insert(eventLogs).values({
        orderId,
        eventType: "office.order.assigned",
        payload: JSON.stringify({
          driverId,
          driverName: driverRecord[0].name,
          clientId: orderRecord.clientId,
          clientName: orderRecord.clientName,
          items
        }),
        timestamp: now
      });

      return orderRow;
    });

    console.log(`[Order Assignment] Order ${orderId} assigned to driver ${driverId}.`);

    // D. Produce Event to Kafka: tasks.lifecycle.assigned topic
    const eventPayload = {
      orderId,
      driverId,
      division: orderRecord.division,
      clientName: orderRecord.clientName,
      clientAddress: orderRecord.clientAddress,
      items,
      timestamp: now.toISOString()
    };

    await produceEvent(
      "tasks.lifecycle.assigned",
      "office.order.assigned",
      eventPayload
    );

    console.log(`[Kafka Produced] office.order.assigned event published to Kafka.`);

    return NextResponse.json({
      success: true,
      message: "Order successfully assigned and published to Kafka!",
      order: updatedOrder
    });

  } catch (error: any) {
    console.error("POST orders error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

// 3. DELETE: Cancel/Reset order to PENDING or purge it entirely from PostgreSQL
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const action = searchParams.get("action"); // 'cancel' (reset to PENDING) or 'delete' (purge from DB)

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    if (action === "delete") {
      // Purge permanently
      await db.transaction(async (tx) => {
        await tx.delete(eventLogs).where(eq(eventLogs.orderId, orderId));
        await tx.delete(orderAssignments).where(eq(orderAssignments.orderId, orderId));
        await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await tx.delete(orders).where(eq(orders.id, orderId));
      });

      console.log(`[Admin] Purged order ${orderId} permanently.`);
      
      return NextResponse.json({
        success: true,
        message: "Order successfully purged from database."
      });
    } else {
      // Cancel assignment - reset status to PENDING and delete assignments
      await db.transaction(async (tx) => {
        await tx.delete(orderAssignments).where(eq(orderAssignments.orderId, orderId));
        await tx.update(orders)
          .set({ status: "PENDING", updatedAt: new Date() })
          .where(eq(orders.id, orderId));
      });

      console.log(`[Admin] Cancelled assignments for order ${orderId}, reset to PENDING.`);
      
      return NextResponse.json({
        success: true,
        message: "Order assignment cancelled and returned to oncoming pool."
      });
    }

  } catch (error: any) {
    console.error("DELETE orders error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
