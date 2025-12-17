import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Project, ProjectRepository } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * プロジェクトリポジトリ実装
 */
@Injectable()
export class ProjectRepositoryImpl implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Project | null> {
    const data = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!data) return null;

    return Project.reconstruct({
      id: data.id,
      organizationId: data.organizationId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findByOrganizationId(organizationId: string): Promise<Project[]> {
    const data = await this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return data.map((p) =>
      Project.reconstruct({
        id: p.id,
        organizationId: p.organizationId,
        name: p.name,
        slug: p.slug,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }),
    );
  }

  async findByOrganizationIdAndSlug(
    organizationId: string,
    slug: string,
  ): Promise<Project | null> {
    const data = await this.prisma.project.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug,
        },
      },
    });

    if (!data) return null;

    return Project.reconstruct({
      id: data.id,
      organizationId: data.organizationId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async existsByOrganizationIdAndSlug(
    organizationId: string,
    slug: string,
  ): Promise<boolean> {
    const count = await this.prisma.project.count({
      where: { organizationId, slug },
    });
    return count > 0;
  }

  async save(project: Project): Promise<void> {
    await this.prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        slug: project.slug,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      update: {
        name: project.name,
        description: project.description,
        updatedAt: project.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.project.delete({
      where: { id },
    });
  }

  generateId(): string {
    return randomUUID();
  }
}

