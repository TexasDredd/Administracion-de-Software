import { EventEmitter } from "events";

declare global {
  var _serverEvents: EventEmitter | undefined;
}

// Ensure the event emitter is a singleton across hot-reloads in Next.js
export const serverEvents = global._serverEvents || new EventEmitter();

if (process.env.NODE_ENV !== "production") {
  global._serverEvents = serverEvents;
}
