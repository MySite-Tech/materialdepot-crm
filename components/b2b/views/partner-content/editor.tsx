'use client';

import { useRef, useState } from 'react';
import { btnGhost, btnPrimary, inputCls } from '../../constants/ui';
import {
  KINDS, TONES, problemWith, readImage,
  type DraftImage, type PartnerBanner, type PartnerLaunch,
} from '@/lib/b2b/content';

const label = 'block text-[11px] font-semibold text-gray-500 mb-1';
const field = 'flex flex-col';

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function ImagePicker({
  url, draft, onPick, onClear,
}: {
  url: string | null;
  draft: DraftImage | null;
  onPick: (img: DraftImage) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function choose(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > 8 * 1024 * 1024) return setError('That image is over 8MB');
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) {
      return setError('Images only — jpg, png, webp, gif or avif');
    }
    onPick({ data: await readImage(file), name: file.name });
  }

  const preview = draft?.data ?? url;

  return (
    <div className={field}>
      <span className={label}>Image</span>
      <div className="flex items-start gap-3">
        <div className="w-28 h-20 shrink-0 rounded-md border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
          {preview
            ? <img src={preview} alt="" className="w-full h-full object-cover" />
            : <span className="text-[10px] text-gray-400">No image</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button type="button" className={btnGhost} onClick={() => input.current?.click()}>
            {preview ? 'Replace image' : 'Upload an image'}
          </button>
          {preview && (
            <button type="button" className={btnGhost} onClick={() => { setError(''); onClear(); }}>
              Remove
            </button>
          )}
          <span className="text-[10px] text-gray-400">
            {draft ? `${draft.name} — uploads on publish` : 'Up to 8MB · jpg, png, webp'}
          </span>
          {error && <span className="text-[10px] text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

export function BannerEditor({
  row, image, onChange, onImage, onSave, onCancel,
}: {
  row: PartnerBanner;
  image: DraftImage | null;
  onChange: (next: PartnerBanner) => void;
  onImage: (img: DraftImage | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof PartnerBanner>(key: K, value: PartnerBanner[K]) =>
    onChange({ ...row, [key]: value });
  const problem = problemWith(row);

  return (
    <div className="p-4 bg-white border border-[#0F766E] rounded-lg flex flex-col gap-3">
      <div className={field}>
        <span className={label}>Headline</span>
        <input
          className={inputCls}
          value={row.title}
          maxLength={120}
          placeholder="Terrazzo, six new slabs"
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div className={field}>
        <span className={label}>A line under it</span>
        <textarea
          className={inputCls}
          rows={2}
          value={row.body ?? ''}
          maxLength={400}
          placeholder="In stores from Monday. Samples at every Experience Centre."
          onChange={(e) => set('body', e.target.value || null)}
        />
      </div>

      <ImagePicker
        url={row.image_url}
        draft={image}
        onPick={onImage}
        onClear={() => { onImage(null); set('image_url', null); }}
      />

      <Row>
        <div className={field}>
          <span className={label}>Button text</span>
          <input
            className={inputCls}
            value={row.cta_label ?? ''}
            placeholder="See the range"
            onChange={(e) => set('cta_label', e.target.value || null)}
          />
        </div>
        <div className={field}>
          <span className={label}>Button link</span>
          <input
            className={inputCls}
            value={row.cta_href ?? ''}
            placeholder="https://materialdepot.com/…"
            onChange={(e) => set('cta_href', e.target.value || null)}
          />
        </div>
      </Row>

      <Row>
        <div className={field}>
          <span className={label}>Colour</span>
          <select className={inputCls} value={row.tone} onChange={(e) => set('tone', e.target.value as PartnerBanner['tone'])}>
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className={field}>
          <span className={label}>Order on the dashboard</span>
          <input
            type="number"
            className={inputCls}
            value={row.priority}
            onChange={(e) => set('priority', Number(e.target.value) || 0)}
          />
        </div>
      </Row>

      <Row>
        <div className={field}>
          <span className={label}>Show from</span>
          <input
            type="date"
            className={inputCls}
            value={row.starts_on ?? ''}
            onChange={(e) => set('starts_on', e.target.value || null)}
          />
        </div>
        <div className={field}>
          <span className={label}>Stop showing after</span>
          <input
            type="date"
            className={inputCls}
            value={row.ends_on ?? ''}
            onChange={(e) => set('ends_on', e.target.value || null)}
          />
        </div>
      </Row>

      <label className="flex items-center gap-2 text-[12px] text-gray-700">
        <input
          type="checkbox"
          checked={row.is_published}
          onChange={(e) => set('is_published', e.target.checked)}
        />
        Publish this — partners see it as soon as it is pushed and inside its dates
      </label>

      {problem && <p className="text-[11px] text-red-600">{problem}</p>}

      <div className="flex gap-2">
        <button className={btnPrimary} disabled={Boolean(problem)} onClick={onSave}>Keep</button>
        <button className={btnGhost} onClick={onCancel}>Discard</button>
      </div>
    </div>
  );
}

export function LaunchEditor({
  row, image, onChange, onImage, onSave, onCancel,
}: {
  row: PartnerLaunch;
  image: DraftImage | null;
  onChange: (next: PartnerLaunch) => void;
  onImage: (img: DraftImage | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof PartnerLaunch>(key: K, value: PartnerLaunch[K]) =>
    onChange({ ...row, [key]: value });
  const problem = problemWith(row);

  return (
    <div className="p-4 bg-white border border-[#0F766E] rounded-lg flex flex-col gap-3">
      <Row>
        <div className={field}>
          <span className={label}>What is it</span>
          <select className={inputCls} value={row.kind} onChange={(e) => set('kind', e.target.value as PartnerLaunch['kind'])}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className={field}>
          <span className={label}>Flag on the card</span>
          <input
            className={inputCls}
            value={row.badge ?? ''}
            placeholder="New · Ends 30 Sep · Bengaluru first"
            onChange={(e) => set('badge', e.target.value || null)}
          />
        </div>
      </Row>

      <div className={field}>
        <span className={label}>Title</span>
        <input
          className={inputCls}
          value={row.title}
          maxLength={120}
          placeholder="Terrazzo, six new slabs"
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div className={field}>
        <span className={label}>Subtitle</span>
        <input
          className={inputCls}
          value={row.subtitle ?? ''}
          placeholder="Large-format, honed and polished"
          onChange={(e) => set('subtitle', e.target.value || null)}
        />
      </div>

      <div className={field}>
        <span className={label}>The detail</span>
        <textarea
          className={inputCls}
          rows={3}
          value={row.body ?? ''}
          maxLength={600}
          placeholder="Cast in Bengaluru with recycled marble chip. Samples at every Experience Centre from Monday."
          onChange={(e) => set('body', e.target.value || null)}
        />
      </div>

      <ImagePicker
        url={row.image_url}
        draft={image}
        onPick={onImage}
        onClear={() => { onImage(null); set('image_url', null); }}
      />

      <Row>
        <div className={field}>
          <span className={label}>Link</span>
          <input
            className={inputCls}
            value={row.href ?? ''}
            placeholder="https://materialdepot.com/…"
            onChange={(e) => set('href', e.target.value || null)}
          />
        </div>
        <div className={field}>
          <span className={label}>Button text</span>
          <input
            className={inputCls}
            value={row.cta_label ?? ''}
            placeholder="See the range"
            onChange={(e) => set('cta_label', e.target.value || null)}
          />
        </div>
      </Row>

      <Row>
        <div className={field}>
          <span className={label}>Category</span>
          <input
            className={inputCls}
            value={row.category ?? ''}
            placeholder="Flooring"
            onChange={(e) => set('category', e.target.value || null)}
          />
        </div>
        <div className={field}>
          <span className={label}>Order in the list</span>
          <input
            type="number"
            className={inputCls}
            value={row.priority}
            onChange={(e) => set('priority', Number(e.target.value) || 0)}
          />
        </div>
      </Row>

      <Row>
        <div className={field}>
          <span className={label}>Launched on</span>
          <input
            type="date"
            className={inputCls}
            value={row.launched_on ?? ''}
            onChange={(e) => set('launched_on', e.target.value || null)}
          />
        </div>
        <div className={field}>
          <span className={label}>Take it down after</span>
          <input
            type="date"
            className={inputCls}
            value={row.ends_on ?? ''}
            onChange={(e) => set('ends_on', e.target.value || null)}
          />
        </div>
      </Row>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[12px] text-gray-700">
          <input
            type="checkbox"
            checked={row.is_featured}
            onChange={(e) => set('is_featured', e.target.checked)}
          />
          Feature it — one wide card at the top of the tab
        </label>
        <label className="flex items-center gap-2 text-[12px] text-gray-700">
          <input
            type="checkbox"
            checked={row.is_published}
            onChange={(e) => set('is_published', e.target.checked)}
          />
          Publish this
        </label>
      </div>

      {problem && <p className="text-[11px] text-red-600">{problem}</p>}

      <div className="flex gap-2">
        <button className={btnPrimary} disabled={Boolean(problem)} onClick={onSave}>Keep</button>
        <button className={btnGhost} onClick={onCancel}>Discard</button>
      </div>
    </div>
  );
}
