import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left Column: Brand Hero (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0B2545] relative overflow-hidden flex-col justify-between p-16 text-white">
        {/* Subtle geometric grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute top-[-20%] right-[-20%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center gap-3 z-10">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg border border-blue-500/20 transform rotate-45">
            <span className="transform -rotate-45">D</span>
          </div>
          <div>
            <span className="font-extrabold tracking-wider text-lg block">DIAMOND</span>
            <span className="text-3xs text-blue-400 font-bold uppercase tracking-widest block mt-[-4px]">Event & Tent</span>
          </div>
        </div>

        {/* Middle Value Pitch */}
        <div className="z-10 max-w-md my-auto space-y-6">
          <h2 className="text-4xl font-extrabold leading-tight text-white tracking-tight">
            Logistics & Operations Digital Portal
          </h2>
          <p className="text-slate-300 text-base leading-relaxed">
            Eliminating 100% of physical paper orders. Real-time dispatches, double-stage routing tracking, and live telemetry integrations.
          </p>
          <div className="space-y-4 pt-4 text-sm text-slate-300 font-medium">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Real-Time SSE Event Pipelines</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Events & Party Segmented Inventory</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Integrated Field Communications</span>
            </div>
          </div>
        </div>

        {/* Bottom footer */}
        <div className="z-10 text-xs text-slate-400">
          © {new Date().getFullYear()} Diamond Event & Tent Inc. All rights reserved.
        </div>
      </div>

      {/* Right Column: Sign In Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md flex flex-col items-center">
          {/* Logo for mobile view */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg transform rotate-45">
              <span className="transform -rotate-45">D</span>
            </div>
            <span className="font-extrabold tracking-wider text-lg text-slate-900">DIAMOND</span>
          </div>

          <SignIn 
            appearance={{
              variables: {
                primaryColor: "#2563eb",
              },
              elements: {
                card: "shadow-xl border border-slate-100 rounded-2xl bg-white",
                headerTitle: "text-slate-900 font-extrabold",
                headerSubtitle: "text-slate-500 font-medium",
                socialButtonsBlockButton: "border border-slate-200 text-slate-600 hover:bg-slate-50",
                formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm",
                footerActionLink: "text-blue-600 hover:text-blue-700",
              }
            }}
            signUpUrl="/sign-up"
          />
        </div>
      </div>
    </div>
  );
}
