import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Supplier, ISupplierRepository } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Supplier リポジトリ実装
 */
@Injectable()
export class SupplierRepositoryImpl implements ISupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(data: {
    id: string;
    projectId: string;
    code: string | null;
    name: string;
    salesRep: string | null;
    tel: string | null;
    email: string | null;
    leadTimeDays: number | null;
    note: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): Supplier {
    return Supplier.reconstruct({
      id: data.id,
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      salesRep: data.salesRep,
      tel: data.tel,
      email: data.email,
      leadTimeDays: data.leadTimeDays,
      note: data.note,
      order: data.order,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<Supplier | null> {
    const data = await this.prisma.supplier.findUnique({ where: { id } });
    if (!data) return null;
    return this.toDomain(data);
  }

  async findByProjectId(projectId: string): Promise<Supplier[]> {
    const data = await this.prisma.supplier.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return data.map((s) => this.toDomain(s));
  }

  async save(supplier: Supplier): Promise<void> {
    const data = {
      projectId: supplier.projectId,
      code: supplier.code,
      name: supplier.name,
      salesRep: supplier.salesRep,
      tel: supplier.tel,
      email: supplier.email,
      leadTimeDays: supplier.leadTimeDays,
      note: supplier.note,
      order: supplier.order,
    };

    await this.prisma.supplier.upsert({
      where: { id: supplier.id },
      create: {
        id: supplier.id,
        ...data,
        createdAt: supplier.createdAt,
        updatedAt: supplier.updatedAt,
      },
      update: {
        ...data,
        updatedAt: supplier.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.supplier.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
