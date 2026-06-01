import { pgTable, serial, text, integer, timestamp, varchar, uuid } from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';

// --- SYSTEM USERS (EMPLOYEES & OFFICE MEMBERS) ---
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // Clerk User ID (e.g. user_...) or temporary ID
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 50 }).notNull().default('DRIVER'), // 'OFFICE' | 'DRIVER'
  createdAt: timestamp('created_at').defaultNow(),
});

// --- CORE CLIENTS TABLE (EVENT HOSTS / VENUES) ---
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address').notNull(), // Delivery / recovery physical address
  createdAt: timestamp('created_at').defaultNow(),
});

// --- PARTY PRODUCTS (Chairs, Tables, Linens, China, Tableware) ---
export const partyProducts = pgTable('party_products', {
  id: serial('id').primaryKey(),
  sku: varchar('sku', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  totalQuantity: integer('total_quantity').notNull().default(0),
  price: integer('price').notNull().default(0), // Price in cents
  createdAt: timestamp('created_at').defaultNow(),
});

// --- EVENT PRODUCTS (Tents in different sizes, shapes, structures) ---
export const eventProducts = pgTable('event_products', {
  id: serial('id').primaryKey(),
  sku: varchar('sku', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  size: varchar('size', { length: 50 }),  // e.g. "20x20", "40x60"
  style: varchar('style', { length: 50 }), // e.g. "Frame Tent", "Tension Pole Tent", "Clearspan"
  totalQuantity: integer('total_quantity').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- OPERATIONAL LOGISTICAL ORDERS (TASKS) ---
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  division: varchar('division', { length: 50 }).notNull(), // 'PARTY' | 'EVENTS'
  status: varchar('status', { length: 50 }).notNull().default('PENDING'), 
  // 'PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY' (On the way), 'DELIVERED' (Delivering), 'STANDBY' (On stand-by), 'OUT_FOR_PICKUP', 'PICKED_UP', 'COMPLETED' (Finished)
  pickupDate: varchar('pickup_date', { length: 100 }), // Client-requested recovery date
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --- MANIFEST ORDER ITEMS (Unified association for Event and Party items) ---
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  productId: integer('product_id').notNull(),
  productType: varchar('product_type', { length: 50 }).notNull(), // 'PARTY' | 'EVENTS'
  quantity: integer('quantity').notNull().default(1),
});

// --- ORDER DRIVER ASSIGNMENTS ---
export const orderAssignments = pgTable('order_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  driverId: varchar('driver_id', { length: 255 }).references(() => users.id).notNull(),
  assignedAt: timestamp('assigned_at').defaultNow(),
});

// --- KAFKA EVENT AUDIT LOGS ---
export const eventLogs = pgTable('event_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id),
  eventType: varchar('event_type', { length: 100 }).notNull(), // e.g., 'office.order.assigned', 'driver.order.status_updated'
  payload: text('payload').notNull(), // JSON payload string
  timestamp: timestamp('timestamp').defaultNow(),
});

// --- Drizzle Schema Relations ---
export const usersRelations = relations(users, ({ many }) => ({
  assignments: many(orderAssignments),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  client: one(clients, {
    fields: [orders.clientId],
    references: [clients.id],
  }),
  assignments: many(orderAssignments),
  items: many(orderItems),
  eventLogs: many(eventLogs),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));

export const orderAssignmentsRelations = relations(orderAssignments, ({ one }) => ({
  order: one(orders, {
    fields: [orderAssignments.orderId],
    references: [orders.id],
  }),
  driver: one(users, {
    fields: [orderAssignments.driverId],
    references: [users.id],
  }),
}));
