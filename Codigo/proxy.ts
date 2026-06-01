import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define which routes are public (exempt from auth checks)
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/admin(.*)",
  "/api/seed(.*)",
  "/api/events(.*)",       // Allow persistent SSE stream connections without CORS/Auth handshake locks
  "/api/kafka/produce(.*)", // Manual kafka producer test ping
  "/api/users(.*)"         // Allow public administration of users without being logged in first
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.[^?]*$).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
