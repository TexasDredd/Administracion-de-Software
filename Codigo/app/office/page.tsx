"use client";

import { useEffect, useState, useRef } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";

interface InventoryItem {
  id: number;
  quantity: number;
  sku: string;
  name: string;
  category: string;
  detail?: string;
}

interface Order {
  id: string;
  division: "EVENTS" | "PARTY";
  status: string;
  createdAt: string;
  updatedAt: string;
  driverId: string | null;
  driverName: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  items: InventoryItem[];
}

interface DriverUser {
  id: string;
  name: string;
  email: string;
  role: string;
  activeTasksCount: number;
}

interface KafkaLog {
  timestamp: string;
  topic: string;
  eventType: string;
  payload: any;
}

export default function OfficeDashboard() {
  const { user: clerkUser } = useUser();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Navigation state: 'tracking' | 'assignor' | 'drivers' | 'accounts' | 'completed'
  const [activeTab, setActiveTab] = useState<
    "tracking" | "assignor" | "drivers" | "accounts" | "completed"
  >("tracking");

  // Operational lists
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [oncomingOrders, setOncomingOrders] = useState<Order[]>([]);
  const [driversList, setDriversList] = useState<DriverUser[]>([]);
  const [allUsersList, setAllUsersList] = useState<DriverUser[]>([]);
  const [kafkaLogs, setKafkaLogs] = useState<KafkaLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpRole, setNewEmpRole] = useState<"OFFICE" | "DRIVER">("DRIVER");
  const [provisioningStatus, setProvisioningStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [provisioningLoading, setProvisioningLoading] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(
    null,
  );

  // Filters
  const [divisionFilter, setDivisionFilter] = useState<
    "ALL" | "EVENTS" | "PARTY"
  >("ALL");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedDriversMap, setSelectedDriversMap] = useState<{
    [orderId: string]: string;
  }>({});
  const [reassignmentMap, setReassignmentMap] = useState<{
    [orderId: string]: string;
  }>({});

  const [logsExpanded, setLogsExpanded] = useState(false);

  const [editingUser, setEditingUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: "OFFICE" | "DRIVER";
  } | null>(null);
  const [updatingEmployeeLoading, setUpdatingEmployeeLoading] = useState(false);

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

  // Fetch all operational telemetry from API endpoints
  const fetchTelemetry = async () => {
    if (!clerkUser) return;
    try {
      // 1. Fetch Orders (GET /api/orders)
      const ordersRes = await fetch(
        `/api/orders?userId=${clerkUser.id}&role=OFFICE`,
      );
      const ordersData = await ordersRes.json();
      if (ordersData.success) {
        setActiveOrders(ordersData.activeOrders || []);
        setOncomingOrders(ordersData.unassignedContracts || []); // incoming PENDING orders
      }

      // 2. Fetch Drivers (GET /api/users?role=DRIVER)
      const driversRes = await fetch("/api/users?role=DRIVER");
      const driversData = await driversRes.json();
      if (driversData.success) {
        setDriversList(driversData.users || []);
      }

      // 3. Fetch All Users for Administration (GET /api/users)
      const allUsersRes = await fetch("/api/users");
      const allUsersData = await allUsersRes.json();
      if (allUsersData.success) {
        setAllUsersList(allUsersData.users || []);
      }
    } catch (err) {
      console.error("Telemetry fetch failure:", err);
    } finally {
      setLoading(false);
    }
  };

  // Perform dynamic authorization checks
  useEffect(() => {
    if (!clerkUser) return;
    const userId = clerkUser.id;

    async function checkAuthorization() {
      try {
        const res = await fetch(`/api/users?userId=${userId}`);
        const data = await res.json();
        if (data.success && data.user && data.user.role === "OFFICE") {
          setAuthorized(true);
        } else {
          setAuthorized(false);
          window.location.href = "/";
        }
      } catch (err) {
        console.error("Authorization check failed:", err);
        setAuthorized(false);
        window.location.href = "/";
      }
    }
    checkAuthorization();
  }, [clerkUser]);

  // Set up SSE stream once authorized and clerkUser loaded
  useEffect(() => {
    if (authorized !== true || !clerkUser) return;

    fetchTelemetry();

    // Establish persistent Server-Sent Events gateway connection
    console.log(
      `[SSE] Establishing stream to gateway for office ${clerkUser.id}...`,
    );
    const eventSource = new EventSource(
      `/api/events?userId=${clerkUser.id}&role=OFFICE`,
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connection") return;

        console.log("[SSE] Operational event consumed:", data);

        // Add raw event log to terminal
        const newLog: KafkaLog = {
          timestamp: new Date().toLocaleTimeString(),
          topic: data.topic,
          eventType: data.event.eventType,
          payload: data.event.payload,
        };
        setKafkaLogs((prev) => [newLog, ...prev].slice(0, 50)); // Cap logs

        // Refresh database state to capture Postgres writes
        fetchTelemetry();
      } catch (err) {
        console.error("[SSE Error] Parsing stream update failed:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[SSE Error] Connection interrupted. Reconnecting...");
    };

    return () => {
      console.log("[SSE] Closing stream...");
      eventSource.close();
    };
  }, [authorized, clerkUser]);

  // Dispatch Assignment POST
  const handleDispatchOrder = async (orderId: string) => {
    const driverId = selectedDriversMap[orderId];
    if (!driverId) {
      triggerAlert("Selection Required", "Please select a driver from the dropdown first.");
      return;
    }

    try {
      setAssigningId(orderId);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, driverId }),
      });
      const data = await res.json();

      if (data.success) {
        fetchTelemetry();
      } else {
        triggerAlert("Dispatch Failure", data.error || "Failed to dispatch order.");
      }
    } catch (err) {
      console.error("Order dispatch error:", err);
      triggerAlert("Connection Error", "Error connecting to logistics server.");
    } finally {
      setAssigningId(null);
    }
  };

  // Provisioning Employee POST
  const handleProvisionEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName || !newEmpEmail) {
      triggerAlert("Information Required", "Please fill in the employee's name and email.");
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
          role: newEmpRole,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProvisioningStatus({
          success: true,
          message: data.message,
        });
        setNewEmpName("");
        setNewEmpEmail("");
        // Re-fetch users list
        fetchTelemetry();
      } else {
        setProvisioningStatus({
          success: false,
          message: data.error || "Failed to provision employee.",
        });
      }
    } catch (err: any) {
      setProvisioningStatus({
        success: false,
        message: err.message || String(err),
      });
    } finally {
      setProvisioningLoading(false);
    }
  };

  // Admin User Role Update PUT
  const handleUpdateUserRole = async (
    userId: string,
    newRole: "OFFICE" | "DRIVER",
  ) => {
    try {
      setUpdatingRoleUserId(userId);
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        fetchTelemetry();
        // If the admin changes their own role, alert them
        if (clerkUser && clerkUser.id === userId) {
          setModal({
            isOpen: true,
            title: "Safety System Warning",
            message: "You changed your own role. You will be logged out or redirected shortly.",
            type: "alert",
            onConfirm: () => {
              window.location.href = "/";
            }
          });
        }
      } else {
        triggerAlert("Role Update Failure", data.error || "Failed to update employee role.");
      }
    } catch (err) {
      console.error("Failed to update user role:", err);
      triggerAlert("Connection Error", "Error connecting to logistics server.");
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  // Modify Employee Details PUT
  const handleEditEmployeeDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingUser.name || !editingUser.email) {
      triggerAlert("Information Required", "Please provide a valid name and email.");
      return;
    }

    try {
      setUpdatingEmployeeLoading(true);
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingUser.id,
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchTelemetry();
        setEditingUser(null);
        triggerAlert("Success", "Employee details successfully updated in PostgreSQL database.");
      } else {
        triggerAlert("Update Failure", data.error || "Failed to update employee details.");
      }
    } catch (err) {
      console.error("Edit user error:", err);
      triggerAlert("Connection Error", "Error connecting to logistics server.");
    } finally {
      setUpdatingEmployeeLoading(false);
    }
  };

  // Admin User Delete DELETE
  const handleDeleteUser = async (userId: string) => {
    if (clerkUser && clerkUser.id === userId) {
      triggerAlert(
        "Safety Lock",
        "You cannot delete your own active administrator profile."
      );
      return;
    }
    triggerConfirm(
      "Remove Employee Account",
      "Are you sure you want to remove this employee profile from the Diamond Event database? All active assignments for this user will be unassigned.",
      async () => {
        try {
          const res = await fetch(`/api/users?userId=${userId}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (data.success) {
            fetchTelemetry();
          } else {
            triggerAlert("Database Warning", data.error || "Failed to remove employee account.");
          }
        } catch (err) {
          console.error("Failed to delete user:", err);
          triggerAlert("Connection Error", "Error connecting to logistics server.");
        }
      }
    );
  };

  // Order Re-assignment POST
  const handleReassignDriver = async (orderId: string) => {
    const driverId = reassignmentMap[orderId];
    if (!driverId) {
      triggerAlert("Selection Required", "Please select a new driver to re-assign.");
      return;
    }

    try {
      setAssigningId(orderId);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, driverId })
      });
      const data = await res.json();
      if (data.success) {
        fetchTelemetry();
        triggerAlert("Success", "Driver re-assigned successfully! Timelines reset.");
        // Clear reassignment state
        setReassignmentMap(prev => {
          const copy = { ...prev };
          delete copy[orderId];
          return copy;
        });
      } else {
        triggerAlert("Re-assignment Failure", data.error || "Failed to re-assign driver.");
      }
    } catch (err) {
      console.error("Order re-assign error:", err);
      triggerAlert("Connection Error", "Error connecting to logistics server.");
    } finally {
      setAssigningId(null);
    }
  };

  // Order Assignment Cancellation (Reset to Pending) DELETE
  const handleCancelOrderAssignment = async (orderId: string) => {
    triggerConfirm(
      "Cancel Order Assignment",
      "Are you sure you want to cancel the active driver assignment for this order? This will return the order to the unassigned oncoming pool.",
      async () => {
        try {
          setAssigningId(orderId);
          const res = await fetch(`/api/orders?orderId=${orderId}&action=cancel`, {
            method: "DELETE"
          });
          const data = await res.json();
          if (data.success) {
            fetchTelemetry();
            triggerAlert("Success", "Order assignment cancelled. Order returned to oncoming dispatch!");
          } else {
            triggerAlert("Database Warning", data.error || "Failed to cancel order assignment.");
          }
        } catch (err) {
          console.error("Order cancel assignment error:", err);
          triggerAlert("Connection Error", "Error connecting to logistics server.");
        } finally {
          setAssigningId(null);
        }
      }
    );
  };

  // Permanent Order Purge/Delete DELETE
  const handlePurgeOrder = async (orderId: string) => {
    triggerConfirm(
      "🚨 Permanent Order Purge WARNING",
      "Are you sure you want to purge this order from the system permanently? This will delete all item logs, manifests, and assignments for this order, and CANNOT be undone.",
      async () => {
        try {
          setAssigningId(orderId);
          const res = await fetch(`/api/orders?orderId=${orderId}&action=delete`, {
            method: "DELETE"
          });
          const data = await res.json();
          if (data.success) {
            fetchTelemetry();
            triggerAlert("Success", "Order purged permanently from the database.");
          } else {
            triggerAlert("Database Warning", data.error || "Failed to purge order.");
          }
        } catch (err) {
          console.error("Order purge error:", err);
          triggerAlert("Connection Error", "Error connecting to logistics server.");
        } finally {
          setAssigningId(null);
        }
      }
    );
  };

  // Status mappings to corporate terms
  const mapStatus = (status: string) => {
    switch (status) {
      case "ASSIGNED":
        return {
          label: "Dispatched",
          color: "bg-blue-50 text-blue-700 border-blue-100",
          progress: 20,
        };
      case "OUT_FOR_DELIVERY":
        return {
          label: "On the way",
          color: "bg-amber-50 text-amber-700 border-amber-100",
          progress: 50,
        };
      case "DELIVERED":
        return {
          label: "Delivering",
          color: "bg-cyan-50 text-cyan-700 border-cyan-100",
          progress: 75,
        };
      case "COMPLETED":
        return {
          label: "Finished",
          color: "bg-emerald-50 text-emerald-700 border-emerald-100",
          progress: 100,
        };
      default:
        return {
          label: status,
          color: "bg-slate-50 text-slate-600 border-slate-100",
          progress: 10,
        };
    }
  };

  // Filter ongoing orders (exclude finished ones)
  const filteredActiveOrders = activeOrders.filter((order) => {
    if (order.status === "COMPLETED") return false;
    if (divisionFilter === "ALL") return true;
    return order.division === divisionFilter;
  });

  // Filter completed/finished orders
  const completedOrders = activeOrders.filter((order) => {
    if (order.status !== "COMPLETED") return false;
    if (divisionFilter === "ALL") return true;
    return order.division === divisionFilter;
  });

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[#0B2545] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-350 tracking-wider uppercase font-bold">
            Verifying System Access Credentials...
          </p>
        </div>
      </div>
    );
  }

  if (authorized !== true) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans flex flex-col relative overflow-hidden">
      {/* Main Top Header */}
      <header className="bg-white border-b border-[#E2E8F0] shadow-sm sticky top-0 z-40 backdrop-blur-md">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="h-10 w-10 bg-[#0B2545] rounded-xl flex items-center justify-center font-bold text-white shadow-lg transform rotate-45"
            >
              <span className="transform -rotate-45 text-lg">D</span>
            </Link>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#0F172A]">
                DIAMOND EVENT & TENT
              </h1>
              <p className="text-3xs text-[#2563EB] tracking-widest font-extrabold uppercase mt-[-2px]">
                Operations Logistics dispatcher
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-3.5 py-1.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Office Control</span>
            </div>
            <UserButton />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] w-full mx-auto p-4 md:p-6 gap-6 relative">
        {/* Left Side: Navigation Sidebar (4 Columns on MD) */}
        <aside className="w-full md:w-[280px] shrink-0 bg-[#0B2545] border border-blue-950 rounded-3xl p-6 text-white flex flex-col gap-8 shadow-xl">
          <div className="flex flex-col gap-1">
            <span className="text-blue-400 text-3xs font-extrabold uppercase tracking-widest">
              Navigation Menu
            </span>
            <span className="text-sm font-semibold text-slate-300">
              Operations Control
            </span>
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col gap-2.5">
            {/* 1. Ongoing Tracking */}
            <button
              onClick={() => setActiveTab("tracking")}
              className={`w-full px-4 py-3.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between group ${
                activeTab === "tracking"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2"
                  />
                </svg>
                Ongoing Tracking
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "tracking"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-[#2563EB]"
                }`}
              >
                {activeOrders.filter((o) => o.status !== "COMPLETED").length}
              </span>
            </button>

            {/* 2. Oncoming Orders (Assignor) */}
            <button
              onClick={() => setActiveTab("assignor")}
              className={`w-full px-4 py-3.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between group ${
                activeTab === "assignor"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Oncoming Dispatch
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "assignor"
                    ? "bg-white/20 text-white"
                    : "bg-red-500 text-white"
                }`}
              >
                {oncomingOrders.length}
              </span>
            </button>

            {/* 3. Finished Archive */}
            <button
              onClick={() => setActiveTab("completed")}
              className={`w-full px-4 py-3.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between group ${
                activeTab === "completed"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Finished Archive
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "completed"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-slate-400"
                }`}
              >
                {activeOrders.filter((o) => o.status === "COMPLETED").length}
              </span>
            </button>

            {/* 4. Drivers Grid */}
            <button
              onClick={() => setActiveTab("drivers")}
              className={`w-full px-4 py-3.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between group ${
                activeTab === "drivers"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Active Drivers
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "drivers"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-slate-400"
                }`}
              >
                {driversList.length}
              </span>
            </button>

            {/* 5. Accounts Provisioning */}
            <button
              onClick={() => setActiveTab("accounts")}
              className={`w-full px-4 py-3.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between group ${
                activeTab === "accounts"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M18 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Manage Employees
              </span>
            </button>
          </nav>
        </aside>

        {/* Right Side: Tab View Content Panels (Flex-1) */}
        <main className="flex-1 bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm min-h-[600px] flex flex-col justify-between overflow-hidden">
          {/* TAB 1: ONGOING TRACKING PANEL */}
          {activeTab === "tracking" && (
            <div className="flex flex-col flex-1 h-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#F1F5F9] pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    Ongoing Orders Real-Time Tracking
                  </h2>
                  <p className="text-xs text-gray-500">
                    Live logistical stages of Event and Party setups
                  </p>
                </div>

                {/* Division Filter */}
                <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] p-0.5 rounded-xl">
                  <button
                    onClick={() => setDivisionFilter("ALL")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      divisionFilter === "ALL"
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-gray-500 hover:text-slate-900"
                    }`}
                  >
                    All Sections
                  </button>
                  <button
                    onClick={() => setDivisionFilter("EVENTS")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      divisionFilter === "EVENTS"
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-gray-500 hover:text-slate-900"
                    }`}
                  >
                    Event Tents
                  </button>
                  <button
                    onClick={() => setDivisionFilter("PARTY")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      divisionFilter === "PARTY"
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-gray-500 hover:text-slate-900"
                    }`}
                  >
                    Party Logistics
                  </button>
                </div>
              </div>

              {/* Grid content */}
              <div className="flex-1 overflow-y-auto space-y-4 max-h-[750px] pr-1">
                {loading ? (
                  <div className="text-center py-20 text-xs text-gray-400">
                    Querying Postgres orders...
                  </div>
                ) : filteredActiveOrders.length === 0 ? (
                  <div className="text-center py-24 border-2 border-dashed border-[#E2E8F0] rounded-2xl flex flex-col items-center justify-center p-6">
                    <svg
                      className="h-8 w-8 text-gray-450 mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h5 className="text-sm font-bold text-gray-400">
                      No active tracking records
                    </h5>
                    <p className="text-xs text-gray-500 mt-1 max-w-[280px]">
                      Dispatched route orders will appear here showing their
                      step timelines.
                    </p>
                  </div>
                ) : (
                  filteredActiveOrders.map((order) => {
                    const statusInfo = mapStatus(order.status);
                    return (
                      <div
                        key={order.id}
                        className="border border-[#E2E8F0] rounded-2xl p-5 hover:border-blue-200 hover:bg-slate-50/10 transition-all"
                      >
                        {/* Upper card info */}
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-sm">
                              {order.clientName || "Direct Booking"}
                            </h4>
                            <span className="text-[10px] text-gray-400 font-mono font-bold block mt-0.5">
                              ORDER ID: {order.id.slice(0, 8)}...
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase ${
                                order.division === "EVENTS"
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              }`}
                            >
                              {order.division} Specialist
                            </span>

                            <span
                              className={`px-2.5 py-0.5 rounded-full text-3xs font-extrabold border ${statusInfo.color}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                        </div>

                        {/* Location address place */}
                        <div className="mb-4 bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
                          <svg
                            className="h-4 w-4 text-gray-400 shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>
                            Place:{" "}
                            <span className="font-medium text-slate-800">
                              {order.clientAddress || "N/A"}
                            </span>
                          </span>
                        </div>

                        {/* Animated progress timeline bar */}
                        <div className="mb-4">
                          <div className="flex justify-between text-3xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                            <span>Stage Milestone Progress</span>
                            <span>{statusInfo.progress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                            <div
                              className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-500"
                              style={{ width: `${statusInfo.progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Driver & Meta info */}
                        <div className="grid sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
                          <div>
                            <span className="text-gray-400 font-bold text-3xs uppercase block">
                              Active Dispatcher
                            </span>
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              {order.driverName || "Unassigned"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 font-bold text-3xs uppercase block">
                              Load Manifest
                            </span>
                            <span className="font-semibold text-slate-800 block mt-0.5">
                              {order.items.length} product lines
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 font-bold text-3xs uppercase block">
                              Last Event Tick
                            </span>
                            <span className="font-semibold text-slate-800 font-mono block mt-0.5">
                              {new Date(order.updatedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {/* Operational Control Actions for Ongoing Orders */}
                        {order.status !== "COMPLETED" && (
                          <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 border border-slate-100 p-3 rounded-xl">
                            {/* Re-assignment Selector */}
                            <div className="flex flex-1 items-center gap-2 bg-white border border-[#E2E8F0] p-1.5 rounded-lg w-full">
                              <select
                                value={reassignmentMap[order.id] || ""}
                                onChange={(e) =>
                                  setReassignmentMap((prev) => ({
                                    ...prev,
                                    [order.id]: e.target.value,
                                  }))
                                }
                                className="bg-transparent text-xs font-semibold text-slate-700 w-full px-2 py-1 focus:outline-none cursor-pointer"
                              >
                                <option value="">-- Reassign Driver --</option>
                                {driversList
                                  .filter((drv) => drv.id !== order.driverId) // Don't show current driver
                                  .map((drv) => (
                                    <option key={drv.id} value={drv.id}>
                                      {drv.name} (Active: {drv.activeTasksCount} tasks)
                                    </option>
                                  ))}
                              </select>
                              <button
                                onClick={() => handleReassignDriver(order.id)}
                                disabled={assigningId === order.id || !reassignmentMap[order.id]}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-3xs font-extrabold uppercase tracking-wider rounded-md transition-all active:scale-95 shrink-0 flex items-center gap-1 shadow-sm"
                              >
                                {assigningId === order.id ? "..." : "Reassign 🔄"}
                              </button>
                            </div>

                            {/* Cancel Assignment Button */}
                            <button
                              onClick={() => handleCancelOrderAssignment(order.id)}
                              disabled={assigningId === order.id}
                              className="w-full lg:w-auto px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 hover:border-amber-300 text-amber-700 disabled:bg-slate-100 disabled:text-slate-400 text-3xs font-extrabold uppercase tracking-wider rounded-xl transition-all active:scale-95 shrink-0 flex items-center justify-center gap-1"
                            >
                              Cancel Assignment ↩
                            </button>
                          </div>
                        )}

                        {/* Permanent Purge/Delete Control */}
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handlePurgeOrder(order.id)}
                            disabled={assigningId === order.id}
                            className="text-gray-400 hover:text-rose-600 text-3xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 py-1 px-2 rounded hover:bg-rose-50"
                          >
                            Purge Order 🗑️
                          </button>
                        </div>

                        {/* Expanded details checklist manifest */}
                        <details className="mt-4 group border-t border-slate-100/50 pt-3">
                          <summary className="text-3xs text-blue-600 hover:text-blue-700 font-bold uppercase tracking-wider cursor-pointer list-none flex items-center gap-1 focus:outline-none">
                            <svg
                              className="h-3.5 w-3.5 transform group-open:rotate-180 transition-transform"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                            View Order Item Manifest Details
                          </summary>
                          <div className="mt-3 bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex justify-between"
                              >
                                <span className="font-medium text-slate-700">
                                  {item.name}{" "}
                                  <span className="text-gray-400">
                                    ({item.sku})
                                  </span>
                                </span>
                                <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded text-3xs font-mono">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 5: FINISHED COMPLETED ARCHIVE PANEL */}
          {activeTab === "completed" && (
            <div className="flex flex-col flex-1 h-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#F1F5F9] pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    Finished Orders Historical Archive
                  </h2>
                  <p className="text-xs text-gray-500">
                    Archived event records and completed equipment manifest setups
                  </p>
                </div>

                {/* Division Filter */}
                <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] p-0.5 rounded-xl">
                  <button
                    onClick={() => setDivisionFilter("ALL")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      divisionFilter === "ALL"
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-gray-500 hover:text-slate-900"
                    }`}
                  >
                    All Sections
                  </button>
                  <button
                    onClick={() => setDivisionFilter("EVENTS")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      divisionFilter === "EVENTS"
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-gray-500 hover:text-slate-900"
                    }`}
                  >
                    Event Tents
                  </button>
                  <button
                    onClick={() => setDivisionFilter("PARTY")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      divisionFilter === "PARTY"
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-gray-500 hover:text-slate-900"
                    }`}
                  >
                    Party Logistics
                  </button>
                </div>
              </div>

              {/* Grid content */}
              <div className="flex-1 overflow-y-auto space-y-4 max-h-[750px] pr-1">
                {loading ? (
                  <div className="text-center py-20 text-xs text-gray-400">
                    Querying Postgres archive...
                  </div>
                ) : completedOrders.length === 0 ? (
                  <div className="text-center py-24 border-2 border-dashed border-[#E2E8F0] rounded-2xl flex flex-col items-center justify-center p-6">
                    <svg
                      className="h-8 w-8 text-gray-450 mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h5 className="text-sm font-bold text-gray-400">
                      No completed logs found
                    </h5>
                    <p className="text-xs text-gray-500 mt-1 max-w-[280px]">
                      Once a driver finalizes setup and return recovery, tasks will be archived here.
                    </p>
                  </div>
                ) : (
                  completedOrders.map((order) => {
                    const statusInfo = mapStatus(order.status);
                    return (
                      <div
                        key={order.id}
                        className="border border-[#E2E8F0] bg-[#10B981]/5 rounded-2xl p-5 hover:border-emerald-200 transition-all"
                      >
                        {/* Upper card info */}
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-sm">
                              {order.clientName || "Direct Booking"}
                            </h4>
                            <span className="text-[10px] text-gray-400 font-mono font-bold block mt-0.5">
                              ORDER ID: {order.id.slice(0, 8)}...
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase ${
                                order.division === "EVENTS"
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              }`}
                            >
                              {order.division} Specialist
                            </span>

                            <span
                              className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-100 flex items-center gap-1"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Archived & Completed
                            </span>
                          </div>
                        </div>

                        {/* Location address place */}
                        <div className="mb-4 bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
                          <svg
                            className="h-4 w-4 text-gray-400 shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>
                            Place:{" "}
                            <span className="font-medium text-slate-800">
                              {order.clientAddress || "N/A"}
                            </span>
                          </span>
                        </div>

                        {/* Driver & Meta info */}
                        <div className="grid sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
                          <div>
                            <span className="text-gray-400 font-bold text-3xs uppercase block">
                              Assigned Driver
                            </span>
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {order.driverName || "Unassigned"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 font-bold text-3xs uppercase block">
                              Manifest Items
                            </span>
                            <span className="font-semibold text-slate-800 block mt-0.5">
                              {order.items.length} product lines
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 font-bold text-3xs uppercase block">
                              Completed Tick
                            </span>
                            <span className="font-semibold text-slate-800 font-mono block mt-0.5">
                              {new Date(order.updatedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {/* Critical Purge Control for Archive */}
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handlePurgeOrder(order.id)}
                            disabled={assigningId === order.id}
                            className="text-gray-400 hover:text-rose-600 text-3xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 py-1 px-2 rounded hover:bg-rose-50"
                          >
                            Purge Log 🗑️
                          </button>
                        </div>

                        {/* Expanded details checklist manifest */}
                        <details className="mt-4 group border-t border-slate-100/50 pt-3">
                          <summary className="text-3xs text-blue-600 hover:text-blue-700 font-bold uppercase tracking-wider cursor-pointer list-none flex items-center gap-1 focus:outline-none">
                            <svg
                              className="h-3.5 w-3.5 transform group-open:rotate-180 transition-transform"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                            View Order Item Manifest Details
                          </summary>
                          <div className="mt-3 bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex justify-between"
                              >
                                <span className="font-medium text-slate-700">
                                  {item.name}{" "}
                                  <span className="text-gray-400">
                                    ({item.sku})
                                  </span>
                                </span>
                                <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded text-3xs font-mono">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ONCOMING ORDERS (ASSIGNOR) */}
          {activeTab === "assignor" && (
            <div className="flex flex-col flex-1 h-full">
              <div className="border-b border-[#F1F5F9] pb-4 mb-6">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Oncoming Orders Dispatch Assignor
                </h2>
                <p className="text-xs text-gray-500">
                  Assign oncoming client portal orders to operational drivers
                </p>
              </div>

              {/* oncoming unassigned oncoming orders list */}
              <div className="flex-1 overflow-y-auto space-y-4 max-h-[750px] pr-1">
                {loading ? (
                  <div className="text-center py-20 text-xs text-gray-400">
                    Connecting...
                  </div>
                ) : oncomingOrders.length === 0 ? (
                  <div className="text-center py-24 border-2 border-dashed border-[#E2E8F0] rounded-2xl flex flex-col items-center justify-center p-6">
                    <svg
                      className="h-8 w-8 text-gray-450 mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <h5 className="text-sm font-bold text-gray-400">
                      All oncoming orders assigned
                    </h5>
                    <p className="text-xs text-gray-500 mt-1 max-w-[280px]">
                      New oncoming orders submitted by clients will pop onto
                      this board instantly via Kafka!
                    </p>
                  </div>
                ) : (
                  oncomingOrders.map((order) => {
                    const selDriver = selectedDriversMap[order.id] || "";
                    return (
                      <div
                        key={order.id}
                        className="border border-blue-200 bg-blue-50/5 rounded-2xl p-5 hover:border-blue-300 hover:bg-blue-50/10 transition-all flex flex-col justify-between"
                      >
                        {/* Header block */}
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-sm">
                              {order.clientName}
                            </h4>
                            <span className="text-[10px] text-gray-400 font-mono font-bold block mt-0.5">
                              INCOMING ID: {order.id.slice(0, 8)}...
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase ${
                                order.division === "EVENTS"
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              }`}
                            >
                              {order.division} Load
                            </span>

                            <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full text-3xs font-extrabold uppercase tracking-wider">
                              Unassigned Pending
                            </span>
                          </div>
                        </div>

                        {/* Location details */}
                        <div className="mb-4 bg-slate-50 border border-slate-100 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
                          <svg
                            className="h-4 w-4 text-gray-400 shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <div>
                            <div className="font-bold text-slate-800">
                              Event Place Address:
                            </div>
                            <div className="font-medium text-slate-700 mt-0.5">
                              {order.clientAddress}
                            </div>
                          </div>
                        </div>

                        {/* Item manifest summary */}
                        <div className="bg-white border border-slate-150 rounded-xl p-3.5 mb-4 text-xs">
                          <span className="text-gray-500 font-bold uppercase tracking-wider text-3xs block mb-2">
                            Manifest Items Required
                          </span>
                          <ul className="space-y-1.5">
                            {order.items.map((item) => (
                              <li
                                key={item.id}
                                className="flex justify-between items-center text-slate-700"
                              >
                                <span className="truncate max-w-[320px]">
                                  {item.name}
                                </span>
                                <span className="font-mono text-white bg-slate-800 px-1.5 py-0.5 rounded text-3xs">
                                  x{item.quantity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Assign block */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white border border-[#E2E8F0] p-2.5 rounded-xl">
                          <select
                            value={selDriver}
                            onChange={(e) =>
                              setSelectedDriversMap((prev) => ({
                                ...prev,
                                [order.id]: e.target.value,
                              }))
                            }
                            className="bg-transparent text-xs font-semibold text-slate-700 w-full px-2 py-1.5 focus:outline-none cursor-pointer"
                          >
                            {driversList.length === 0 ? (
                              <option value="">No drivers provisioned</option>
                            ) : (
                              <>
                                <option value="">-- Choose Driver --</option>
                                {driversList.map((drv) => (
                                  <option key={drv.id} value={drv.id}>
                                    {drv.name} (Active: {drv.activeTasksCount}{" "}
                                    tasks)
                                  </option>
                                ))}
                              </>
                            )}
                          </select>

                          <button
                            onClick={() => handleDispatchOrder(order.id)}
                            disabled={
                              assigningId === order.id ||
                              driversList.length === 0
                            }
                            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shadow-md flex items-center justify-center shrink-0"
                          >
                            {assigningId === order.id
                              ? "Assigning..."
                              : "Dispatch Route 🚀"}
                          </button>
                        </div>

                        {/* Permanent Purge/Delete Control */}
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handlePurgeOrder(order.id)}
                            disabled={assigningId === order.id}
                            className="text-gray-400 hover:text-rose-600 text-3xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 py-1 px-2 rounded hover:bg-rose-50 cursor-pointer"
                          >
                            Purge Order 🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DRIVERS GRID */}
          {activeTab === "drivers" && (
            <div className="flex flex-col flex-1 h-full">
              <div className="border-b border-[#F1F5F9] pb-4 mb-6">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Registered Operational Drivers
                </h2>
                <p className="text-xs text-gray-500">
                  Overview of field employees and active log workload queues
                </p>
              </div>

              {/* Drivers Telemetry List */}
              <div className="flex-1 overflow-y-auto space-y-4 max-h-[520px] pr-1">
                {loading ? (
                  <div className="text-center py-20 text-xs text-gray-400">
                    Loading...
                  </div>
                ) : driversList.length === 0 ? (
                  <div className="text-center py-20 text-xs text-gray-400">
                    No active drivers found. Add one in the Accounts panel!
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {driversList.map((drv) => (
                      <div
                        key={drv.id}
                        className="border border-[#E2E8F0] bg-slate-50/20 rounded-2xl p-5 hover:border-slate-350 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-extrabold text-slate-800 text-sm">
                              {drv.name}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded-full text-3xs font-extrabold uppercase ${
                                drv.activeTasksCount > 0
                                  ? "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              }`}
                            >
                              {drv.activeTasksCount > 0
                                ? "On Duty"
                                : "Idle Ready"}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 font-medium font-mono space-y-1">
                            <div>
                              Email:{" "}
                              <span className="text-slate-700">
                                {drv.email}
                              </span>
                            </div>
                            <div>
                              Clerk ID:{" "}
                              <span className="text-slate-400 text-3xs">
                                {drv.id}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3.5 border-t border-slate-100 flex justify-between items-center text-xs">
                          <span className="text-gray-400 font-bold text-3xs uppercase">
                            Active Task Load
                          </span>
                          <span className="font-extrabold text-[#1E3A8A] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 text-xs">
                            {drv.activeTasksCount} active orders
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ACCOUNTS PANEL (PROVISIONER & USER MANAGEMENT) */}
          {activeTab === "accounts" && (
            <div className="flex flex-col flex-1 h-full">
              <div className="border-b border-[#F1F5F9] pb-4 mb-6">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Employee Accounts Manager
                </h2>
                <p className="text-xs text-gray-500">
                  Manage user roles (Driver / Office) and provision new team
                  member credentials
                </p>
              </div>

              <div className="grid lg:grid-cols-12 gap-8 items-start">
                {/* Left side: Add New Team Member Form (5 Columns) */}
                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-3xl p-6 flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-extrabold text-slate-800">
                      Add New Team Member
                    </h4>
                    <p className="text-3xs text-gray-400">
                      Save their profile so they are automatically linked on
                      signup
                    </p>
                  </div>

                  <form
                    onSubmit={handleProvisionEmployee}
                    className="space-y-4"
                  >
                    <div>
                      <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={newEmpName}
                        onChange={(e) => setNewEmpName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={newEmpEmail}
                        onChange={(e) => setNewEmpEmail(e.target.value)}
                        placeholder="e.g. john@diamondevent.com"
                        className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">
                        Logistics Role
                      </label>
                      <select
                        value={newEmpRole}
                        onChange={(e) =>
                          setNewEmpRole(e.target.value as "OFFICE" | "DRIVER")
                        }
                        className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-blue-600 font-bold text-slate-700 cursor-pointer"
                      >
                        <option value="DRIVER">
                          Field Driver (Repartidor)
                        </option>
                        <option value="OFFICE">
                          Office Member (Administrador)
                        </option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={provisioningLoading}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4"
                    >
                      {provisioningLoading
                        ? "Adding..."
                        : "Provision Employee Account 🔐"}
                    </button>
                  </form>

                  {/* Provision status toast */}
                  {provisioningStatus && (
                    <div
                      className={`p-4 rounded-xl border text-3xs font-semibold flex flex-col gap-1 ${
                        provisioningStatus.success
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-rose-50 border-rose-200 text-rose-700"
                      }`}
                    >
                      <span className="font-bold">
                        {provisioningStatus.success
                          ? "Profile Created"
                          : "Provisioning Failed"}
                      </span>
                      <span>{provisioningStatus.message}</span>
                    </div>
                  )}
                </div>

                {/* Right side: Accounts Directory (7 Columns) */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">
                        Registered Accounts Directory
                      </h4>
                      <p className="text-3xs text-gray-400">
                        Total registered profiles in system
                      </p>
                    </div>
                    <span className="bg-blue-50 text-blue-700 border border-blue-100 text-3xs font-bold px-2 py-0.5 rounded-full uppercase">
                      {allUsersList.length} Accounts
                    </span>
                  </div>

                  {/* Scrollable list */}
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {allUsersList.length === 0 ? (
                      <div className="text-center py-12 text-xs text-gray-400">
                        No registered profiles loaded.
                      </div>
                    ) : (
                      allUsersList.map((usr) => {
                        const isSelf = !!(clerkUser && clerkUser.id === usr.id);
                        return (
                          <div
                            key={usr.id}
                            className={`p-4 border rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all ${
                              isSelf
                                ? "border-blue-300 bg-blue-50/10"
                                : "border-slate-100 hover:border-slate-200 bg-slate-50/30"
                            }`}
                          >
                            {/* User details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-slate-800 truncate">
                                  {usr.name}
                                </span>
                                {isSelf && (
                                  <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                    You (Self)
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                    usr.role === "OFFICE"
                                      ? "bg-purple-50 text-purple-700 border border-purple-100"
                                      : "bg-teal-50 text-teal-700 border border-teal-100"
                                  }`}
                                >
                                  {usr.role}
                                </span>
                              </div>
                              <div className="text-3xs text-gray-400 mt-1 font-mono truncate">
                                {usr.email}
                              </div>
                              {usr.id.startsWith("temp_") ? (
                                <span className="text-[9px] text-amber-600 font-bold bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded mt-1.5 inline-block">
                                  ⏳ Awaiting Clerk Sign-up Linking
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded mt-1.5 inline-block">
                                  ✅ Clerk ID Linked
                                </span>
                              )}
                            </div>

                            {/* User management options */}
                            <div className="flex items-center gap-3 shrink-0">
                              {/* Role Selector change */}
                              <select
                                value={usr.role}
                                onChange={(e) =>
                                  handleUpdateUserRole(
                                    usr.id,
                                    e.target.value as "OFFICE" | "DRIVER",
                                  )
                                }
                                disabled={updatingRoleUserId === usr.id}
                                className="bg-white border border-[#E2E8F0] rounded-xl px-2 py-1.5 text-3xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:border-blue-650"
                              >
                                <option value="DRIVER">Field Driver</option>
                                <option value="OFFICE">Office Admin</option>
                              </select>

                              {/* Edit Details Button */}
                              <button
                                onClick={() => setEditingUser({
                                  id: usr.id,
                                  name: usr.name,
                                  email: usr.email,
                                  role: usr.role as "OFFICE" | "DRIVER"
                                })}
                                title="Edit employee details"
                                className="p-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-sm"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteUser(usr.id)}
                                disabled={isSelf}
                                title={
                                  isSelf
                                    ? "You cannot delete yourself"
                                    : "Remove account"
                                }
                                className={`p-2 rounded-xl border transition-all ${
                                  isSelf
                                    ? "bg-slate-50 border-slate-100 text-slate-350 cursor-not-allowed"
                                    : "bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-600 active:scale-95 cursor-pointer"
                                }`}
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom Floating Console Drawer for Live Kafka Streams */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800 shadow-2xl transition-all duration-300 overflow-hidden">
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          className="w-full px-6 py-3 flex items-center justify-between text-left focus:outline-none bg-slate-950 text-white border-b border-slate-900"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
            </span>
            <span className="text-3xs font-bold uppercase tracking-widest text-[#10b981]">
              Live Kafka Event Logs Telemetry Broker
            </span>
          </div>

          <span className="text-3xs font-bold text-slate-400 flex items-center gap-1">
            {logsExpanded ? "Collapse Logs ▲" : "Expand Logs ▼"} (
            {kafkaLogs.length} buffered)
          </span>
        </button>

        {logsExpanded && (
          <div className="bg-[#030712] p-4 font-mono text-3xs text-slate-300 max-h-[160px] overflow-y-auto space-y-2">
            {kafkaLogs.length === 0 ? (
              <div className="py-6 text-center text-gray-650 font-bold terminal-glow">
                █ STANDBY - EVENT SOURCES BOUND. ONCOMING SUBMISSIONS
                LISTENING...
              </div>
            ) : (
              kafkaLogs.map((log, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row gap-2 border-b border-slate-900/50 pb-1.5 last:border-0 last:pb-0"
                >
                  <span className="text-slate-650 shrink-0 font-bold">
                    [{log.timestamp}]
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-4xs font-bold border shrink-0 ${
                      log.topic.includes("assigned")
                        ? "bg-blue-950 text-blue-400 border-blue-900"
                        : log.topic.includes("completed")
                          ? "bg-emerald-950 text-emerald-400 border-emerald-900"
                          : "bg-amber-950 text-amber-400 border-amber-900"
                    }`}
                  >
                    {log.topic}
                  </span>
                  <div className="min-w-0 flex-1 break-all">
                    <span className="text-emerald-400 font-bold mr-1.5">
                      {log.eventType}:
                    </span>
                    <span className="text-slate-400 font-mono">
                      {JSON.stringify(log.payload)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </footer>

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

      {/* Custom Edit Employee Overlay Popup Dialog */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-[#0B2545]/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E2E8F0] rounded-3xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200 flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <span className="h-8 w-8 rounded-full flex items-center justify-center text-sm bg-blue-50 text-blue-650 border border-blue-100 shadow-sm">
                ✏️
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm">Modify Employee Profile</h3>
            </div>
            
            <form onSubmit={handleEditEmployeeDetails} className="space-y-4">
              <div>
                <label className="text-3xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="text-3xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Address</label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-850 focus:outline-none focus:border-blue-600 font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-3xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Logistics Role</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, role: e.target.value as "OFFICE" | "DRIVER" } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-650 cursor-pointer"
                >
                  <option value="DRIVER">Field Driver (Repartidor)</option>
                  <option value="OFFICE">Office Member (Administrador)</option>
                </select>
              </div>

              <div className="flex gap-2.5 mt-4 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-650 text-3xs font-extrabold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingEmployeeLoading}
                  className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl text-3xs font-extrabold uppercase tracking-wider transition-all active:scale-95 shadow cursor-pointer flex items-center justify-center font-bold"
                >
                  {updatingEmployeeLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
