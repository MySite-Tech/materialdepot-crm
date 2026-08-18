'use client';
import { useState, useEffect, useCallback } from 'react';
import { getDisplaySupabase } from '../../lib/displaySupabase';

interface SessionSummary {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  submitted: boolean;
  submitted_at: string | null;
  status: string;
  scanCount: number;
  firstPanel: string;
  creatorEmail?: string;
}

interface ScanRow {
  id: string;
  session_id: string;
  panel_number: string;
  scanned_data: string;
  tl_code: string;
  variant_handle: string;
  count: number;
  row_index: number;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  flagged: 'bg-red-50 text-red-600',
};

export function LiveMappingView() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [scansLoading, setScansLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getDisplaySupabase();
      const { data: sessRows, error } = await sb
        .from('mapping_sessions')
        .select('id, name, created_at, created_by, submitted, submitted_at, status')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const ids = (sessRows || []).map(s => s.id);
      let scanRows: { session_id: string; panel_number: string; scanned_data: string; row_index: number }[] = [];
      if (ids.length) {
        const { data: scanData } = await sb
          .from('live_mapping_scans')
          .select('session_id, panel_number, scanned_data, row_index')
          .in('session_id', ids)
          .not('scanned_data', 'is', null)
          .neq('scanned_data', '')
          .order('row_index', { ascending: true });
        scanRows = scanData || [];
      }

      const summary: SessionSummary[] = (sessRows || []).map((s: any) => {
        const sessionScans = scanRows.filter(sc => sc.session_id === s.id);
        return {
          id: s.id,
          name: s.name,
          created_at: s.created_at,
          created_by: s.created_by,
          submitted: !!s.submitted,
          submitted_at: s.submitted_at || null,
          status: s.status || 'draft',
          scanCount: sessionScans.length,
          firstPanel: sessionScans[0]?.panel_number || '',
        };
      });

      setSessions(summary);
    } catch (e: any) {
      console.error('Failed to load sessions', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const filteredSessions = statusFilter === 'all'
    ? sessions
    : sessions.filter(s => s.status === statusFilter);

  const toggleSession = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setScans([]);
      return;
    }
    setExpandedSession(sessionId);
    setScansLoading(true);
    try {
      const sb = getDisplaySupabase();
      const { data, error } = await sb
        .from('live_mapping_scans')
        .select('*')
        .eq('session_id', sessionId)
        .order('row_index', { ascending: true });
      if (error) throw error;
      setScans((data || []) as ScanRow[]);
    } catch {
      setScans([]);
    } finally {
      setScansLoading(false);
    }
  };

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-[15px] font-bold text-gray-800">Live Mapping Sessions</h2>
        <div className="flex gap-1">
          {['all', 'draft', 'submitted', 'approved', 'flagged'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full cursor-pointer border ${
                statusFilter === s
                  ? 'bg-[#EAB308] text-white border-[#EAB308]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-gray-400 ml-auto">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading sessions...</div>
      ) : filteredSessions.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No sessions found</div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map(s => (
            <div key={s.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleSession(s.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 cursor-pointer bg-transparent border-0"
              >
                <span className={`text-[10px] ${expandedSession === s.id ? 'rotate-90' : ''} transition-transform text-gray-400`}>▶</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] text-gray-800 truncate">{s.name}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[s.status] || STATUS_COLORS.draft}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {s.firstPanel ? `${s.firstPanel} · ` : ''}{s.scanCount} scan{s.scanCount !== 1 ? 's' : ''}
                    {' · '}{formatDate(s.created_at)}
                    {s.submitted_at ? ` · submitted ${formatDate(s.submitted_at)}` : ''}
                  </div>
                </div>
              </button>

              {expandedSession === s.id && (
                <div className="border-t border-gray-100 px-4 py-3">
                  {scansLoading ? (
                    <div className="py-4 text-center text-gray-400 text-[12px]">Loading scans...</div>
                  ) : scans.length === 0 ? (
                    <div className="py-4 text-center text-gray-400 text-[12px]">No scans in this session</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">#</th>
                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Panel</th>
                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">TL Code</th>
                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Variant Handle</th>
                            <th className="text-center px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Count</th>
                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Scanned URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scans.filter(sc => sc.scanned_data || sc.tl_code || sc.panel_number || sc.variant_handle).map((sc, idx) => (
                            <tr key={sc.id || idx} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-2 py-1.5 text-gray-400">{sc.row_index || idx + 1}</td>
                              <td className="px-2 py-1.5 text-gray-700 font-medium">{sc.panel_number || '—'}</td>
                              <td className="px-2 py-1.5 font-mono text-amber-600 font-semibold uppercase">{sc.tl_code || '—'}</td>
                              <td className="px-2 py-1.5 font-mono text-gray-600">{sc.variant_handle || '—'}</td>
                              <td className="px-2 py-1.5 text-center text-gray-600">{sc.count || 1}</td>
                              <td className="px-2 py-1.5 text-gray-400 truncate max-w-[250px]">{sc.scanned_data || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
