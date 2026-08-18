'use client';
import { useState } from 'react';
import { displayApi } from '../../lib/displayApi';

const EC_BRANCHES = [
  { id: '1', name: 'JP NAGAR', branch_name: 'jp nagar' },
  { id: '2', name: 'YELAHANKA', branch_name: 'yelahanka' },
  { id: '36', name: 'WHITEFIELD', branch_name: 'whitefield' },
  { id: '71', name: 'KOMPALLY', branch_name: 'kompally' },
  { id: '104', name: 'HSR LAYOUT', branch_name: 'hsr layout' },
  { id: '69', name: 'GACHIBOWLI', branch_name: 'gachibowli' },
  { id: '137', name: 'BASAVESHWARA NAGAR', branch_name: 'basaveshwara nagar' },
];

const REFERENCE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1KoOuZ1MikOtrkfVIf849CnBUD4zAoJ5QrtJn2H9KIio/edit?gid=995116475#gid=995116475';
const CHANGE_REQ_REFERENCE_URL = 'https://docs.google.com/spreadsheets/d/1jxVcfDqKVQSyZRTOKxqXUSGWLv2Z6j5v-wLmNIhmtXg/edit?gid=0#gid=0';

const DISPLAY_TYPES = ['panel_display', 'shelves', 'drawer', 'catalogue', 'flaps', 'slots', 'wall_display', 'floor_stand'];

const DELETE_PASSCODE = '181997';

// ─── Bulk Upload Section ────────────────────────────────────────────────────
function BulkUploadSection() {
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!gsheetUrl.trim() || !gsheetUrl.includes('docs.google.com/spreadsheets')) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await displayApi('bulk_upload', { gsheet: gsheetUrl.trim() });
      setResult(typeof data === 'object' ? JSON.stringify(data, null, 2) : 'Success — bulk upload submitted for processing.');
      setGsheetUrl('');
    } catch (e: any) {
      setResult('Error: ' + (e.message || 'Failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-[13px] font-bold text-gray-800 mb-1">Bulk Upload</h3>
      <p className="text-[11px] text-gray-400 mb-3">Upload products via Google Sheets</p>

      <div className="mb-3">
        <a href={REFERENCE_SHEET_URL} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-600 hover:text-blue-800 underline">
          Open Reference Template →
        </a>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-[11px] text-amber-800 mb-3">
        Sheet must be shared as "Anyone with the link" with Editor access.
      </div>

      <div className="mb-2">
        <p className="text-[11px] font-medium text-gray-500 mb-1">Required columns:</p>
        <div className="flex flex-wrap gap-1">
          {['variant_handle', 'category_name', 'display_type', 'location_string', 'quantity', 'branch_name'].map(c => (
            <span key={c} className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c}</span>
          ))}
        </div>
      </div>

      <div className="mb-2">
        <p className="text-[11px] font-medium text-gray-500 mb-1">Valid display_type values:</p>
        <div className="flex flex-wrap gap-1">
          {DISPLAY_TYPES.map(dt => (
            <span key={dt} className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{dt}</span>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <input className="flex-1 px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" placeholder="https://docs.google.com/spreadsheets/d/..." value={gsheetUrl} onChange={(e) => setGsheetUrl(e.target.value)} disabled={loading} />
        <button onClick={handleSubmit} disabled={loading || !gsheetUrl.trim()} className="px-4 py-2 text-[13px] font-semibold bg-[#EAB308] text-white rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-default whitespace-nowrap">
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
      {result && <div className={`mt-2 text-[11px] px-3 py-2 rounded ${result.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{result}</div>}
    </div>
  );
}

// ─── Manage Change Requests ─────────────────────────────────────────────────
function GsheetAction({ title, description, apiAction, extraInfo }: { title: string; description: string; apiAction: string; extraInfo?: string }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!url.trim() || !url.includes('docs.google.com/spreadsheets')) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await displayApi(apiAction, { gsheet: url.trim() });
      setResult(typeof data === 'object' ? JSON.stringify(data, null, 2) : 'Success — submitted for processing.');
      setUrl('');
    } catch (e: any) {
      setResult('Error: ' + (e.message || 'Failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-[13px] font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-[11px] text-gray-400 mb-3">{description}</p>
      <a href={CHANGE_REQ_REFERENCE_URL} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-600 hover:text-blue-800 underline">Reference Sheet →</a>
      <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-[11px] text-amber-800 my-3">
        Sheet must be shared as "Anyone with the link" with Editor access.
        {extraInfo && <span className="block mt-1">{extraInfo}</span>}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading} />
        <button onClick={handleSubmit} disabled={loading || !url.trim()} className="px-4 py-2 text-[13px] font-semibold bg-[#EAB308] text-white rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-default whitespace-nowrap">
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
      {result && <div className={`mt-2 text-[11px] px-3 py-2 rounded ${result.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{result}</div>}
    </div>
  );
}

function CancelMovementSection() {
  const [vsmId, setVsmId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleCancel = async () => {
    const id = parseInt(vsmId.trim(), 10);
    if (isNaN(id)) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await displayApi('cancel_movement', { vsm_id: id });
      setResult(JSON.stringify(data, null, 2));
      setVsmId('');
    } catch (e: any) {
      setResult('Error: ' + (e.message || 'Failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-[13px] font-bold text-gray-800 mb-1">Cancel Movement</h3>
      <p className="text-[11px] text-gray-400 mb-3">Cancel a variant location movement by VSM ID</p>
      <div className="flex gap-2">
        <input type="number" className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-mono w-[120px]" placeholder="VSM ID" value={vsmId} onChange={(e) => setVsmId(e.target.value)} />
        <button onClick={handleCancel} disabled={loading || !vsmId.trim()} className="px-4 py-2 text-[13px] font-semibold bg-red-500 text-white rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-default whitespace-nowrap">
          {loading ? 'Cancelling...' : 'Cancel Movement'}
        </button>
      </div>
      {result && <pre className={`mt-2 text-[11px] px-3 py-2 rounded overflow-auto max-h-32 ${result.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>{result}</pre>}
    </div>
  );
}

// ─── Get EC Products ────────────────────────────────────────────────────────
function GetEcProductsSection() {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [fetching, setFetching] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!selectedBranch) return;
    setFetching(true);
    setSheetUrl(null);
    try {
      const branch = EC_BRANCHES.find(b => b.id === selectedBranch);
      const data = await displayApi('get_ec_products', { branch_name: branch?.branch_name });
      const url = data?.google_sheet_url || data?.sheet_url || data?.gsheet || data?.url || (typeof data === 'string' ? data : null);
      setSheetUrl(url || JSON.stringify(data, null, 2));
    } catch (e: any) {
      setSheetUrl('Error: ' + (e.message || 'Failed'));
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-[13px] font-bold text-gray-800 mb-1">Get all EC Products</h3>
      <p className="text-[11px] text-gray-400 mb-3">Fetch all variant locations for an EC as a Google Sheet</p>
      <div className="flex gap-2 items-end">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Select EC</label>
          <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none w-[180px]" value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setSheetUrl(null); }}>
            <option value="">Choose an EC...</option>
            {EC_BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name} (ID: {b.id})</option>)}
          </select>
        </div>
        <button onClick={handleFetch} disabled={!selectedBranch || fetching} className="px-4 py-2 text-[13px] font-semibold bg-[#EAB308] text-white rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-default whitespace-nowrap">
          {fetching ? 'Fetching...' : 'Fetch Products'}
        </button>
      </div>
      {sheetUrl && (
        <div className="mt-3">
          {sheetUrl.startsWith('http') ? (
            <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 text-[13px] font-semibold bg-green-600 text-white rounded-md hover:bg-green-700">
              Open Google Sheet →
            </a>
          ) : (
            <pre className={`text-[11px] px-3 py-2 rounded overflow-auto max-h-32 ${sheetUrl.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>{sheetUrl}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Delete Locations ───────────────────────────────────────────────────────
function DeleteLocationsSection() {
  const [passcode, setPasscode] = useState('');
  const [verified, setVerified] = useState(false);
  const [idsText, setIdsText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handlePasscode = () => {
    if (passcode === DELETE_PASSCODE) {
      setVerified(true);
    } else {
      setPasscode('');
    }
  };

  const handleDelete = async () => {
    const ids = idsText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (ids.length === 0) return;
    setDeleting(true);
    setResult(null);
    try {
      const data = await displayApi('delete_locations', { vsl_ids: ids });
      setResult(JSON.stringify(data, null, 2));
      setIdsText('');
    } catch (e: any) {
      setResult('Error: ' + (e.message || 'Failed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-[13px] font-bold text-red-600 mb-1">Delete Store Locations</h3>
      <p className="text-[11px] text-gray-400 mb-3">Remove variant store locations by ID (passcode required)</p>

      {!verified ? (
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Passcode</label>
            <input type="password" className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-mono w-[160px]" placeholder="6-digit passcode" maxLength={6} value={passcode} onChange={(e) => setPasscode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePasscode()} />
          </div>
          <button onClick={handlePasscode} disabled={passcode.length < 6} className="px-4 py-2 text-[13px] font-semibold bg-gray-800 text-white rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-default">
            Unlock
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Location IDs</label>
            <textarea className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-mono resize-y" rows={4} placeholder={"e.g.\n16515\n16520, 16521"} value={idsText} onChange={(e) => setIdsText(e.target.value)} />
            <p className="text-[10px] text-gray-400 mt-1">Use the <code className="font-mono font-medium">id</code> column from <code className="font-mono font-medium">variant_store_location</code>. One per line or comma-separated.</p>
          </div>
          <button onClick={handleDelete} disabled={deleting || !idsText.trim()} className="px-4 py-2 text-[13px] font-semibold bg-red-500 text-white rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-default">
            {deleting ? 'Deleting...' : 'Delete Locations'}
          </button>
          {result && <pre className={`mt-2 text-[11px] px-3 py-2 rounded overflow-auto max-h-32 ${result.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>{result}</pre>}
        </>
      )}
    </div>
  );
}

// ─── Main Admin View ────────────────────────────────────────────────────────
export function AdminView() {
  return (
    <div className="px-6 py-4">
      <h2 className="text-[15px] font-bold text-gray-800 mb-1">Admin Panel</h2>
      <p className="text-[11px] text-gray-400 mb-5">Manage your showroom display system</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BulkUploadSection />
        <GetEcProductsSection />
        <GsheetAction
          title="Bulk Change Initiate"
          description="Initiate bulk location changes via Google Sheets"
          apiAction="bulk_change_initiate"
          extraInfo='Set the "confirm" column to "No".'
        />
        <GsheetAction
          title="Bulk Change Complete"
          description="Complete bulk location changes via Google Sheets"
          apiAction="bulk_change_complete"
          extraInfo='Use the same sheet and set the "confirm" column to "Yes".'
        />
        <CancelMovementSection />
        <DeleteLocationsSection />
      </div>
    </div>
  );
}
