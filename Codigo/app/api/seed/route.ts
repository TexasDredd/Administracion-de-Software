import { NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { 
  users, 
  clients, 
  partyProducts, 
  eventProducts, 
  orders,
  orderItems,
  orderAssignments,
  eventLogs
} from "@/src/lib/db/schema";

export async function GET() {
  try {
    console.log("[Seeder] Cleaning existing tables...");
    
    // Clean tables in reverse dependency order
    await db.delete(eventLogs);
    await db.delete(orderAssignments);
    await db.delete(orderItems);
    await db.delete(orders);
    await db.delete(eventProducts);
    await db.delete(partyProducts);
    await db.delete(clients);
    await db.delete(users);

    console.log("[Seeder] Tables cleared.");

    // 1. Seed Users (Provisioned employees and office members)
    const mockUsers = [
      { id: "user_office_alice", name: "Alice (Office Manager)", email: "alice@diamondevent.com", role: "OFFICE" },
      { id: "user_driver_john", name: "John Doe (Driver)", email: "john@diamondevent.com", role: "DRIVER" },
      { id: "user_driver_sarah", name: "Sarah Connor (Driver)", email: "sarah@diamondevent.com", role: "DRIVER" },
    ];
    await db.insert(users).values(mockUsers);
    console.log("[Seeder] Users seeded.");

    // 2. Seed Clients (Venues and locations)
    const mockClients = [
      {
        name: "Salt Lake Marriott Center",
        email: "events@slcmarriott.com",
        phone: "801-555-0101",
        address: "123 S West Temple, Salt Lake City, UT 84101"
      },
      {
        name: "Park City Lodge",
        email: "logistics@pclodge.com",
        phone: "435-555-0202",
        address: "789 Main St, Park City, UT 84060"
      },
      {
        name: "Red Butte Garden Amphitheatre",
        email: "gala@redbuttegarden.org",
        phone: "801-555-0303",
        address: "300 Wakara Way, Salt Lake City, UT 84108"
      }
    ];
    const insertedClients = await db.insert(clients).values(mockClients).returning();
    console.log("[Seeder] Clients (Venues) seeded.");

    // 3. Seed Party Products
    const mockParty = [
      { sku: "CHAIR-WHITE-FOLD", name: "White Resin Folding Chair", totalQuantity: 1000, price: 250 }, // $2.50
      { sku: "CHAIR-CHIAVARI-GOLD", name: "Gold Chiavari Ballroom Chair", totalQuantity: 400, price: 750 }, // $7.50
      { sku: "TABLE-ROUND-60", name: "60-inch Round Wooden Table", totalQuantity: 150, price: 1500 }, // $15.00
      { sku: "TABLE-BANQUET-8", name: "8ft Rectangular Banquet Table", totalQuantity: 200, price: 1800 }, // $18.00
      { sku: "LINEN-WHITE-ROUND", name: "120-inch Round White Linen", totalQuantity: 250, price: 900 }, // $9.00
      { sku: "PLATE-CHINA", name: "Gold-Rimmed Fine China Dinner Plate", totalQuantity: 600, price: 150 }, // $1.50
      { sku: "GLASS-WINE", name: "Elegant Crystal Wine Glass", totalQuantity: 800, price: 120 } // $1.20
    ];
    const insertedParty = await db.insert(partyProducts).values(mockParty).returning();
    console.log("[Seeder] Party Products seeded.");

    // 4. Seed Event Products (Tents of various sizes and styles)
    const mockEvents = [
      { sku: "TENT-20X20-FRAME", name: "20x20 High Peak Frame Tent", size: "20x20", style: "Frame Tent", totalQuantity: 10 },
      { sku: "TENT-30X45-FRAME", name: "30x45 Hexagonal Frame Tent", size: "30x45", style: "Frame Tent", totalQuantity: 8 },
      { sku: "TENT-40X60-POLE", name: "40x60 Tension Pole Tent", size: "40x60", style: "Tension Pole", totalQuantity: 5 },
      { sku: "TENT-STRUCT-50X100", name: "50x100 Heavy Duty Clearspan Structure", size: "50x100", style: "Clearspan", totalQuantity: 2 }
    ];
    const insertedEvents = await db.insert(eventProducts).values(mockEvents).returning();
    console.log("[Seeder] Event Products (Tents) seeded.");

    // Helper maps to get inserted IDs
    const partyMap = new Map(insertedParty.map(item => [item.sku, item.id]));
    const eventMap = new Map(insertedEvents.map(item => [item.sku, item.id]));

    // 5. Seed oncoming pending orders (waiting for assignment in the office)
    // Order 1: Heavy Event Tent Setup for Marriott Center
    const [order1] = await db.insert(orders).values({
      clientId: insertedClients[0].id, // Salt Lake Marriott
      division: "EVENTS",
      status: "PENDING"
    }).returning();

    await db.insert(orderItems).values([
      { orderId: order1.id, productId: eventMap.get("TENT-STRUCT-50X100")!, productType: "EVENTS", quantity: 1 },
      { orderId: order1.id, productId: partyMap.get("CHAIR-WHITE-FOLD")!, productType: "PARTY", quantity: 150 },
      { orderId: order1.id, productId: partyMap.get("TABLE-BANQUET-8")!, productType: "PARTY", quantity: 20 }
    ]);

    // Order 2: Fine Party Logistics for Park City Lodge (No tents, pure party decor)
    const [order2] = await db.insert(orders).values({
      clientId: insertedClients[1].id, // Park City Lodge
      division: "PARTY",
      status: "PENDING"
    }).returning();

    await db.insert(orderItems).values([
      { orderId: order2.id, productId: partyMap.get("CHAIR-CHIAVARI-GOLD")!, productType: "PARTY", quantity: 80 },
      { orderId: order2.id, productId: partyMap.get("TABLE-ROUND-60")!, productType: "PARTY", quantity: 10 },
      { orderId: order2.id, productId: partyMap.get("LINEN-WHITE-ROUND")!, productType: "PARTY", quantity: 10 },
      { orderId: order2.id, productId: partyMap.get("PLATE-CHINA")!, productType: "PARTY", quantity: 80 },
      { orderId: order2.id, productId: partyMap.get("GLASS-WINE")!, productType: "PARTY", quantity: 80 }
    ]);

    // Order 3: Mid-size event tent for Red Butte Garden
    const [order3] = await db.insert(orders).values({
      clientId: insertedClients[2].id, // Red Butte Garden
      division: "EVENTS",
      status: "PENDING"
    }).returning();

    await db.insert(orderItems).values([
      { orderId: order3.id, productId: eventMap.get("TENT-20X20-FRAME")!, productType: "EVENTS", quantity: 1 },
      { orderId: order3.id, productId: partyMap.get("CHAIR-WHITE-FOLD")!, productType: "PARTY", quantity: 30 },
      { orderId: order3.id, productId: partyMap.get("TABLE-ROUND-60")!, productType: "PARTY", quantity: 4 }
    ]);

    console.log("[Seeder] Oncoming Pending Orders seeded.");

    return NextResponse.json({
      success: true,
      message: "Diamond database seeded successfully!",
      stats: {
        users: mockUsers.length,
        clients: insertedClients.length,
        partyProducts: insertedParty.length,
        eventProducts: insertedEvents.length,
        pendingOrders: 3
      }
    });

  } catch (error: any) {
    console.error("[Seeder Error] Failed to populate database:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
