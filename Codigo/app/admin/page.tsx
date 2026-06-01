"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DriverUser {
  id: string;
  name: string;
  email: string;
  role: string;
  activeTasksCount: number;
}

export default function UnauthenticatedAdminPortal() {
  const [allUsersList, setAllUsersList] = useState<DriverUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "alert"
  });

  const triggerAlert = (title: string, message: string) => {
    setModal({
      isOpen: true,
      title,
      message,
      type: "alert"
    });
  };

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModal({
      isOpen: true,
      title,
      message,
      type: "confirm",
      onConfirm
    });
  };

  // Form states
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpRole, setNewEmpRole] = useState<"OFFICE" | "DRIVER">("DRIVER");
  const [provisioningStatus, setProvisioningStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [provisioningLoading, setProvisioningLoading] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  // Fetch all registered users
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) {
        setAllUsersList(data.users || []);
      }
    } catch (err) {
      console.error("Failed to fetch admin users directory:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Handle account provisioning
  const handleProvisionEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName || !newEmpEmail) {
      triggerAlert("Information Required", "Please enter the name and email to provision.");
      return;
    }

    try {
      setProvisioningLoading(true);
      setProvisioningStatus(null);

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEmpName,
          email: newEmpEmail,
          role: newEmpRole
        })
      });

      const data = await res.json();
      if (data.success) {
        setProvisioningStatus({
          success: true,
          message: data.message
        });
        setNewEmpName("");
        setNewEmpEmail("");
        fetchUsers();
      } else {
        setProvisioningStatus({
          success: false,
          message: data.error || "Failed to provision employee."
        });
      }
    } catch (err: any) {
      setProvisioningStatus({
        success: false,
        message: err.message || String(err)
      });
    } finally {
      setProvisioningLoading(false);
    }
  };

  // Handle role modification PUT
  const handleUpdateUserRole = async (userId: string, newRole: "OFFICE" | "DRIVER") => {
    try {
      setUpdatingRoleUserId(userId);
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        triggerAlert("Update Failure", data.error || "Failed to update role.");
      }
    } catch (err) {
      console.error("Update role error:", err);
      triggerAlert("Connection Error", "Error connecting to server.");
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  // Handle user deletion DELETE
  const handleDeleteUser = async (userId: string) => {
    triggerConfirm(
      "Delete Employee Account",
      "Are you sure you want to delete this account? Any active assignments will be cleared.",
      async () => {
        try {
          const res = await fetch(`/api/users?userId=${userId}`, {
            method: "DELETE"
          });
          const data = await res.json();
          if (data.success) {
            fetchUsers();
          } else {
            triggerAlert("Database Warning", data.error || "Failed to delete user account.");
          }
        } catch (err) {
          console.error("Delete user error:", err);
          triggerAlert("Connection Error", "Error connecting to server.");
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#0B2545] text-white font-sans flex flex-col relative overflow-hidden">
      
      {/* Visual Background Accents */}
      <div className="absolute top-[-10%] right-[-10%] h-[500px] w-[500px] bg-blue-650/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] h-[500px] w-[500px] bg-blue-900/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Top Header */}
      <header className="bg-[#0b2545]/80 border-b border-blue-950/60 shadow-lg sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-xl transform rotate-45 border border-blue-500">
              <span className="transform -rotate-45 text-lg">D</span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white">DIAMOND LOGISTICS SETUP</h1>
              <p className="text-[9px] text-blue-400 tracking-widest font-extrabold uppercase mt-[-1px]">
                Administrative Bootstrap Portal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 border border-blue-900 hover:bg-blue-950/40 text-blue-400 font-bold rounded-xl text-3xs transition-all uppercase tracking-wider"
            >
              ← Back to login
            </Link>
          </div>
        </div>
      </header>

      {/* Admin Content Panel Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col justify-center mt-2 z-10">
        
        <div className="bg-[#112D4E]/40 border border-blue-950/60 rounded-3xl p-6 md:p-8 backdrop-blur-md shadow-2xl space-y-8">
          
          <div className="border-b border-blue-950/60 pb-5">
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <span className="h-2.5 w-2.5 bg-blue-550 rounded-full animate-pulse" />
              Master System Accounts Directory
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              This unauthenticated bootstrap page allows you to register and change roles (Driver or Office) for any user in the database. Use this to provision your personal Clerk email as an <strong>Office Admin</strong> before logging in to the system.
            </p>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-start">
            
            {/* Left side: Add New Team Member Form (5 Columns) */}
            <div className="lg:col-span-5 bg-[#0e2744]/75 border border-blue-950/80 rounded-2xl p-6 flex flex-col gap-6 shadow-md">
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-extrabold text-blue-200">Provision New Employee Profile</h4>
                <p className="text-[10px] text-slate-455 leading-relaxed">
                  Enter details to register them in Postgres. Role modifications are linked dynamically to Clerk logins.
                </p>
              </div>

              <form onSubmit={handleProvisionEmployee} className="space-y-4">
                <div>
                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#0a1e35] border border-blue-950 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-medium text-white placeholder-slate-650"
                    required
                  />
                </div>
                <div>
                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    placeholder="e.g. john@diamondevent.com"
                    className="w-full bg-[#0a1e35] border border-blue-950 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-medium text-white placeholder-slate-650"
                    required
                  />
                </div>
                <div>
                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Logistics Role</label>
                  <select
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value as "OFFICE" | "DRIVER")}
                    className="w-full bg-[#0a1e35] border border-blue-950 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-bold text-blue-300 cursor-pointer"
                  >
                    <option value="DRIVER">Field Driver (Repartidor)</option>
                    <option value="OFFICE">Office Member (Administrador)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={provisioningLoading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-950 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 border border-blue-500 hover:border-blue-400 cursor-pointer"
                >
                  {provisioningLoading ? "Creating..." : "Provision Employee Account 🔐"}
                </button>
              </form>

              {/* Status Toast */}
              {provisioningStatus && (
                <div className={`p-4 rounded-xl border text-3xs font-semibold flex flex-col gap-1 ${
                  provisioningStatus.success
                    ? "bg-emerald-950/40 border-emerald-900 text-emerald-400"
                    : "bg-rose-950/40 border-rose-900 text-rose-400"
                }`}>
                  <span className="font-bold">{provisioningStatus.success ? "Profile Created" : "Provisioning Failed"}</span>
                  <span>{provisioningStatus.message}</span>
                </div>
              )}
            </div>

            {/* Right side: Accounts Directory (7 Columns) */}
            <div className="lg:col-span-7 bg-[#0b1c31]/60 border border-blue-950/80 rounded-2xl p-6 flex flex-col gap-4 shadow-md">
              <div className="flex justify-between items-center pb-2 border-b border-blue-950/40">
                <div>
                  <h4 className="text-sm font-extrabold text-blue-200">Registered Accounts Directory</h4>
                  <p className="text-[10px] text-slate-455 leading-relaxed">Manage roles or remove profiles directly</p>
                </div>
                <span className="bg-blue-950 text-blue-400 border border-blue-900 text-3xs font-bold px-2.5 py-1 rounded-full uppercase">
                  {allUsersList.length} Profiles
                </span>
              </div>

              {/* Scrollable list container */}
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {loading ? (
                  <div className="text-center py-20 text-xs text-slate-400 flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Querying accounts directory...
                  </div>
                ) : allUsersList.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-blue-950 rounded-xl text-xs text-slate-500">
                    No registered employee accounts found in Postgres.
                  </div>
                ) : (
                  allUsersList.map((usr) => (
                    <div key={usr.id} className="p-4 bg-[#0a1e35]/50 border border-blue-950/70 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-blue-900/60 transition-all">
                      {/* User Info Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-white truncate">{usr.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                            usr.role === "OFFICE" 
                              ? "bg-purple-950/40 text-purple-400 border border-purple-900/80" 
                              : "bg-teal-950/40 text-teal-400 border border-teal-900/80"
                          }`}>
                            {usr.role}
                          </span>
                        </div>
                        <div className="text-3xs text-slate-400 mt-1.5 font-mono truncate">{usr.email}</div>
                        {usr.id.startsWith("temp_") ? (
                          <span className="text-[9px] text-amber-500 font-bold bg-amber-50/30 border border-amber-900/40 px-1.5 py-0.5 rounded mt-1.5 inline-block">
                            ⏳ Awaiting Clerk Sign-up Linking
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-450 font-bold bg-emerald-950/30 border border-emerald-900/40 px-1.5 py-0.5 rounded mt-1.5 inline-block">
                            ✅ Clerk ID Linked
                          </span>
                        )}
                      </div>

                      {/* Management Controls */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Selector dropdown */}
                        <select
                          value={usr.role}
                          onChange={(e) => handleUpdateUserRole(usr.id, e.target.value as "OFFICE" | "DRIVER")}
                          disabled={updatingRoleUserId === usr.id}
                          className="bg-[#0a1a2e] border border-blue-950 rounded-xl px-2 py-1.5 text-3xs font-bold text-blue-300 cursor-pointer focus:outline-none focus:border-blue-500"
                        >
                          <option value="DRIVER">Field Driver</option>
                          <option value="OFFICE">Office Admin</option>
                        </select>

                        {/* Trash delete */}
                        <button
                          onClick={() => handleDeleteUser(usr.id)}
                          title="Remove user profile"
                          className="p-2 bg-[#0d1629] hover:bg-rose-950/40 border border-blue-950 hover:border-rose-900 text-slate-400 hover:text-rose-500 rounded-xl transition-all active:scale-95 cursor-pointer"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

      </main>

      {/* Custom Royal Blue Brand Modal Popup Dialog (Replaces native alerts/confirms) */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B2545]/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E2E8F0] rounded-3xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200 flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <span className={`h-8 w-8 rounded-full flex items-center justify-center text-sm ${
                modal.type === "confirm" ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-red-50 text-red-600 border border-red-100"
              }`}>
                {modal.type === "confirm" ? "❓" : "⚠️"}
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm">{modal.title}</h3>
            </div>
            
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              {modal.message}
            </p>

            <div className="flex gap-2.5 mt-2.5 justify-end">
              {modal.type === "confirm" && (
                <button
                  onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-650 text-3xs font-extrabold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  setModal(prev => ({ ...prev, isOpen: false }));
                  if (modal.onConfirm) modal.onConfirm();
                }}
                className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-3xs font-extrabold uppercase tracking-wider transition-all active:scale-95 shadow cursor-pointer flex items-center justify-center"
              >
                {modal.type === "confirm" ? "Confirm" : "Understood"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
