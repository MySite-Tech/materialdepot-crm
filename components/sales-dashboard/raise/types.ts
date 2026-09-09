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

export interface Props {
  userName?: string;
  onViewDeal: (dealName: string) => void;
}
