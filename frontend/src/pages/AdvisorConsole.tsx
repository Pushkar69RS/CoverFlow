import React, { useState, useEffect } from 'react';
import { api, UserInfo } from '../api/client';
import { getFaultsForUnit } from './CustomerPortal';
import { ShieldCheck, Search, CheckCircle2, AlertTriangle, Layers, Clock, PlusCircle, Printer, Send, Check } from 'lucide-react';

interface AdvisorConsoleProps {
  user?: UserInfo;
  activeSection?: string;
}

export const AdvisorConsole: React.FC<AdvisorConsoleProps> = ({ user: _user, activeSection: _activeSection = 'all' }) => {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Walk-In Intake Modal State
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [selectedWalkInUnitId, setSelectedWalkInUnitId] = useState('');
  const [walkInFault, setWalkInFault] = useState('');
  const [walkInDescription, setWalkInDescription] = useState('');

  // Print Custody Slip Modal State
  const [showSlipModal, setShowSlipModal] = useState(false);

  // Goodwill Escalation Modal State
  const [showGoodwillModal, setShowGoodwillModal] = useState(false);
  const [goodwillNotes, setGoodwillNotes] = useState('');
  const [isSubmittingGoodwill, setIsSubmittingGoodwill] = useState(false);

  // Escalation & Dispatch state
  const [dispatchedTickets, setDispatchedTickets] = useState<{ [id: string]: boolean }>({});

  const loadData = async () => {
    try {
      const [c, t, u] = await Promise.all([
        api.getComplaints(),
        api.getTerms(),
        api.getUnits()
      ]);
      setComplaints(c);
      setTerms(t);
      setUnits(u);
      if (c.length > 0) {
        if (!selectedComplaint) {
          setSelectedComplaint(c[0]);
        } else {
          const fresh = c.find((item: any) => item.id === selectedComplaint.id);
          if (fresh) setSelectedComplaint(fresh);
        }
      }
      if (u.length > 0 && !selectedWalkInUnitId) {
        setSelectedWalkInUnitId(u[0].id);
        const faults = getFaultsForUnit(u[0]);
        setWalkInFault(faults[0].value);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load advisor data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUnitSelectForWalkIn = (unitId: string) => {
    setSelectedWalkInUnitId(unitId);
    const unit = units.find(u => u.id === unitId);
    const faults = getFaultsForUnit(unit);
    setWalkInFault(faults[0].value);
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWalkInUnitId) return;
    setErrorMsg('');
    try {
      const res = await api.submitComplaint({
        unit_id: selectedWalkInUnitId,
        fault_category: walkInFault,
        description: walkInDescription || 'Walk-in customer reported device failure at front service desk.'
      });
      setSuccessMsg(`Walk-in ticket created! Outcome: ${res.decision.outcome} (${res.decision.reason_code})`);
      setShowWalkInModal(false);
      setWalkInDescription('');
      await loadData();
      // Select the new complaint
      setSelectedComplaint(res.complaint);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit walk-in ticket');
    }
  };

  const handleDispatchToWorkshop = (ticketId: string) => {
    setDispatchedTickets(prev => ({ ...prev, [ticketId]: true }));
    setSuccessMsg(`Ticket verified by Advisor! Dispatched to Workshop Queue with Breach-First SLA priority.`);
  };

  const handleOpenGoodwillModal = () => {
    if (!selectedComplaint) return;
    setGoodwillNotes(
      `Customer ${selectedComplaint.customer_name || 'Rohan Sharma'} has high lifetime value. Quota is exhausted. Requesting one-time courtesy goodwill override to convert repair to 100% COVERED under warranty exception.`
    );
    setShowGoodwillModal(true);
  };

  const handleSubmitGoodwill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    setIsSubmittingGoodwill(true);
    setErrorMsg('');
    try {
      await api.requestGoodwill(selectedComplaint.id, goodwillNotes);
      setSuccessMsg(`Ticket #${selectedComplaint.id.slice(0, 8)} escalated to Service Manager for Goodwill Override Review.`);
      setShowGoodwillModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit goodwill request');
    } finally {
      setIsSubmittingGoodwill(false);
    }
  };

  const filtered = complaints.filter(c =>
    (c.serial_number && c.serial_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.customer_name && c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.fault_category && c.fault_category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedWalkInUnit = units.find(u => u.id === selectedWalkInUnitId);
  const walkInFaultOptions = getFaultsForUnit(selectedWalkInUnit);

  return (
    <div className="space-y-6">
      {/* Alert Messages */}
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
              <ShieldCheck className="w-7 h-7 text-sky-600" />
              <span>Service Advisor Adjudication Console</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Front-Desk Customer Intake, Deterministic Precedence Verification, and Workshop Dispatch.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search serial, customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <button
              onClick={() => setShowWalkInModal(true)}
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Walk-In Intake</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Intake Queue on Left, Decision Audit Breakdown on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List: Complaints / Jobs (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-[680px]">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 px-2 flex items-center justify-between">
            <span>Intake Tickets ({filtered.length})</span>
            <span className="text-xs font-normal text-slate-400">Click to inspect</span>
          </h2>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filtered.map((item) => {
              const isSelected = selectedComplaint?.id === item.id;
              const isEscalated = item.escalation_status === 'PENDING_GOODWILL';
              const isApproved = item.escalation_status === 'GOODWILL_APPROVED' || item.reason_code === 'GOODWILL_OVERRIDE_RECORDED';
              const isRejected = item.escalation_status === 'GOODWILL_REJECTED';
              const isDispatched = dispatchedTickets[item.id];

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedComplaint(item)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition text-xs ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">{item.serial_number}</span>
                    <div className="flex items-center space-x-1.5">
                      {isEscalated && (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[9px] bg-purple-100 text-purple-800 animate-pulse">
                          Pending Mgr Review
                        </span>
                      )}
                      {isApproved && (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[9px] bg-emerald-100 text-emerald-800">
                          Goodwill Approved
                        </span>
                      )}
                      {isRejected && (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[9px] bg-rose-100 text-rose-800">
                          Goodwill Rejected
                        </span>
                      )}
                      {isDispatched && (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[9px] bg-sky-100 text-sky-800">
                          Dispatched
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        item.outcome === 'COVERED' ? 'bg-emerald-100 text-emerald-800' :
                        item.outcome === 'PARTIAL' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.outcome}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">{item.customer_name || 'Walk-in Customer'}</div>
                  <div className="text-slate-500 truncate mt-0.5">{item.description}</div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-medium text-slate-700">{item.fault_category}</span>
                    <span className="font-mono text-slate-600">{item.reason_code}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Detail: Full Adjudication Breakdown (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          {selectedComplaint ? (
            <div className="space-y-5 flex-1 flex flex-col justify-between">
              <div>
                {/* Header Info */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500">Audit ID: {selectedComplaint.id.slice(0, 16)}</span>
                    <div className="flex items-center space-x-2">
                      {selectedComplaint.escalation_status === 'PENDING_GOODWILL' && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 animate-pulse">
                          Pending Manager Review
                        </span>
                      )}
                      {(selectedComplaint.escalation_status === 'GOODWILL_APPROVED' || selectedComplaint.reason_code === 'GOODWILL_OVERRIDE_RECORDED') && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          Goodwill Approved
                        </span>
                      )}
                      {selectedComplaint.escalation_status === 'GOODWILL_REJECTED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                          Goodwill Rejected
                        </span>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        selectedComplaint.outcome === 'COVERED' ? 'bg-emerald-100 text-emerald-800' :
                        selectedComplaint.outcome === 'PARTIAL' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {selectedComplaint.outcome}
                      </span>
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-2">
                    Unit: {selectedComplaint.serial_number}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Customer: <span className="font-semibold text-slate-700">{selectedComplaint.customer_name}</span> • Fault: <span className="font-semibold text-slate-700">{selectedComplaint.fault_category}</span>
                  </p>
                </div>

                {/* Bound Entitlement Decision Box */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Bound Adjudication Decision</span>
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Determined Reason Code:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">{selectedComplaint.reason_code}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Current Job Status:</span>
                      <span className="font-semibold text-slate-800 text-xs bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                        {dispatchedTickets[selectedComplaint.id] ? 'DISPATCHED_TO_WORKSHOP' : (selectedComplaint.job_status || 'QUEUED')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">SLA Response Commitment:</span>
                      <span className="font-semibold text-slate-800 flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-sky-600" />
                        <span>{selectedComplaint.due_at ? `Due by ${new Date(selectedComplaint.due_at).toLocaleTimeString()}` : 'Standard SLA Priority'}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Customer Liability:</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {selectedComplaint.outcome === 'COVERED' ? '100% Free under Active Warranty' :
                         selectedComplaint.outcome === 'PARTIAL' ? 'Labour Free, Parts Chargeable' : 'Full Customer Estimate Required'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Published Precedence Ladder Applied */}
                <div className="mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-sky-600" />
                    <span>Precedence Ladder Evaluation</span>
                  </h3>
                  <div className="space-y-1 text-xs">
                    {terms.map((t) => (
                      <div
                        key={t.id}
                        className={`p-2 rounded-lg border flex items-center justify-between ${
                          selectedComplaint.reason_code?.includes(t.entitlement_type)
                            ? 'bg-sky-50 border-sky-300 font-semibold text-sky-950'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                            {t.precedence_rank}
                          </span>
                          <span>{t.entitlement_type.replace(/_/g, ' ')} ({t.version_code})</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t.sla_hours}h SLA • {t.parts_covered ? 'Parts + Labour' : 'Labour Only'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Issue Description */}
                <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80 text-xs text-amber-900 mt-4">
                  <span className="font-bold flex items-center space-x-1 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Customer Reported Symptoms:</span>
                  </span>
                  <p>{selectedComplaint.description}</p>
                </div>
              </div>

              {/* Service Advisor Operational Action Bar */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => setShowSlipModal(true)}
                  className="flex items-center space-x-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Customer Intake Slip</span>
                </button>

                <div className="flex items-center space-x-2">
                  {selectedComplaint.outcome !== 'COVERED' && (
                    <>
                      {selectedComplaint.escalation_status === 'PENDING_GOODWILL' ? (
                        <div className="flex items-center space-x-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold">
                          <Clock className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                          <span>Pending Manager Review</span>
                        </div>
                      ) : (
                        <button
                          onClick={handleOpenGoodwillModal}
                          className="flex items-center space-x-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold transition shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Request Goodwill Override</span>
                        </button>
                      )}
                    </>
                  )}

                  {(selectedComplaint.escalation_status === 'GOODWILL_APPROVED' || selectedComplaint.reason_code === 'GOODWILL_OVERRIDE_RECORDED') && (
                    <div className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Goodwill Approved by Manager</span>
                    </div>
                  )}

                  <button
                    onClick={() => handleDispatchToWorkshop(selectedComplaint.id)}
                    disabled={dispatchedTickets[selectedComplaint.id]}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:bg-emerald-600"
                  >
                    {dispatchedTickets[selectedComplaint.id] ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Dispatched to Workshop</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify & Dispatch</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Select an intake ticket from the list to view its deterministic coverage breakdown.
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Walk-In Intake Ticket */}
      {showWalkInModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <PlusCircle className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-base">New Counter Walk-In Intake</h3>
              </div>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Customer Appliance / Device</label>
                <select
                  value={selectedWalkInUnitId}
                  onChange={(e) => handleUnitSelectForWalkIn(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.serial_number} — {u.model_name} ({u.owner_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reported Fault ({selectedWalkInUnit?.model_name || 'Appliance'}-Specific)
                </label>
                <select
                  value={walkInFault}
                  onChange={(e) => setWalkInFault(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500"
                >
                  {walkInFaultOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Counter Diagnostic Symptoms / Intake Notes</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record customer observations, initial visual inspection, or power behavior..."
                  value={walkInDescription}
                  onChange={(e) => setWalkInDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Run Adjudication & Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Customer Intake Custody Receipt Slip */}
      {showSlipModal && selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-slate-800" />
                <span className="font-bold text-slate-900 text-sm">Customer Service Intake Slip</span>
              </div>
              <button onClick={() => setShowSlipModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
            </div>

            <div className="mt-4 p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 space-y-3 font-mono">
              <div className="text-center pb-2 border-b border-slate-200">
                <div className="font-extrabold text-sm text-slate-900">COVERFLOW SERVICE DEPOT</div>
                <div className="text-[10px] text-slate-500">Official Warranty Intake Receipt</div>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Ticket ID:</span>
                <span className="font-bold text-slate-900">#CF-{selectedComplaint.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="text-slate-800">{selectedComplaint.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Device Serial:</span>
                <span className="font-bold text-slate-900">{selectedComplaint.serial_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reported Fault:</span>
                <span className="text-slate-800">{selectedComplaint.fault_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Coverage Status:</span>
                <span className={`font-bold ${
                  selectedComplaint.outcome === 'COVERED' ? 'text-emerald-700' :
                  selectedComplaint.outcome === 'PARTIAL' ? 'text-blue-700' : 'text-amber-700'
                }`}>
                  {selectedComplaint.outcome} ({selectedComplaint.reason_code})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">SLA Commitment:</span>
                <span className="font-bold text-slate-900">
                  {selectedComplaint.due_at ? new Date(selectedComplaint.due_at).toLocaleTimeString() : 'Guaranteed 24-Hour Workshop Handover'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowSlipModal(false)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold flex items-center space-x-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Request Manager Goodwill Override */}
      {showGoodwillModal && selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-purple-700">
                <Send className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 text-base">Request Manager Goodwill Override</h3>
              </div>
              <button
                onClick={() => setShowGoodwillModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{selectedComplaint.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unit Serial:</span>
                <span className="font-mono font-bold text-slate-800">{selectedComplaint.serial_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Adjudication:</span>
                <span className="font-bold text-amber-700">{selectedComplaint.outcome} ({selectedComplaint.reason_code})</span>
              </div>
            </div>

            <form onSubmit={handleSubmitGoodwill} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Advisor Business Justification / Escalation Notes
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide commercial justification (e.g. VIP account, repeat customer, quota recently expired)..."
                  value={goodwillNotes}
                  onChange={(e) => setGoodwillNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowGoodwillModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGoodwill}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow-sm transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingGoodwill ? 'Submitting...' : 'Escalate to Manager'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
