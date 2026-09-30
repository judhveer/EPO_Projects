import React, { useState, useEffect, useCallback, memo } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import { getCurrentLocation, LOCATION_ERROR_MESSAGES } from '../../utils/attendance/getCurrentLocation';

const ZONE = 'Asia/Kolkata';

function formatTime(iso) {
  if (!iso) return '--:--';
  return DateTime.fromJSDate(new Date(iso)).setZone(ZONE).toFormat('hh:mm a');
}

function formatMinutes(mins) {
  if (mins === null || mins === undefined || mins === 0) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Isolated live timer ──────────────────────────────────────────────
// Ticks every second on its own — only THIS component re-renders,
// never the parent page. Matches the exact pattern already established
// for JobFMS's designer timer (see JobTimer in DesignerTable.jsx) rather
// than repeating the "whole page re-renders every second" mistake that
// was found and fixed there earlier.
const LiveElapsed = memo(function LiveElapsed({ checkInTime }) {
  const [now, setNow] = useState(() => DateTime.now().setZone(ZONE));

  useEffect(() => {
    const id = setInterval(() => setNow(DateTime.now().setZone(ZONE)), 1000);
    return () => clearInterval(id);
  }, []);

  const checkIn = DateTime.fromJSDate(new Date(checkInTime)).setZone(ZONE);
  const totalSec = Math.max(0, Math.floor(now.diff(checkIn).toMillis() / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');

  return <span className="font-mono text-3xl text-gray-800">{h}:{m}:{s}</span>;
});

export default function MyAttendance({ compact = false }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStage, setActionStage] = useState(null); // 'locating' | 'saving' | null
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState(null);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/attendance/me/today');
      setStatus(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load your attendance status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // Extend fetchToday (rename conceptually, or add a second effect) — simplest: add this alongside the existing fetchToday call:
  useEffect(() => {
    api.get('/api/attendance/me/summary').then(({ data }) => setSummary(data)).catch(() => {});
  }, []);


   // Shared by check-in and check-out: get a FRESH location first
  // (mandatory), and only then call the server.
  const submitWithLocation = async (endpoint, failMessage) => {
    setActionLoading(true);
    setError('');
    setMessage('');
    try {
      setActionStage('locating');
      let location;
      try {
        location = await getCurrentLocation();
      } catch (locErr) {
        setError(LOCATION_ERROR_MESSAGES[locErr.kind] || LOCATION_ERROR_MESSAGES.UNKNOWN);
        return; // nothing is sent to the server without a location
      }

      setActionStage('saving');
      const { data } = await api.post(endpoint, location);
      setMessage(data.message);
      await fetchToday();
    } catch (err) {
      const apiMessage = err.response?.data?.error || failMessage;
      // The screen was out of date (an overnight shift is open): refresh
      // FIRST so the right button shows. fetchToday clears the error, so
      // the message is set after it.
      if (['OVERNIGHT_SHIFT_OPEN', 'PREVIOUS_SHIFT_UNCLOSED'].includes(err.response?.data?.code)) await fetchToday();
      setError(apiMessage);
    } finally {
      setActionLoading(false);
      setActionStage(null);
    }
  };

  const handleCheckIn = () => submitWithLocation('/api/attendance/check-in', 'Failed to check in.');
  const handleCheckOut = () => submitWithLocation('/api/attendance/check-out', 'Failed to check out.');


  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }

  // Backend rejects cleanly (400, clear message) when the account isn't
  // trackable yet — BOSS shouldn't reach this page at all via the routing
  // above, but a non-BOSS account with no office assigned (admin hasn't
  // finished onboarding them) genuinely can. Surface that plainly rather
  // than showing a broken check-in button that would just fail.
  if (error && !status) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-md p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  const record = status?.attendance;
  const blockedBy = status?.blockedBy;
  const hasCheckedIn = !!record?.check_in_time;
  const hasCheckedOut = !!record?.check_out_time;
  const todayLabel = DateTime.now().setZone(ZONE).toFormat('EEEE, dd LLLL yyyy');

  return (
    <div className={compact ? "max-w-xl mx-auto mt-4 px-4" : "max-w-xl mx-auto mt-8 px-4"}>
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        {!compact && (
          <>
            <p className="text-sm text-gray-500">{todayLabel}</p>
            <h1 className="text-xl font-bold text-gray-800 mt-1">
              {user?.username}
              <span className="ml-2 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium align-middle">
                {user?.office}
              </span>
            </h1>
          </>
        )}

        {summary && (
          <div className="grid grid-cols-3 gap-3 mt-5 mb-2">
            <Link to="/leave" className="bg-blue-50 hover:bg-blue-100 rounded-lg p-3 text-center transition">
              <p className="text-xl font-bold text-blue-700">{summary.presentDays}</p>
              <p className="text-[11px] text-blue-600 mt-0.5">Present Days ({summary.year})</p>
            </Link>
            <Link to="/leave" className="bg-purple-50 hover:bg-purple-100 rounded-lg p-3 text-center transition">
              <p className="text-xl font-bold text-purple-700">{summary.leaveDaysTaken}</p>
              <p className="text-[11px] text-purple-600 mt-0.5">Leave Taken ({summary.year})</p>
            </Link>
            <Link to="/leave" className="bg-yellow-50 hover:bg-yellow-100 rounded-lg p-3 text-center transition">
              <p className="text-xl font-bold text-yellow-700">{summary.pendingLeaveRequests}</p>
              <p className="text-[11px] text-yellow-600 mt-0.5">Pending Requests</p>
            </Link>
          </div>
        )}

        {message && (
          <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* ── Earlier shift never closed: Check In is hidden ─────────── */}
        {!hasCheckedIn && blockedBy && (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-left">
            <p className="text-base font-bold text-amber-800">
              ⏳ Your shift from {DateTime.fromISO(blockedBy.shift_date, { zone: ZONE }).toFormat('dd LLL')} was not checked out.
            </p>
            <p className="mt-2 text-sm text-amber-700">It will be closed automatically soon. Please check again in a few minutes.</p>
            <p className="mt-1 text-sm text-amber-700">If this message does not go away, please tell HR.</p>
            <button
              onClick={fetchToday}
              className="mt-4 px-6 py-3 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-semibold active:scale-95 transition"
            >
              🔄 Check again
            </button>
          </div>
        )}

        {/* ── Not checked in yet ─────────────────────────────────────── */}
        {!hasCheckedIn && !blockedBy && (
          <div className="mt-8">
            <p className="text-gray-500 mb-4">You haven't checked in today.</p>
            <button
              onClick={handleCheckIn}
              disabled={actionLoading}
              className="px-8 py-4 rounded-full bg-green-600 hover:bg-green-700 text-white text-lg font-semibold shadow-lg disabled:opacity-50 transition active:scale-95"
            >
              {actionStage === 'locating' ? '📍 Getting location…' : actionStage === 'saving' ? 'Checking in…' : '✅ Check In'}
            </button>
            <p className="mt-3 text-[11px] text-gray-400">📍 Your location is recorded when you check in / out.</p>
          </div>
        )}

        {/* ── Checked in, still working ─────────────────────────────── */}
        {hasCheckedIn && !hasCheckedOut && (
          <div className="mt-6">
            <p className="text-sm text-gray-500">
              Checked in at <span className="font-semibold text-gray-700">{formatTime(record.check_in_time)}</span>
              {record.status === 'LATE' && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                  Late by {formatMinutes(record.late_minutes)}
                </span>
              )}
            </p>

            {status?.overnight && (
              <p className="mt-1 text-xs text-indigo-600">
                Your shift started yesterday, {DateTime.fromISO(record.shift_date, { zone: ZONE }).toFormat('dd LLL')}.
              </p>
            )}
            {record.check_in_location_label && (
              <p className="mt-1 text-xs text-gray-500">📍 {record.check_in_location_label}</p>
            )}

            <div className="mt-4 mb-6">
              <p className="text-xs text-gray-400 mb-1">Time elapsed</p>
              <LiveElapsed checkInTime={record.check_in_time} />
            </div>

            <button
              onClick={handleCheckOut}
              disabled={actionLoading}
              className="px-8 py-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-lg font-semibold shadow-lg disabled:opacity-50 transition active:scale-95"
            >
              {actionStage === 'locating' ? '📍 Getting location…' : actionStage === 'saving' ? 'Checking out…' : '🚪 Check Out'}
            </button>
            <p className="mt-3 text-[11px] text-gray-400">📍 Your location is recorded when you check in / out.</p>
          </div>
        )}

        {/* ── Day complete ───────────────────────────────────────────── */}
        {hasCheckedIn && hasCheckedOut && (
          <div className="mt-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-800 font-medium">
              ✔ Day complete
            </div>

            {record.shift_date !== DateTime.now().setZone(ZONE).toISODate() && (
              <p className="mt-1 text-xs text-gray-400">
                Shift of {DateTime.fromISO(record.shift_date, { zone: ZONE }).toFormat('dd LLL')} · You can check in again from 6:00 AM.
              </p>
            )}

            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-1">Total Shift Time</p>
              <span className="font-mono text-3xl text-gray-800">
                {formatMinutes(
                  Math.max(0, Math.round((new Date(record.check_out_time) - new Date(record.check_in_time)) / 60000))
                )}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Check-in</p>
                <p className="font-semibold text-gray-700">{formatTime(record.check_in_time)}</p>
                {record.check_in_location_label && <p className="text-[11px] text-gray-400 mt-1">📍 {record.check_in_location_label}</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Check-out</p>
                <p className="font-semibold text-gray-700">{formatTime(record.check_out_time)}</p>
                {record.check_out_location_label && <p className="text-[11px] text-gray-400 mt-1">📍 {record.check_out_location_label}</p>}
              </div>
            </div>
            {record.status === 'LATE' && (
              <p className="mt-3 text-xs text-yellow-700">Late by {formatMinutes(record.late_minutes)}</p>
            )}
            {record.overtime_minutes > 0 && (
              <p className="mt-1 text-xs text-indigo-700">Overtime recorded: {formatMinutes(record.overtime_minutes)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}