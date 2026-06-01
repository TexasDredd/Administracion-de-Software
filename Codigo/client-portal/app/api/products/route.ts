import { NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { partyProducts, eventProducts } from "@/src/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("[Client API] Fetching full product catalogs...");

    // Fetch Party products
    const partyItems = await db
      .select({
        id: partyProducts.id,
        sku: partyProducts.sku,
        name: partyProducts.name,
        price: partyProducts.price,
        totalQuantity: partyProducts.totalQuantity
      })
      .from(partyProducts);

    // Fetch Event products (Tents)
    const eventItems = await db
      .select({
        id: eventProducts.id,
        sku: eventProducts.sku,
        name: eventProducts.name,
        size: eventProducts.size,
        style: eventProducts.style,
        totalQuantity: eventProducts.totalQuantity
      })
      .from(eventProducts);

    return NextResponse.json({
      success: true,
      partyProducts: partyItems,
      eventProducts: eventItems
    });

  } catch (error: any) {
    console.error("[Client API Error] Failed to fetch product catalog:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
