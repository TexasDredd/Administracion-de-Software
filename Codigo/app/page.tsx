import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/src/lib/db/db";
import { users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RootGatewayPage() {
  // 1. Get authenticated Clerk user
  const clerkUser = await currentUser();

  if (!clerkUser) {
    // Not authenticated, redirect to sign-in page
    redirect("/sign-in");
  }

  const clerkId = clerkUser.id;
  const emailAddress = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
  const displayName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "New Employee";

  if (!emailAddress) {
    // If no email is provided (very rare), default redirect to sign-in
    redirect("/sign-in");
  }

  console.log(`[Gateway Routing] User logged in. clerkId=${clerkId}, email=${emailAddress}`);

  try {
    // 2. Query DB by Clerk ID
    const dbUserById = await db
      .select()
      .from(users)
      .where(eq(users.id, clerkId))
      .limit(1);

    if (dbUserById.length > 0) {
      const user = dbUserById[0];
      console.log(`[Gateway Routing] Found user by ID. Role: ${user.role}. Routing...`);
      if (user.role === "OFFICE") {
        redirect("/office");
      } else {
        redirect("/driver");
      }
    }

    // 3. Query DB by Email (Check if admin provisioned the account beforehand)
    const dbUserByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, emailAddress))
      .limit(1);

    if (dbUserByEmail.length > 0) {
      const user = dbUserByEmail[0];
      console.log(`[Gateway Routing] Found provisioned user by email. Linking Clerk ID...`);
      
      // Update record with Clerk User ID to link permanently
      await db
        .update(users)
        .set({ id: clerkId, name: displayName })
        .where(eq(users.email, emailAddress));

      console.log(`[Gateway Routing] Account linked successfully! Role: ${user.role}. Routing...`);
      
      if (user.role === "OFFICE") {
        redirect("/office");
      } else {
        redirect("/driver");
      }
    }

    // 4. Access Denied: User email is not registered/provisioned in the DB
    console.log(`[Gateway Routing] User email ${emailAddress} is not registered or provisioned in DB. Access denied.`);
    return (
      <div className="min-h-screen bg-[#0B2545] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 bg-amber-500 rounded-2xl flex items-center justify-center font-bold text-white shadow-xl mx-auto transform rotate-45">
            <svg className="transform -rotate-45 h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight mt-4 text-amber-400">Access Registration Required</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Your authenticated email address <span className="font-bold text-white font-mono bg-blue-950/40 px-2 py-1 rounded">{emailAddress}</span> is not registered in the Diamond Event logistical network.
          </p>
          <p className="text-slate-400 text-xs leading-relaxed">
            Please contact your logistics manager or office administrator to provision your email address with the correct role (<strong>Driver</strong> or <strong>Office Member</strong>) before signing in.
          </p>
          <div className="pt-4 flex flex-col gap-2">
            <a
              href="/"
              className="inline-block px-6 py-3 bg-[#1e3d6b] hover:bg-[#2c538a] text-white font-semibold rounded-xl text-xs transition-all active:scale-95 shadow-md"
            >
              Check Registration Status
            </a>
            <div className="text-[10px] text-slate-500">
              Diamond Event & Tent Logistics Portal
            </div>
          </div>
        </div>
      </div>
    );

  } catch (err) {
    // Next.js redirect() throws a special error to trigger the redirect. 
    // We must re-throw it so that Next.js handles it properly, rather than catching it.
    if (err instanceof Error && (err.message === "NEXT_REDIRECT" || (err as any).digest?.startsWith("NEXT_REDIRECT"))) {
      throw err;
    }

    console.error("[Gateway Routing Error] Failed to route user:", err);
    
    // In case of a database connectivity issue during initial seed/auth, 
    // display a beautiful fallback message
    return (
      <div className="min-h-screen bg-[#0B2545] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-white shadow-xl mx-auto transform rotate-45">
            <span className="transform -rotate-45 text-xl">D</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight mt-4">System Routing Check</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            There was a delay connecting to the database server. Please ensure that the local database and Kafka Docker containers are actively running.
          </p>
          <div className="bg-[#112d4e] border border-blue-900 rounded-xl p-4 text-xs font-mono text-blue-300 text-left">
            Error: Database query connection failure
          </div>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-blue-950/20"
          >
            Retry Connection Gateway
          </a>
        </div>
      </div>
    );
  }
}
