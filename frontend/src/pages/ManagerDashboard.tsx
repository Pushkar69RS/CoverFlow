import React, { useState, useEffect } from 'react';
import { api, UserInfo } from '../api/client';
import { BarChart3, AlertTriangle, Scale, CheckCircle2 } from 'lucide-react';

interface ManagerDashboardProps {
  user?: UserInfo;
  activeSection?: string;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ user, activeSection: _activeSection = 'all' }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [processingEscalationId, setProcessingEscalationId] = useState<string | null>(null);

  // Goodwill Override Modal
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [forcedOutcome, setForcedOutcome] = useState('COVERED');

  const loadData = async () => {
    try {
      const [jList, cList, uList] = await Promise.all([
        api.getJobs(),
        api.getComplaints(),
        api.getUnits()
      ]);
      setJobs(jList);
      setComplaints(cList);
      setUnits(uList);
      if (uList.length > 0 && !selectedUnitId) {
        setSelectedUnitId(uList[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveEscalation = async (complaintId: string) => {
    try {
      setProcessingEscalationId(complaintId);
      setErrorMsg('');
      await api.approveGoodwill(complaintId, {
        reason: 'Goodwill override approved by Service Manager upon Advisor escalation',
        force_outcome: 'COVERED'
      });
      setSuccessMsg('Goodwill escalation approved! Ticket converted in-place to 100% COVERED under warranty exception.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve goodwill');
    } finally {
      setProcessingEscalationId(null);
    }
  };

  const handleRejectEscalation = async (complaintId: string) => {
    try {
      setProcessingEscalationId(complaintId);
      setErrorMsg('');
      await api.rejectGoodwill(complaintId, 'Manager declined goodwill override: outside policy grace envelope');
      setSuccessMsg('Goodwill request rejected. Ticket remains chargeable.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reject goodwill');
    } finally {
      setProcessingEscalationId(null);
    }
  };

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const users = await api.getUsers('MANAGER');
      const managerId = user?.id || users.find(u => u.email === 'manager@coverflow.com')?.id || users[0]?.id;
      if (!managerId) throw new Error('Manager profile not found');

      const targetUnit = units.find(u => u.id === selectedUnitId);
      // Check if this unit already has an active non-covered complaint
      const existingComplaint = complaints.find(c => c.unit_id === selectedUnitId && c.outcome !== 'COVERED');

      if (existingComplaint) {
        await api.approveGoodwill(existingComplaint.id, {
          reason: overrideReason,
          force_outcome: forcedOutcome
        });
        setSuccessMsg(`Goodwill override approved in-place for ${targetUnit?.serial_number || 'Unit'} (${existingComplaint.customer_name})! Converted to ${forcedOutcome}.`);
      } else {
        const res = await api.submitComplaint({
          unit_id: selectedUnitId,
          customer_id: targetUnit?.owner_id,
          fault_category: 'GOODWILL_SERVICE_REQUEST',
          description: `Service Manager Goodwill Override: ${overrideReason}`,
          override: {
            actor_id: managerId,
            reason: overrideReason,
            force_outcome: forcedOutcome
          }
        });
        setSuccessMsg(`Goodwill override recorded for ${targetUnit?.owner_name || 'Customer'}! Job created with outcome ${res.decision.outcome} (${res.decision.reason_code}).`);
      }

      setShowOverrideModal(false);
      setOverrideReason('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const pendingEscalations = complaints.filter(c => c.escalation_status === 'PENDING_GOODWILL');
  const breachedJobs = jobs.filter(j => j.is_currently_breached);
  const coveredCount = complaints.filter(c => c.outcome === 'COVERED').length;
  const partialCount = complaints.filter(c => c.outcome === 'PARTIAL').length;
  const chargeableCount = complaints.filter(c => c.outcome === 'CHARGEABLE').length;

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
            <BarChart3 className="w-6 h-6 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900">Service Manager Operations & Escalations</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Supervise SLA compliance, monitor contract renewals, and exercise audited Goodwill Coverage Overrides.
          </p>
        </div>

        <button
          onClick={() => setShowOverrideModal(true)}
          className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg text-xs font-bold shadow-sm transition"
        >
          <Scale className="w-4 h-4" />
          <span>Record Goodwill Override</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Active Service Jobs</div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">
            {jobs.filter(j => j.status !== 'CLOSED').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Across 3 regional branches</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">SLA Breaches</div>
          <div className={`text-3xl font-extrabold mt-2 font-mono ${breachedJobs.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {breachedJobs.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {breachedJobs.length === 0 ? 'All jobs within SLA target' : 'Action required'}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Warranty Covered Work</div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-2 font-mono">
            {coveredCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">100% free under warranty/AMC</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Chargeable Invoices</div>
          <div className="text-3xl font-extrabold text-amber-600 mt-2 font-mono">
            {chargeableCount + partialCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">Customer payable estimates</div>
        </div>
      </div>

      {/* Pending Goodwill Escalations Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Scale className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900">
              Advisor Goodwill Escalations Pending Review
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              pendingEscalations.length > 0 ? 'bg-purple-100 text-purple-800 animate-pulse' : 'bg-slate-100 text-slate-600'
            }`}>
              {pendingEscalations.length} Pending
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">Advisors flag customer warranty exceptions for manager discretion</span>
        </div>

        {pendingEscalations.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-lg text-center text-slate-500 text-xs border border-dashed border-slate-200">
            ✨ No pending goodwill escalation requests. All advisor counter tickets are processed.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingEscalations.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-purple-200 bg-purple-50/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 text-sm">{item.serial_number}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs font-semibold text-slate-700">{item.model_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                      Current: {item.outcome} ({item.reason_code})
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Customer: <span className="font-bold text-slate-800">{item.customer_name}</span> {item.customer_phone ? `(${item.customer_phone})` : ''} • Fault: <span className="font-medium text-slate-800">{item.fault_category}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-purple-100 text-xs text-slate-700">
                    <span className="font-bold text-purple-900 block mb-0.5">Advisor Escalation Justification:</span>
                    <span>{item.escalation_notes || item.description}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5 self-end md:self-center shrink-0">
                  <button
                    onClick={() => handleRejectEscalation(item.id)}
                    disabled={processingEscalationId === item.id}
                    className="px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApproveEscalation(item.id)}
                    disabled={processingEscalationId === item.id}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Goodwill (100% Covered)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SLA Breach Escalation Queue */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span>SLA Breach Escalation Monitor ({breachedJobs.length})</span>
        </h2>

        {breachedJobs.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-lg text-center text-slate-500 text-xs">
            🎉 Zero SLA breaches! All technician repairs are progressing within contract deadlines.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-red-50 text-red-800 uppercase font-medium">
                <tr>
                  <th className="px-4 py-2.5 text-left">Job ID</th>
                  <th className="px-4 py-2.5 text-left">Serial No</th>
                  <th className="px-4 py-2.5 text-left">Fault Category</th>
                  <th className="px-4 py-2.5 text-left">Assigned Tech</th>
                  <th className="px-4 py-2.5 text-left">Committed SLA</th>
                  <th className="px-4 py-2.5 text-left">Due Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {breachedJobs.map((j) => (
                  <tr key={j.id} className="bg-red-50/20">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{j.id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 font-mono">{j.serial_number}</td>
                    <td className="px-4 py-3">{j.fault_category}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{j.technician_name || 'Unassigned'}</td>
                    <td className="px-4 py-3 font-mono">{j.sla_class}</td>
                    <td className="px-4 py-3 font-mono text-red-600 font-bold">{new Date(j.due_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Goodwill Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center space-x-2 mb-2 text-purple-700">
              <Scale className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900">Manager Goodwill Override</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Allows the Service Manager to grant coverage outside strict contract terms. Stamped with an immutable audit reason (FR-06).
            </p>

            <form onSubmit={handleApplyOverride} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Customer Unit</label>
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.serial_number} — {u.model_name} ({u.owner_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Forced Outcome</label>
                <select
                  value={forcedOutcome}
                  onChange={(e) => setForcedOutcome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="COVERED">COVERED (100% Free of Charge)</option>
                  <option value="PARTIAL">PARTIAL (Labour Free, Parts Chargeable)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mandatory Business Justification</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. VIP commercial account; repeat issue within 14 days of prior service..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                >
                  Confirm & Stamp Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
