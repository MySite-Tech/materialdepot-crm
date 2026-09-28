'use client';

export interface ContactResult {
  id: number;
  firstName?: string;
  lastName?: string;
}

export interface AssociatedDeal {
  id: number;
  name: string;
  pipeline: string;
  pipelineName: string;
  stage: string;
  estimatedValue: string;
}

export interface EscSupportDeal {
  id: number;
  name: string;
  stage: string;
  pipeline: string;
  rca: string;
  resolution: string;
  closed: boolean;
  updatedAt: string | null;
  reasonIds: number[];
}

export interface Props {
  userName?: string;
  onViewDeal: (dealName: string) => void;
}
