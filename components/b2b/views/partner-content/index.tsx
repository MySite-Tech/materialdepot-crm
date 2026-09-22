'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { BannerEditor, LaunchEditor } from './editor';
import { BannerRow, LaunchRow } from './list';
import {
  blankBanner, blankLaunch, fetchPartnerContent, orderBanners, orderLaunches, pushPartnerContent,
  type ContentSet, type DraftImage, type PartnerBanner, type PartnerLaunch, type PushOutcome,
} from '@/lib/b2b/content';

type Pane = 'banners' | 'launches';

type Editing =
  | { kind: 'banner'; row: PartnerBanner }
  | { kind: 'launch'; row: PartnerLaunch }
  | null;

const EMPTY: ContentSet = { banners: [], launches: [] };

const key = (r: { md_ref: string }) => r.md_ref;

export default function PartnerContent() {
  const [pane, setPane] = useState<Pane>('banners');
  const [published, setPublished] = useState<ContentSet>(EMPTY);
  const [draft, setDraft] = useState<ContentSet>(EMPTY);
  const [images, setImages] = useState<Record<string, DraftImage>>({});
  const [removed, setRemoved] = useState<{ banners: string[]; launches: string[] }>({ banners: [], launches: [] });
  const [editing, setEditing] = useState<Editing>(null);
  const [editImage, setEditImage] = useState<DraftImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<PushOutcome | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const set = await fetchPartnerContent();
      setPublished(set);
      setDraft(set);
      setImages({});
      setRemoved({ banners: [], launches: [] });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the partner dashboards');
      setPublished(EMPTY);
      setDraft(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const publishedByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of published.banners) map.set(`b:${b.md_ref}`, JSON.stringify(b));
    for (const l of published.launches) map.set(`l:${l.md_ref}`, JSON.stringify(l));
    return map;
  }, [published]);

  const dirtyBanners = useMemo(
    () => draft.banners.filter((b) => publishedByRef.get(`b:${b.md_ref}`) !== JSON.stringify(b) || images[b.md_ref]),
    [draft.banners, publishedByRef, images],
  );
  const dirtyLaunches = useMemo(
    () => draft.launches.filter((l) => publishedByRef.get(`l:${l.md_ref}`) !== JSON.stringify(l) || images[l.md_ref]),
    [draft.launches, publishedByRef, images],
  );

  const pendingCount =
    dirtyBanners.length + dirtyLaunches.length + removed.banners.length + removed.launches.length;

  function startNew() {
    setOutcome(null);
    setEditImage(null);
    setEditing(pane === 'banners'
      ? { kind: 'banner', row: blankBanner() }
      : { kind: 'launch', row: blankLaunch() });
  }

  function keepEdit() {
    if (!editing) return;
    const ref = editing.row.md_ref;
    setImages((prev) => {
      const next = { ...prev };
      if (editImage) next[ref] = editImage;
      else delete next[ref];
      return next;
    });
    setDraft((prev) => {
      if (editing.kind === 'banner') {
        const rest = prev.banners.filter((b) => key(b) !== ref);
        return { ...prev, banners: [...rest, editing.row] };
      }
      const rest = prev.launches.filter((l) => key(l) !== ref);
      return { ...prev, launches: [...rest, editing.row] };
    });
    setRemoved((prev) => ({
      banners: prev.banners.filter((r) => r !== ref),
      launches: prev.launches.filter((r) => r !== ref),
    }));
    setEditing(null);
    setEditImage(null);
    setOutcome(null);
  }

  function remove(kind: Pane, ref: string) {
    setOutcome(null);
    setDraft((prev) => ({
      banners: kind === 'banners' ? prev.banners.filter((b) => key(b) !== ref) : prev.banners,
      launches: kind === 'launches' ? prev.launches.filter((l) => key(l) !== ref) : prev.launches,
    }));
    setImages((prev) => { const next = { ...prev }; delete next[ref]; return next; });
    const wasPublished = publishedByRef.has(kind === 'banners' ? `b:${ref}` : `l:${ref}`);
    if (wasPublished) {
      setRemoved((prev) => ({ ...prev, [kind]: [...prev[kind], ref] }));
    }
  }

  async function push() {
    setPushing(true);
    setError('');
    setOutcome(null);
    try {
      const result = await pushPartnerContent({
        banners: dirtyBanners.map((b) => {
          const img = images[b.md_ref];
          return img ? { ...b, image_data: img.data } : b;
        }),
        launches: dirtyLaunches.map((l) => {
          const img = images[l.md_ref];
          return img ? { ...l, image_data: img.data } : l;
        }),
        remove: removed,
      });
      setOutcome(result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The push failed');
    } finally {
      setPushing(false);
    }
  }

  const banners = orderBanners(draft.banners);
  const launches = orderLaunches(draft.launches);
  const dirtyRefs = new Set([...dirtyBanners, ...dirtyLaunches].map(key));

  return (
    <div className="p-4 md:p-5 flex flex-col gap-4 max-w-4xl">
      <header>
        <h1 className="text-[17px] font-bold text-gray-800">Partner Content</h1>
        <p className="mt-0.5 text-[12px] text-gray-500">
          What architects and interior designers see on their own dashboard — the banner across their Overview,
          and the New Launches tab. Nothing here is visible to them until it is pushed and published.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(['banners', 'launches'] as Pane[]).map((p) => (
          <button
            key={p}
            onClick={() => { setPane(p); setEditing(null); }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${
              pane === p
                ? 'border-[#0F766E] text-[#0F766E] bg-[#0F766E]/5'
                : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
            }`}
          >
            {p === 'banners' ? 'Overview banners' : 'New Launches'}
            <span className="ml-1.5 text-gray-400">
              {p === 'banners' ? banners.length : launches.length}
            </span>
          </button>
        ))}

        <span className="flex-1" />

        <button className={btnGhost} onClick={() => void load()} disabled={loading || pushing}>
          {loading ? 'Reading…' : 'Reload'}
        </button>
        <button className={btnGhost} onClick={startNew} disabled={loading}>
          {pane === 'banners' ? 'New banner' : 'New launch'}
        </button>
        <button className={btnPrimary} onClick={() => void push()} disabled={pushing || pendingCount === 0}>
          {pushing ? 'Pushing…' : pendingCount ? `Push ${pendingCount} change${pendingCount === 1 ? '' : 's'}` : 'Nothing to push'}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2.5 rounded-md border border-red-200 bg-red-50">
          <p className="text-[12px] font-semibold text-red-700">{error}</p>
          <p className="mt-0.5 text-[11px] text-red-600">
            Nothing was changed on the partner dashboards. Fix this and push again — a push is safe to repeat.
          </p>
        </div>
      )}

      {outcome && (
        <div className="px-3 py-2.5 rounded-md border border-green-200 bg-green-50">
          <p className="text-[12px] font-semibold text-green-800">
            {outcome.banners.written + outcome.launches.written} published,{' '}
            {outcome.banners.removed + outcome.launches.removed} removed
          </p>
          {outcome.skipped.length > 0 && (
            <ul className="mt-1 text-[11px] text-amber-700 list-disc pl-4">
              {outcome.skipped.map((s) => <li key={s.md_ref}>{s.md_ref}: {s.reason}</li>)}
            </ul>
          )}
        </div>
      )}

      {editing && editing.kind === 'banner' && (
        <BannerEditor
          row={editing.row}
          image={editImage}
          onChange={(row) => setEditing({ ...editing, row })}
          onImage={setEditImage}
          onSave={keepEdit}
          onCancel={() => { setEditing(null); setEditImage(null); }}
        />
      )}
      {editing && editing.kind === 'launch' && (
        <LaunchEditor
          row={editing.row}
          image={editImage}
          onChange={(row) => setEditing({ ...editing, row })}
          onImage={setEditImage}
          onSave={keepEdit}
          onCancel={() => { setEditing(null); setEditImage(null); }}
        />
      )}

      {loading ? (
        <p className="text-[12px] text-gray-400">Reading what is on the partner dashboards…</p>
      ) : pane === 'banners' ? (
        <div className="flex flex-col gap-2">
          {banners.length === 0 && !editing && (
            <p className="text-[12px] text-gray-400">
              No banners. A banner is one line across the top of every partner&rsquo;s Overview — use it for
              something time-bound, and give it an end date.
            </p>
          )}
          {banners.map((b) => (
            <BannerRow
              key={b.md_ref}
              row={b}
              dirty={dirtyRefs.has(b.md_ref)}
              onEdit={() => { setEditImage(images[b.md_ref] ?? null); setEditing({ kind: 'banner', row: b }); }}
              onRemove={() => remove('banners', b.md_ref)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {launches.length === 0 && !editing && (
            <p className="text-[12px] text-gray-400">
              Nothing in New Launches. This is the catalogue partners browse — new products, designs,
              initiatives, offers and events. It has no end date unless the thing itself ends.
            </p>
          )}
          {launches.map((l) => (
            <LaunchRow
              key={l.md_ref}
              row={l}
              dirty={dirtyRefs.has(l.md_ref)}
              onEdit={() => { setEditImage(images[l.md_ref] ?? null); setEditing({ kind: 'launch', row: l }); }}
              onRemove={() => remove('launches', l.md_ref)}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
        Every push is an upsert keyed on the row&rsquo;s own id, so pushing twice changes nothing and a failed
        push is safe to repeat. Removing a row here removes it from every partner dashboard on the next push.
      </p>
    </div>
  );
}
