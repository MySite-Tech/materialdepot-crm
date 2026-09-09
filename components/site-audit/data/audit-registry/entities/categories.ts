import { MD_CATEGORIES } from '../constants';
import { CategoryDef, CategoryField, RoomLike } from '../types';
import { roomV } from '../utils';
export function categoryFor(type?: string | null): CategoryDef {
  return (type && MD_CATEGORIES[type]) || MD_CATEGORIES.flooring;
}

export function needsVariant(cat: CategoryDef, room?: RoomLike): boolean {
  return !!(cat && cat.variantFields && roomV(room) >= 3 && !(room && room.variant));
}

export function unitFor(cat: CategoryDef, room?: RoomLike): string {
  if (cat.variantUnits && room && room.variant && roomV(room) >= 3) {
    return cat.variantUnits[room.variant] || cat.unit || 'ft';
  }
  return cat.unit || 'ft';
}

export function fieldsFor(cat: CategoryDef, room?: RoomLike): CategoryField[] {
  if (cat.variantFields && room && room.variant && roomV(room) >= 3) {
    return cat.variantFields[room.variant] || cat.fields;
  }
  return cat.fields;
}

export function unitNoteFor(cat: CategoryDef, room?: RoomLike): string {
  if (!cat) return '';
  if (needsVariant(cat, room)) return '';
  if (cat.variantNote && room && room.variant && roomV(room) >= 3) return cat.variantNote[room.variant] || '';
  return cat.unitNote || '';
}

export function mdInstallTermsBlock(categoryKeys: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const blocks = categoryKeys
    .filter((k): k is string => !!k && !seen.has(k) && (seen.add(k), true))
    .map((k) => MD_CATEGORIES[k])
    .filter((cat): cat is CategoryDef => !!cat && !!cat.installTerms && cat.installTerms.length > 0)
    .map((cat) => cat.label + ':\n' + cat.installTerms!.map((t) => '• ' + t).join('\n'));
  return blocks.join('\n\n');
}
