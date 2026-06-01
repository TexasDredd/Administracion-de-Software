"use client";

import { useEffect, useState } from "react";
import { UserButton, useUser } from "@clerk/nextjs";

interface Product {
  id: number;
  sku: string;
  name: string;
  price?: number;
  size?: string;
  style?: string;
  totalQuantity: number;
}

export default function ClientDashboard() {
  const { user } = useUser();

  // Product lists from DB
  const [partyProductsList, setPartyProductsList] = useState<Product[]>([]);
  const [eventProductsList, setEventProductsList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [selectedDivision, setSelectedDivision] = useState<"PARTY" | "EVENTS">("EVENTS");
  
  // Selected items manifest
  const [selectedItems, setSelectedItems] = useState<{ [key: string]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccessId, setOrderSuccessId] = useState<string | null>(null);

  // Fetch products catalog on mount
  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (data.success) {
          setPartyProductsList(data.partyProducts || []);
          setEventProductsList(data.eventProducts || []);
        }
      } catch (err) {
        console.error("Failed to fetch product catalogs:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  // Set default client name and email once Clerk user loads
  useEffect(() => {
    if (user) {
      setClientName(user.fullName || "");
    }
  }, [user]);

  const handleQtyChange = (sku: string, qty: number) => {
    if (qty <= 0) {
      const copy = { ...selectedItems };
      delete copy[sku];
      setSelectedItems(copy);
    } else {
      setSelectedItems(prev => ({ ...prev, [sku]: qty }));
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !clientAddress) {
      alert("Please provide your name and event location address.");
      return;
    }

    const itemsPayload = Object.entries(selectedItems).map(([sku, quantity]) => {
      // Find item either in party or event list
      const partyItem = partyProductsList.find(p => p.sku === sku);
      const eventItem = eventProductsList.find(p => p.sku === sku);
      
      return {
        productId: partyItem ? partyItem.id : eventItem!.id,
        productType: partyItem ? "PARTY" : "EVENTS",
        quantity
      };
    });

    if (itemsPayload.length === 0) {
      alert("Please add at least one product to your booking manifest.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientPhone,
          clientEmail: user?.primaryEmailAddress?.emailAddress || "",
          clientAddress,
          pickupDate,
          division: selectedDivision,
          items: itemsPayload
        })
      });

      const data = await res.json();
      if (data.success) {
        setOrderSuccessId(data.orderId);
        setSelectedItems({});
        setClientAddress("");
        setClientPhone("");
      } else {
        alert(data.error || "Failed to submit order.");
      }
    } catch (err) {
      console.error("Submit order error:", err);
      alert("Error submitting order to logistics server.");
    } finally {
      setSubmitting(false);
    }
  };

  const getActiveCatalog = () => {
    return selectedDivision === "EVENTS" ? eventProductsList : partyProductsList;
  };

  const formatUSD = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans flex flex-col">
      {/* Premium Brand Header */}
      <header className="bg-white border-b border-[#E2E8F0] shadow-sm sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-[#1E3A8A] rounded-xl flex items-center justify-center font-bold text-white shadow-lg border border-blue-850 transform rotate-45">
              <span className="transform -rotate-45 text-lg">D</span>
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#0F172A]">DIAMOND EVENT & TENT</h1>
              <p className="text-3xs text-[#2563EB] tracking-widest font-extrabold uppercase mt-[-2px]">
                Client Booking Portal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 font-medium hidden md:inline">
              Welcome, <span className="text-slate-800 font-bold">{user?.fullName}</span>
            </span>
            <UserButton />
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid lg:grid-cols-12 gap-8 mt-2">
        {orderSuccessId ? (
          // Success Screen
          <div className="lg:col-span-12 bg-white border border-[#E2E8F0] rounded-3xl p-12 text-center max-w-xl mx-auto my-12 shadow-md flex flex-col items-center gap-6">
            <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-200">
              <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900">Rental Order Confirmed!</h3>
              <p className="text-gray-500 text-sm mt-2 max-w-md">
                Your manifest has been successfully submitted and produced to the logistics queue. Our office dispatch team is reviewing your schedule now.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl w-full font-mono text-xs text-slate-600 flex flex-col gap-1.5 text-left">
              <div>Order Reference ID: <span className="font-bold text-slate-800 select-all">{orderSuccessId}</span></div>
              <div>Division Category: <span className="font-bold text-slate-800">{selectedDivision}</span></div>
              <div>Status: <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full text-3xs uppercase tracking-wider">Pending Dispatch</span></div>
            </div>

            <button
              onClick={() => setOrderSuccessId(null)}
              className="px-6 py-3 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all w-full"
            >
              Book Another Order
            </button>
          </div>
        ) : (
          // Dynamic Booking Form
          <>
            {/* Left 7 Columns: Details & Catalog */}
            <div className="lg:col-span-8 flex flex-col gap-8">
              
              {/* Client & Venue Details Card */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  1. Venue & Client Contact
                </h2>
                
                <form className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Your Name</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. John Smith"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="e.g. 801-555-0123"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 font-medium"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Event Delivery Address (Place)</label>
                    <input
                      type="text"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      placeholder="e.g. 123 S West Temple, Salt Lake City, UT 84101"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 font-medium"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-3xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Requested Pick-up Date (Stand-by Release)</label>
                    <input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 font-medium cursor-pointer"
                      required
                    />
                  </div>
                </form>
              </div>

              {/* Division Segment Selection */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  2. Select Rental division
                </h2>
                <p className="text-xs text-gray-400 mb-6">Choose the category of products you are renting. Tents require Event specialists, tableware/furniture requires Party specialists.</p>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Option EVENTS */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDivision("EVENTS");
                      setSelectedItems({});
                    }}
                    className={`p-6 border-2 rounded-2xl flex flex-col gap-2 text-left transition-all ${
                      selectedDivision === "EVENTS"
                        ? "border-blue-600 bg-blue-50/20 text-[#1E3A8A]"
                        : "border-[#E2E8F0] hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <span className="text-base font-extrabold block">Event Tents & Structures</span>
                    <span className="text-xs text-gray-400">High peak frame tents, tension pole structures, clearspan installations.</span>
                  </button>

                  {/* Option PARTY */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDivision("PARTY");
                      setSelectedItems({});
                    }}
                    className={`p-6 border-2 rounded-2xl flex flex-col gap-2 text-left transition-all ${
                      selectedDivision === "PARTY"
                        ? "border-blue-600 bg-blue-50/20 text-[#1E3A8A]"
                        : "border-[#E2E8F0] hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <span className="text-base font-extrabold block">Party Logistics & Decor</span>
                    <span className="text-xs text-gray-400">Resin folding chairs, ballroom chairs, round and banquet tables, linens.</span>
                  </button>
                </div>
              </div>

              {/* Catalog Product Selection */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  3. Product Catalog
                </h2>
                
                {loading ? (
                  <div className="text-center py-12 text-sm text-gray-500">Loading catalog items...</div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {getActiveCatalog().map((product) => {
                      const qty = selectedItems[product.sku] || 0;
                      return (
                        <div key={product.id} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 flex flex-col justify-between hover:border-slate-200 transition-all">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-slate-900 text-sm leading-snug">{product.name}</h4>
                              <span className="text-3xs font-bold font-mono text-gray-400">{product.sku}</span>
                            </div>
                            
                            {/* Product Attributes details */}
                            {product.size && (
                              <div className="text-3xs text-gray-500 mt-1 font-semibold uppercase tracking-wider">
                                Size: {product.size} | Style: {product.style}
                              </div>
                            )}

                            {product.price && (
                              <div className="text-xs text-blue-700 font-extrabold mt-1">
                                {formatUSD(product.price)} <span className="text-3xs text-gray-400 font-semibold uppercase">per unit</span>
                              </div>
                            )}
                          </div>

                          {/* Quantity Selector */}
                          <div className="flex items-center justify-between border border-[#E2E8F0] bg-white rounded-xl px-2.5 py-1.5 mt-4">
                            <span className="text-3xs text-gray-500 font-bold uppercase tracking-wider">Quantity</span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleQtyChange(product.sku, qty - 1)}
                                className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold flex items-center justify-center transition-all text-xs"
                              >
                                -
                              </button>
                              <span className="font-bold text-sm text-slate-900 font-mono w-4 text-center">{qty}</span>
                              <button
                                type="button"
                                onClick={() => handleQtyChange(product.sku, qty + 1)}
                                className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold flex items-center justify-center transition-all text-xs"
                              >
                                +
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Right 4 Columns: Manifest Summary & CTA */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm sticky top-24">
                <h3 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3.5 mb-4 flex items-center gap-2">
                  <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Booking Manifest Summary
                </h3>

                {Object.keys(selectedItems).length === 0 ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    Your manifest list is empty. Add rental products from the catalog to build your load.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Items List */}
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {Object.entries(selectedItems).map(([sku, quantity]) => {
                        const item = selectedDivision === "EVENTS"
                          ? eventProductsList.find(p => p.sku === sku)
                          : partyProductsList.find(p => p.sku === sku);
                        
                        if (!item) return null;

                        return (
                          <div key={sku} className="flex items-center justify-between text-xs border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="font-bold text-slate-800 truncate">{item.name}</span>
                              <span className="text-3xs text-gray-400 font-mono mt-0.5">{sku}</span>
                            </div>
                            <div className="font-mono font-bold text-white bg-[#1e2235] px-2 py-0.5 rounded text-3xs shrink-0">
                              x{quantity}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Division Details Badge */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-bold uppercase tracking-wider text-2xs">Division Section</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase ${
                        selectedDivision === "EVENTS" 
                          ? "bg-red-500/10 text-red-600 border border-red-500/20" 
                          : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                      }`}>
                        {selectedDivision} Specialist Delivery
                      </span>
                    </div>

                    {/* Delivery Destination */}
                    {clientAddress && (
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-600">
                        <span className="text-gray-500 font-bold uppercase tracking-wider text-2xs block mb-1">Destination Location</span>
                        <span className="font-medium text-slate-800">{clientAddress}</span>
                      </div>
                    )}

                    {/* Submit CTA Button */}
                    <button
                      onClick={handleSubmitOrder}
                      disabled={submitting}
                      className="w-full py-4 bg-[#1E3A8A] hover:bg-blue-800 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
                    >
                      {submitting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Submitting Manifest Load...
                        </>
                      ) : (
                        "Submit Rental Order 🚀"
                      )}
                    </button>

                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </main>
    </div>
  );
}
