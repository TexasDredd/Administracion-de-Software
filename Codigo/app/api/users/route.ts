import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db/db";
import { users, orderAssignments, orders } from "@/src/lib/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// 1. GET: Fetch all drivers along with their active task counts (workload)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const roleFilter = searchParams.get("role"); // e.g. 'DRIVER'

    if (userId && !roleFilter) {
      // Fetch specific user profile (e.g. for dynamic role checking in client side)
      const userRecord = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return NextResponse.json({
        success: true,
        user: userRecord[0] || null
      });
    }

    let query = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        // SQL count of active, incomplete tasks currently assigned
        activeTasksCount: sql<number>`COALESCE(count(CASE WHEN ${orders.status} != 'COMPLETED' THEN 1 END), 0)::integer`
      })
      .from(users)
      .leftJoin(orderAssignments, eq(users.id, orderAssignments.driverId))
      .leftJoin(orders, eq(orderAssignments.orderId, orders.id))
      .groupBy(users.id);

    // Apply role filter if specified
    if (roleFilter) {
      // Drizzle where
      // @ts-ignore
      query = query.where(eq(users.role, roleFilter));
    }

    const results = await query;

    return NextResponse.json({
      success: true,
      users: results
    });

  } catch (error: any) {
    console.error("GET users error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

// 2. POST: Admin provisions a new employee profile in PostgreSQL
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, role } = body;

    // Validate request parameters
    if (!name || !email || !role) {
      return NextResponse.json({ error: "Missing name, email, or role" }, { status: 400 });
    }

    const allowedRoles = ["OFFICE", "DRIVER"];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role. Must be 'OFFICE' or 'DRIVER'" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // A. Check if the user email already exists in DB
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser.length > 0) {
      // Email already exists, let's update their role to the new requested role!
      const [updatedUser] = await db
        .update(users)
        .set({ role: role })
        .where(eq(users.email, normalizedEmail))
        .returning();

      console.log(`[Provisioning] Existing employee '${name}' upgraded/changed to role '${role}'. email=${normalizedEmail}`);

      return NextResponse.json({
        success: true,
        message: `Successfully updated existing account for ${name} to role ${role}!`,
        user: updatedUser
      });
    }

    // B. Insert user record with temporary ID
    // When the user logs in via Clerk for the first time, our gateway 
    // will link their real Clerk User ID automatically.
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const [newUser] = await db
      .insert(users)
      .values({
        id: tempId,
        name: name.trim(),
        email: normalizedEmail,
        role: role,
        createdAt: new Date()
      })
      .returning();

    console.log(`[Provisioning] Employee '${name}' (${role}) provisioned in DB. email=${normalizedEmail}`);

    return NextResponse.json({
      success: true,
      message: `Successfully provisioned account for ${name}! They can now log in via Clerk.`,
      user: newUser
    });

  } catch (error: any) {
    console.error("POST users error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

// 3. PUT: Update an employee's data (role, name, email)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, role, name, email } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const updateFields: any = {};
    if (role) {
      const allowedRoles = ["OFFICE", "DRIVER"];
      if (!allowedRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role. Must be 'OFFICE' or 'DRIVER'" }, { status: 400 });
      }
      updateFields.role = role;
    }
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      updateFields.name = name.trim();
    }
    if (email !== undefined) {
      if (!email.trim() || !email.includes("@")) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      updateFields.email = email.trim().toLowerCase();
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Update role/name/email in Postgres
    const [updatedUser] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`[Admin] Updated user ${userId} fields:`, updateFields);

    return NextResponse.json({
      success: true,
      message: `Successfully updated user parameters`,
      user: updatedUser
    });

  } catch (error: any) {
    console.error("PUT users error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

// 4. DELETE: Remove an employee profile from Postgres
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // A. Delete order assignments for this driver first to prevent foreign key errors
    await db.delete(orderAssignments).where(eq(orderAssignments.driverId, userId));

    // B. Delete the user
    const [deletedUser] = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning();

    if (!deletedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`[Admin] Deleted user account ${userId}`);

    return NextResponse.json({
      success: true,
      message: `Successfully removed user account for ${deletedUser.name}`
    });

  } catch (error: any) {
    console.error("DELETE users error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
