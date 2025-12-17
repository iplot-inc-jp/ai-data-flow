import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Organization, OrganizationRepository, OrganizationMember } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 組織リポジトリ実装
 */
@Injectable()
export class OrganizationRepositoryImpl implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Organization | null> {
    const data = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!data) return null;

    return Organization.reconstruct({
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const data = await this.prisma.organization.findUnique({
      where: { slug },
    });

    if (!data) return null;

    return Organization.reconstruct({
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findByUserId(userId: string): Promise<Organization[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
    });

    return memberships.map((m) =>
      Organization.reconstruct({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        description: m.organization.description,
        createdAt: m.organization.createdAt,
        updatedAt: m.organization.updatedAt,
      }),
    );
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.prisma.organization.count({
      where: { slug },
    });
    return count > 0;
  }

  async save(organization: Organization): Promise<void> {
    await this.prisma.organization.upsert({
      where: { id: organization.id },
      create: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      },
      update: {
        name: organization.name,
        description: organization.description,
        updatedAt: organization.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organization.delete({
      where: { id },
    });
  }

  async addMember(organizationId: string, member: OrganizationMember): Promise<void> {
    await this.prisma.organizationMember.create({
      data: {
        organizationId,
        userId: member.userId,
        role: member.role,
      },
    });
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await this.prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });
  }

  async getMemberRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember['role'] | null> {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    if (!member) return null;
    return member.role as OrganizationMember['role'];
  }

  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.organizationMember.count({
      where: { organizationId, userId },
    });
    return count > 0;
  }

  generateId(): string {
    return randomUUID();
  }
}

