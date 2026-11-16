import React, { useState, useEffect } from 'react';
import { api, UserInfo } from '../api/client';
import { Wrench, PlayCircle, CheckCircle, AlertOctagon, PackagePlus, Clock, ShieldAlert } from 'lucide-react';

interface TechnicianWorkbenchProps {
  user?: UserInfo;
  activeSection?: string;
}

export const TechnicianWorkbench: React.FC<TechnicianWorkbenchProps> = ({ user, activeSection: _activeSection = 'all' }) => {
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Diagnosis inputs
  const [faultCode, setFaultCode] = useState('ERR-DISP-01');
  const [diagNotes, setDiagNotes] = useState('');

  // Part reservation inputs
  const [selectedPartId, setSelectedPartId] = useState('');
  const [reserveQty, setReserveQty] = useState(1);

  // Labour completion
  const [labourHours, setLabourHours] = useState(2);

  const targetEmail = user?.email || 'tech1@coverflow.com';

  const loadData = async () => {
    try {
      const [jobs, pList, users] = await Promise.all([
        api.getJobs(),
        api.getParts(),
        api.getUsers('TECHNICIAN')
      ]);
      setAllJobs(jobs);
      setParts(pList);
      if (pList.length > 0 && !selectedPartId) {
        setSelectedPartId(pList[0].id);
      }

      // Check if current technician already has an assigned job
      const currentTech = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase()) || users[0];
      if (currentTech) {
        const myActive = jobs.find(j => j.technician_id === currentTech.id && ['ASSIGNED', 'DIAGNOSED', 'IN_REPAIR', 'AWAITING_PARTS'].includes(j.status));
        if (myActive) {
          setActiveJob(myActive);
          const res = await api.getJobReservations(myActive.id);
          setReservations(res);
        } else {
          setActiveJob(null);
          setReservations([]);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Action 1: Pull Next Job (Breach-First Queue)
  const handlePullNextJob = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const users = await api.getUsers('TECHNICIAN');
      const currentTech = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase()) || users[0];
      if (!currentTech) throw new Error('Technician profile not found');

      const res = await api.pullNextJob(currentTech.id);
      if (!res.job) {
        setSuccessMsg('No queued jobs available at this time. All caught up!');
      } else {
        setSuccessMsg(`Pulled Job ${res.job.id.slice(0, 8)} successfully under Breach-First ordering!`);
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Action 2: Save Diagnosis
  const handleSaveDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setErrorMsg('');
    try {
      await api.recordDiagnosis(activeJob.id, {
        fault_code: faultCode,
        diagnosis_notes: diagNotes || 'Diagnostic checks confirmed component failure.'
      });
      setSuccessMsg('Diagnosis notes saved!');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Action 3: Reserve Part (Transactional Stock Guard Invariant 2)
  const handleReservePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setErrorMsg('');
    try {
      await api.reservePart(activeJob.id, {
        part_id: selectedPartId,
        quantity: Number(reserveQty)
      });
      setSuccessMsg('Spare part successfully reserved under transactional stock guard!');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Action 4: Complete Job
  const handleCompleteJob = async () => {
    if (!activeJob) return;
    setErrorMsg('');
    try {
      const res = await api.completeJob(activeJob.id, { labour_hours: labourHours });
      setSuccessMsg(`Repair completed! Generated ${res.invoice?.status || 'settled'} invoice #${res.invoice?.id?.slice(0, 8) || 'CLOSED'}.`);
      setActiveJob(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const showQueue = true;
  const showWorkbench = true;

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md flex items-center justify-between text-red-700 text-sm">
          <div className="flex items-center space-x-2">
            <AlertOctagon className="w-5 h-5 flex-shrink-0" />
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

      {/* Top Bar: Technician Status & Pull Action */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Wrench className="w-6 h-6 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900">Technician Workbench</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Logged in as <span className="font-semibold text-slate-700">{user?.full_name || 'Arjun Verma'}</span> ({user?.email || 'tech1@coverflow.com'}). Active assignment guard enforced.
          </p>
        </div>

        <div>
          <button
            onClick={handlePullNextJob}
            disabled={activeJob !== null}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition ${
              activeJob !== null
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>Pull Next Job (Breach-First)</span>
          </button>
        </div>
      </div>

      {/* Active Assignment Section */}
      {showWorkbench && (activeJob ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Job Details (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                  {activeJob.product_name}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  Serial No: {activeJob.serial_number}
                </h2>
                <p className="text-xs text-slate-500">
                  Customer: {activeJob.customer_name} • Phone: {activeJob.customer_phone}
                </p>
              </div>

              <div className="text-right">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                  activeJob.is_currently_breached ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-800'
                }`}>
                  {activeJob.is_currently_breached ? '🚨 SLA Breached' : activeJob.status}
                </span>
                <div className="text-xs text-slate-400 mt-1 flex items-center justify-end space-x-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Due: {new Date(activeJob.due_at).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            {/* Coverage Adjudication Banner */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-1">Coverage Status:</span>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">{activeJob.outcome} ({activeJob.reason_code})</span>
                <span className="text-slate-500 font-mono text-[11px]">{activeJob.sla_class}</span>
              </div>
              <p className="text-slate-600 mt-1">{activeJob.fault_description}</p>
            </div>

            {/* Diagnosis Form */}
            <form onSubmit={handleSaveDiagnosis} className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-slate-900">Diagnosis & Technical Notes</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fault Code</label>
                  <input
                    type="text"
                    required
                    value={faultCode}
                    onChange={(e) => setFaultCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Labour Hours</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={labourHours}
                    onChange={(e) => setLabourHours(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Diagnostic Findings</label>
                <textarea
                  rows={2}
                  placeholder="Record testing findings, voltage checks, or replacement needs..."
                  value={diagNotes}
                  onChange={(e) => setDiagNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition"
                >
                  Update Diagnosis
                </button>
              </div>
            </form>

            {/* Complete Job Action */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Ready to return device? Issues parts & triggers billing settlement.
              </span>
              <button
                type="button"
                onClick={handleCompleteJob}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
              >
                Complete Repair & Handover
              </button>
            </div>
          </div>

          {/* Right: Spare Parts Reservation Guard (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <PackagePlus className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Spare Parts Reservation</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Transactional guard ensures reserved quantity never exceeds stock on hand.
              </p>

              <form onSubmit={handleReservePart} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Select Spare Part</label>
                  <select
                    value={selectedPartId}
                    onChange={(e) => setSelectedPartId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.part_code}) — {p.available_quantity} available
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quantity Needed</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={reserveQty}
                    onChange={(e) => setReserveQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Reserve Spare Part
                </button>
              </form>

              {/* Reserved parts list */}
              <div className="mt-6">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Reserved for this Job ({reservations.length})
                </h4>
                {reservations.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No parts reserved yet.</p>
                ) : (
                  <div className="space-y-2">
                    {reservations.map((r) => (
                      <div key={r.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-900">{r.part_name}</span>
                          <span className="text-[11px] text-slate-500 block font-mono">{r.part_code} (Qty: {r.quantity})</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-sky-600 flex-shrink-0" />
              <span>Concurrent reservations for the last item safely reject second requests via PostgreSQL row locking.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Wrench className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Job Currently Assigned</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You are currently free. Click &quot;Pull Next Job&quot; above to claim the highest priority ticket ordered by earliest SLA due date.
          </p>
        </div>
      ))}

      {/* Global Queue Preview */}
      {showQueue && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center space-x-2">
            <span>Workshop Dispatch Queue ({allJobs.filter(j => j.status === 'QUEUED').length} Pending)</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Job ID</th>
                  <th className="px-4 py-2.5 text-left font-medium">Serial No</th>
                  <th className="px-4 py-2.5 text-left font-medium">Fault</th>
                  <th className="px-4 py-2.5 text-left font-medium">Coverage</th>
                  <th className="px-4 py-2.5 text-left font-medium">SLA Due</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allJobs.map((j) => (
                  <tr key={j.id} className={j.technician_id === activeJob?.technician_id ? 'bg-sky-50/50 font-semibold' : ''}>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{j.id.slice(0, 8)}...</td>
                    <td className="px-4 py-2.5 font-mono text-slate-900">{j.serial_number}</td>
                    <td className="px-4 py-2.5">{j.fault_category}</td>
                    <td className="px-4 py-2.5 font-bold text-[11px]">
                      <span className={j.outcome === 'COVERED' ? 'text-emerald-700' : 'text-amber-700'}>{j.outcome}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono">{new Date(j.due_at).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
