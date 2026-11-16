import React, { useState, useEffect } from 'react';
import { api, UserInfo } from '../api/client';
import { Package, AlertTriangle, CheckCircle, RefreshCw, Plus, Truck } from 'lucide-react';

interface PartsDeskProps {
  user?: UserInfo;
  activeSection?: string;
}

export const PartsDesk: React.FC<PartsDeskProps> = ({ user: _user, activeSection: _activeSection = 'all' }) => {
  const [parts, setParts] = useState<any[]>([]);
  const [customQty, setCustomQty] = useState<{ [partId: string]: number }>({});
  const [isRestocking, setIsRestocking] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Bulk shipment modal
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipmentPartId, setShipmentPartId] = useState('');
  const [shipmentQty, setShipmentQty] = useState(25);

  const loadParts = async () => {
    try {
      const data = await api.getParts();
      setParts(data);
      if (data.length > 0 && !shipmentPartId) {
        setShipmentPartId(data[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    loadParts();
  }, []);

  const handleRestock = async (partId: string, partName: string, qtyOverride?: number) => {
    const rawVal = qtyOverride !== undefined ? qtyOverride : (customQty[partId] !== undefined ? customQty[partId] : 5);
    const quantity = Math.max(1, parseInt(String(rawVal), 10) || 1);
    try {
      setIsRestocking(partId);
      setErrorMsg('');
      await api.restockPart(partId, quantity);
      setSuccessMsg(`Replenished +${quantity} units of ${partName} into depot inventory.`);
      await loadParts();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsRestocking(null);
    }
  };

  const handleShipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipmentPartId) return;
    const part = parts.find(p => p.id === shipmentPartId);
    await handleRestock(shipmentPartId, part?.name || 'Selected Part', shipmentQty);
    setShowShipmentModal(false);
  };

  const totalStock = parts.reduce((acc, p) => acc + Number(p.stock_on_hand), 0);
  const totalReserved = parts.reduce((acc, p) => acc + Number(p.reserved_quantity), 0);
  const lowStockCount = parts.filter(p => Number(p.available_quantity) <= Number(p.min_threshold)).length;

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md flex items-center justify-between text-red-700 text-sm">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-md flex items-center justify-between text-emerald-800 text-sm">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 font-bold">&times;</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Package className="w-6 h-6 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900">Parts Storekeeper Inventory</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time stock on hand, active reservation leases, and transactional guard tracking.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowShipmentModal(true)}
            className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Truck className="w-4 h-4" />
            <span>Receive Shipment</span>
          </button>

          <button
            onClick={loadParts}
            className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Stock</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Units on Hand</div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{totalStock}</div>
          <div className="text-xs text-emerald-600 mt-1 flex items-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Physical Depot Verified</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Active Reservations</div>
          <div className="text-3xl font-extrabold text-amber-600 mt-2 font-mono">{totalReserved}</div>
          <div className="text-xs text-slate-500 mt-1">
            Locked against concurrent jobs
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Low Stock Reorders</div>
          <div className="text-3xl font-extrabold text-red-600 mt-2 font-mono">{lowStockCount}</div>
          <div className="text-xs text-red-600 mt-1 flex items-center space-x-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>At or below min threshold</span>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Spare Parts Master Catalog ({parts.length})
          </h2>
          <span className="text-xs text-slate-500">PostgreSQL Stock Guard: <code className="font-mono text-sky-700 font-bold">reserved &le; stock_on_hand</code></span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50/50 text-slate-500 uppercase font-medium">
              <tr>
                <th className="px-5 py-3 text-left">Part Code</th>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-right">Unit Cost</th>
                <th className="px-5 py-3 text-center">Stock On Hand</th>
                <th className="px-5 py-3 text-center">Reserved</th>
                <th className="px-5 py-3 text-center">Available</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Restock Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {parts.map((p) => {
                const isLow = Number(p.available_quantity) <= Number(p.min_threshold);
                const currentVal = customQty[p.id] !== undefined ? customQty[p.id] : 5;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">{p.part_code}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-5 py-3 text-slate-500">{p.category}</td>
                    <td className="px-5 py-3 font-mono text-right">${Number(p.unit_cost).toFixed(2)}</td>
                    <td className="px-5 py-3 text-center font-mono font-bold text-slate-900">{p.stock_on_hand}</td>
                    <td className="px-5 py-3 text-center font-mono text-amber-600 font-semibold">{p.reserved_quantity}</td>
                    <td className="px-5 py-3 text-center font-mono font-extrabold text-sky-600">{p.available_quantity}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isLow ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isLow ? 'Low Stock' : 'Optimal'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={currentVal}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setCustomQty(prev => ({ ...prev, [p.id]: isNaN(val) ? 1 : Math.max(1, Math.min(val, 999)) }));
                          }}
                          className="w-16 px-2 py-1 text-center font-mono text-xs border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 focus:outline-none"
                          title="Enter custom restock quantity"
                        />
                        <button
                          disabled={isRestocking === p.id}
                          onClick={() => handleRestock(p.id, p.name)}
                          className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs px-2.5 py-1 rounded-md font-medium shadow-sm transition flex items-center space-x-1"
                          title="Restock specified quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isRestocking === p.id ? 'Saving...' : 'Add'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Shipment Intake Modal */}
      {showShipmentModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-lg">Receive Supplier Delivery</h3>
              </div>
              <button
                onClick={() => setShowShipmentModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleShipmentSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Spare Part</label>
                <select
                  value={shipmentPartId}
                  onChange={(e) => setShipmentPartId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500"
                >
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.part_code} — {p.name} (Current: {p.stock_on_hand})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Quantity to Add</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={shipmentQty}
                    onChange={(e) => setShipmentQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-sky-500"
                  />
                  <div className="flex space-x-1">
                    {[10, 25, 50, 100].map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setShipmentQty(preset)}
                        className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-mono font-semibold"
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowShipmentModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Confirm Receipt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
