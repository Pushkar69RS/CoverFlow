import React, { useState, useEffect } from 'react';
import { api, UserInfo } from '../api/client';
import { PlusCircle, AlertCircle, Shield, Clock, CheckCircle, CreditCard, ChevronRight } from 'lucide-react';

interface CustomerPortalProps {
  user?: UserInfo;
  activeSection?: string;
}

export interface FaultOption {
  value: string;
  label: string;
  isExcluded?: boolean;
}

export function getFaultsForUnit(unit?: any): FaultOption[] {
  if (!unit) {
    return [
      { value: 'HARDWARE_MALFUNCTION', label: 'Hardware Malfunction' },
      { value: 'ELECTRICAL_FAULT', label: 'Electrical Board / Power Surge' },
      { value: 'PHYSICAL_DAMAGE', label: 'Physical Damage / Impact Crack (Excluded on standard AMC)', isExcluded: true },
      { value: 'LIQUID_SPILL', label: 'Liquid Spill / Ingress (Excluded on AMC/Warranty)', isExcluded: true },
    ];
  }

  const modelName = (unit.model_name || '').toLowerCase();
  const modelCategory = (unit.model_category || '').toLowerCase();
  const modelNumber = (unit.model_number || '').toLowerCase();

  // 1. Refrigerator / Appliance
  if (
    modelName.includes('refrigerator') ||
    modelName.includes('fridge') ||
    modelNumber.includes('ref') ||
    modelCategory.includes('refrigerator') ||
    (modelCategory.includes('appliance') && modelName.includes('ref'))
  ) {
    return [
      { value: 'COOLING_FAILURE', label: 'Cooling Failure / Refrigerator Not Cooling' },
      { value: 'COMPRESSOR_NOISE', label: 'Compressor Noise / Loud Vibrations' },
      { value: 'FROST_BUILDUP', label: 'Excessive Frost Buildup / Defrost Malfunction' },
      { value: 'WATER_LEAKAGE', label: 'Water Leakage / Drainage Line Blockage' },
      { value: 'THERMOSTAT_FAILURE', label: 'Temperature Control / Sensor Glitch' },
      { value: 'DOOR_SEAL_DAMAGE', label: 'Door Gasket / Seal Damage (Wear & Tear)' },
      { value: 'PHYSICAL_DAMAGE', label: 'Physical Dent / Shelving Damage (Excluded on standard AMC)', isExcluded: true },
      { value: 'LIQUID_SPILL', label: 'External Liquid Ingress / Electrical Short (Excluded)', isExcluded: true },
    ];
  }

  // 2. Television / TV
  if (
    modelName.includes('tv') ||
    modelName.includes('television') ||
    modelName.includes('bravia') ||
    modelName.includes('oled') ||
    modelCategory.includes('television') ||
    modelNumber.includes('tv')
  ) {
    return [
      { value: 'DISPLAY_FLICKER', label: 'Display / Screen Flicker / No Picture' },
      { value: 'PANEL_LINES', label: 'Horizontal / Vertical Lines on Panel' },
      { value: 'ELECTRICAL_FAULT', label: 'Power Board Failure / Won\'t Turn On' },
      { value: 'SPEAKER_CRACKLE', label: 'Speaker / Audio Distortion / Crackle' },
      { value: 'HDMI_PORT_FAILURE', label: 'HDMI / Port Connectivity Glitch' },
      { value: 'PHYSICAL_DAMAGE', label: 'Physical Damage / Screen Crack (Excluded on standard AMC)', isExcluded: true },
      { value: 'LIQUID_SPILL', label: 'Liquid Spill / Water Ingress (Excluded on AMC/Warranty)', isExcluded: true },
    ];
  }

  // 3. Laptop / MacBook / Computer
  if (
    modelName.includes('laptop') ||
    modelName.includes('macbook') ||
    modelName.includes('computer') ||
    modelCategory.includes('laptop') ||
    modelNumber.includes('mbp')
  ) {
    return [
      { value: 'MOTHERBOARD_FAILURE', label: 'Logic Board / Won\'t Boot / Power Surge' },
      { value: 'BATTERY_DRAIN', label: 'Battery Degradation / Charging Failure' },
      { value: 'SCREEN_GLITCH', label: 'Screen Glitch / Backlight Bleed' },
      { value: 'KEYBOARD_TRACKPAD', label: 'Keyboard / Trackpad Unresponsive' },
      { value: 'THERMAL_OVERHEATING', label: 'Fan Failure / Thermal Throttling' },
      { value: 'PHYSICAL_DAMAGE', label: 'Chassis Dent / Cracked Screen (Excluded on standard AMC)', isExcluded: true },
      { value: 'LIQUID_SPILL', label: 'Liquid Spill on Keyboard / Logic Board (Excluded)', isExcluded: true },
    ];
  }

  // 4. Smartphone / iPhone
  if (
    modelName.includes('phone') ||
    modelName.includes('iphone') ||
    modelName.includes('mobile') ||
    modelCategory.includes('smartphone') ||
    modelNumber.includes('phn')
  ) {
    return [
      { value: 'SCREEN_TOUCH_ISSUE', label: 'Touchscreen Unresponsive / Ghost Touch' },
      { value: 'BATTERY_DRAIN', label: 'Rapid Battery Drain / Charging Port Failure' },
      { value: 'CAMERA_MALFUNCTION', label: 'Camera Sensor / Focus Failure' },
      { value: 'SPEAKER_MIC_FAILURE', label: 'Earpiece / Speaker / Mic Muffled' },
      { value: 'PHYSICAL_DAMAGE', label: 'Cracked Glass / Dropped Screen (Excluded on standard AMC)', isExcluded: true },
      { value: 'LIQUID_SPILL', label: 'Water Submersion / Liquid Ingress (Excluded)', isExcluded: true },
    ];
  }

  // 5. Washing Machine
  if (modelName.includes('washing') || modelName.includes('washer')) {
    return [
      { value: 'DRUM_SPIN_FAILURE', label: 'Drum Won\'t Spin / Drive Belt Glitch' },
      { value: 'DRAINAGE_ERROR', label: 'Water Not Draining / Pump Blockage' },
      { value: 'EXCESSIVE_VIBRATION', label: 'Excessive Shaking / Bearing Failure' },
      { value: 'WATER_INLET_LEAK', label: 'Water Inlet Valve Leak / Sensor Error' },
      { value: 'PHYSICAL_DAMAGE', label: 'Door Lock Broken / Cabinet Damage (Excluded)', isExcluded: true },
      { value: 'LIQUID_SPILL', label: 'Liquid Short Circuit on Motor (Excluded)', isExcluded: true },
    ];
  }

  // Fallback
  return [
    { value: 'HARDWARE_MALFUNCTION', label: 'Hardware Component Failure' },
    { value: 'ELECTRICAL_FAULT', label: 'Electrical Board / Power Surge' },
    { value: 'PERFORMANCE_DEGRADATION', label: 'Intermittent Performance Malfunction' },
    { value: 'PHYSICAL_DAMAGE', label: 'Physical Damage / Impact Crack (Excluded on standard AMC)', isExcluded: true },
    { value: 'LIQUID_SPILL', label: 'Liquid Spill / Water Ingress (Excluded on AMC/Warranty)', isExcluded: true },
  ];
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({ user: _user, activeSection: _activeSection = 'all' }) => {
  const [units, setUnits] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegModal, setShowRegModal] = useState(false);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [regForm, setRegForm] = useState({
    serial_number: '',
    model_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_proof_url: 'https://storage.coverflow.com/proofs/invoice.pdf'
  });

  const [compForm, setCompForm] = useState({
    fault_category: 'DISPLAY_FLICKER',
    description: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [u, m, c, inv] = await Promise.all([
        api.getUnits(),
        api.getModels(),
        api.getComplaints(),
        api.getInvoices()
      ]);
      setUnits(u);
      setModels(m);
      setComplaints(c);
      setInvoices(inv);
      if (m.length > 0 && !regForm.model_id) {
        setRegForm(prev => ({ ...prev, model_id: m[0].id }));
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegisterUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await api.registerUnit(regForm);
      setSuccessMsg('Product registered successfully!');
      setShowRegModal(false);
      setRegForm({
        serial_number: '',
        model_id: models[0]?.id || '',
        purchase_date: new Date().toISOString().split('T')[0],
        purchase_proof_url: 'https://storage.coverflow.com/proofs/invoice.pdf'
      });
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleRaiseComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await api.submitComplaint({
        unit_id: selectedUnitId,
        fault_category: compForm.fault_category,
        description: compForm.description || 'Device malfunction reported by customer.'
      });
      setSuccessMsg(`Complaint submitted! Adjudication Outcome: ${res.decision.outcome} (${res.decision.reason_code})`);
      setShowComplaintModal(false);
      setCompForm({ fault_category: 'DISPLAY_FLICKER', description: '' });
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleApproveEstimate = async (jobId: string) => {
    try {
      await api.approveEstimate(jobId);
      setSuccessMsg('Estimate approved! Technician can now proceed with repairs.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handlePayInvoice = async (invoiceId: string, amount: number) => {
    try {
      await api.capturePayment(invoiceId, { amount, method: 'CARD' });
      setSuccessMsg('Payment received! Invoice settled and job closed.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const showDevices = true;
  const showComplaints = true;
  const showInvoices = true;

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md flex items-center justify-between text-red-700 text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-md flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 font-bold">&times;</button>
        </div>
      )}

      {/* Hero Action Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Service Portal</h1>
          <p className="text-sm text-slate-500">
            Manage your registered appliances & electronics, view active warranties, and track service requests.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowRegModal(true)}
            className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Register New Device</span>
          </button>
        </div>
      </div>

      {/* Grid: Registered Devices */}
      {showDevices && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
              <Shield className="w-5 h-5 text-sky-600" />
              <span>My Registered Devices ({units.length})</span>
            </h2>
          </div>

          {units.length === 0 && !loading ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
              No devices registered yet. Click &quot;Register New Device&quot; to add your electronics!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {units.map((unit) => (
                <div key={unit.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-5 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                          {unit.model_number}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-1">{unit.model_name}</h3>
                        <p className="text-xs text-slate-500">{unit.manufacturer} • {unit.model_category}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        unit.registration_state === 'REGISTERED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {unit.registration_state}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                      <p><span className="text-slate-400">Serial No:</span> <span className="font-mono font-medium text-slate-800">{unit.serial_number}</span></p>
                      <p><span className="text-slate-400">Purchased:</span> {new Date(unit.purchase_date).toLocaleDateString()}</p>
                    </div>

                    {/* Entitlements / Contracts */}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Active Coverages:</p>
                      {(!unit.entitlements || unit.entitlements.length === 0) ? (
                        <p className="text-xs text-slate-400 italic">No active contracts attached.</p>
                      ) : (
                        unit.entitlements
                          .filter((ent: any, index: number, self: any[]) =>
                            index === self.findIndex((t: any) => t.type === ent.type)
                          )
                          .map((ent: any, idx: number) => (
                            <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800">{ent.type.replace(/_/g, ' ')}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  ent.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                                  ent.status === 'GRACE' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {ent.status}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                                <span>Quota Used: {ent.claims_used} / {ent.claim_quota}</span>
                                <span>Expires: {new Date(ent.end_date).toLocaleDateString()}</span>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                    <button
                      onClick={() => {
                        setSelectedUnitId(unit.id);
                        const faults = getFaultsForUnit(unit);
                        setCompForm({
                          fault_category: faults[0].value,
                          description: ''
                        });
                        setShowComplaintModal(true);
                      }}
                      className="flex items-center space-x-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
                    >
                      <span>Raise Fault Ticket</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section: Complaints & Active Service Jobs */}
      {showComplaints && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center space-x-2">
          <Clock className="w-5 h-5 text-sky-600" />
          <span>My Service Complaints & Repair Tracking</span>
        </h2>

        {complaints.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No service complaints filed yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {complaints.map((comp) => (
              <div key={comp.id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-slate-700">{comp.serial_number}</span>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                      {comp.fault_category}
                    </span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                      comp.outcome === 'COVERED' ? 'bg-emerald-100 text-emerald-800' :
                      comp.outcome === 'PARTIAL' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {comp.outcome}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{comp.description}</p>
                  <p className="text-xs text-slate-400">
                    Reason: <span className="font-mono text-slate-600 font-medium">{comp.reason_code}</span> • Reported: {new Date(comp.reported_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  {comp.job_status === 'DIAGNOSED' && (
                    <button
                      onClick={() => handleApproveEstimate(comp.job_id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded font-medium shadow-sm transition"
                    >
                      Approve Estimate
                    </button>
                  )}
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Service Status</div>
                    <div className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded inline-block mt-0.5">
                      {comp.job_status || 'ADJUDICATED'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Section: Invoices & Receipts */}
      {showInvoices && invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-sky-600" />
            <span>Service Invoices & Settlements</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Invoice ID</th>
                  <th className="px-4 py-2.5 text-left font-medium">Device</th>
                  <th className="px-4 py-2.5 text-left font-medium">Total Cost</th>
                  <th className="px-4 py-2.5 text-left font-medium">Warranty Covered</th>
                  <th className="px-4 py-2.5 text-left font-medium">You Pay</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{inv.id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{inv.product_name}</td>
                    <td className="px-4 py-3 font-mono">${(Number(inv.total_labour_cost) + Number(inv.total_parts_cost)).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-medium">${Number(inv.covered_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">${Number(inv.customer_payable_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        inv.status === 'ZERO_VALUE' ? 'bg-emerald-100 text-emerald-800' :
                        inv.status === 'SETTLED' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.status === 'ISSUED' && Number(inv.customer_payable_amount) > 0 && (
                        <button
                          onClick={() => handlePayInvoice(inv.id, Number(inv.customer_payable_amount))}
                          className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded font-medium text-[11px] shadow-sm transition"
                        >
                          Pay Now
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Register Unit */}
      {showRegModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Register Appliance / Device</h3>
            <form onSubmit={handleRegisterUnit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Serial Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SN-TV-99210"
                  value={regForm.serial_number}
                  onChange={(e) => setRegForm({ ...regForm, serial_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Model</label>
                <select
                  value={regForm.model_id}
                  onChange={(e) => setRegForm({ ...regForm, model_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.model_number})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
                <input
                  type="date"
                  required
                  value={regForm.purchase_date}
                  onChange={(e) => setRegForm({ ...regForm, purchase_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Proof Invoice URL</label>
                <input
                  type="text"
                  value={regForm.purchase_proof_url}
                  onChange={(e) => setRegForm({ ...regForm, purchase_proof_url: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-xs text-slate-600"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Raise Complaint */}
      {showComplaintModal && (() => {
        const selectedUnit = units.find(u => u.id === selectedUnitId);
        const faultOptions = getFaultsForUnit(selectedUnit);

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Raise Service Complaint</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automated Adjudication & SLA Job Dispatch
                  </p>
                </div>
                <button
                  onClick={() => setShowComplaintModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {selectedUnit && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>{selectedUnit.model_name}</span>
                    <span className="font-mono text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {selectedUnit.serial_number}
                    </span>
                  </div>
                  <div className="text-slate-500 mt-1 flex items-center justify-between text-[11px]">
                    <span>Category: {selectedUnit.model_category || 'Appliance'}</span>
                    <span>Mfg: {selectedUnit.manufacturer || 'OEM'}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleRaiseComplaint} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fault Category ({selectedUnit?.model_name ? `${selectedUnit.model_name}` : 'Device-Specific'})
                  </label>
                  <select
                    value={compForm.fault_category}
                    onChange={(e) => setCompForm({ ...compForm, fault_category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-xs font-medium text-slate-800"
                  >
                    {faultOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description of Issue</label>
                  <textarea
                    rows={3}
                    required
                    placeholder={`Describe the specific problem with this ${selectedUnit?.model_name || 'device'}...`}
                    value={compForm.description}
                    onChange={(e) => setCompForm({ ...compForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-xs"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowComplaintModal(false)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    Run Adjudication & Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
