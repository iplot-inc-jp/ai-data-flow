import { RoadmapPhase } from '../../../domain';

export interface RoadmapPhaseOutput {
  id: string;
  projectId: string;
  name: string;
  legacyKey: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toRoadmapPhaseOutput(roadmapPhase: RoadmapPhase): RoadmapPhaseOutput {
  return {
    id: roadmapPhase.id,
    projectId: roadmapPhase.projectId,
    name: roadmapPhase.name,
    legacyKey: roadmapPhase.legacyKey,
    order: roadmapPhase.order,
    createdAt: roadmapPhase.createdAt,
    updatedAt: roadmapPhase.updatedAt,
  };
}
