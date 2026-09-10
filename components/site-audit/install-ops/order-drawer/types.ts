'use client';

import { CityFilter } from '../../shared';
import { ShadowerOption } from '../ui/shadower-select';
import { InstallOrder, Installer, ServiceSkuRow, SlotDef } from '../types';

export interface DraftState {
  flooring: ServiceSkuRow[];
  wallpaper: ServiceSkuRow[];
  wallpanel: ServiceSkuRow[];
}

export interface Props {
  order: InstallOrder;

  allOrders: InstallOrder[];
  installers: Installer[];
  shadowerPool: ShadowerOption[];
  city: CityFilter;
  slotsFl: SlotDef[];
  slotsWp: SlotDef[];
  attribution: string;

  installersErr?: boolean;
  onRetryInstallers?: () => void;
  onClose: () => void;
  onOpenOrder: (pi: string) => void;
  onOpenRect: (o: InstallOrder) => void;
  reload: () => Promise<void>;
  reloadWithDeleted: () => Promise<void>;
  toast: (m: string) => void;
}
