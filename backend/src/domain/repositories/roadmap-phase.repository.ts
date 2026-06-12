import { RoadmapPhase } from '../entities/roadmap-phase.entity';

export const ROADMAP_PHASE_REPOSITORY = Symbol('IRoadmapPhaseRepository');

export interface IRoadmapPhaseRepository {
  findById(id: string): Promise<RoadmapPhase | null>;
  findByProjectId(projectId: string): Promise<RoadmapPhase[]>;
  create(roadmapPhase: RoadmapPhase): Promise<void>;
  update(roadmapPhase: RoadmapPhase): Promise<void>;
  delete(id: string): Promise<void>;
  generateId(): string;
}
