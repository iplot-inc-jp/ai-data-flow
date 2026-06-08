import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Product, IProductRepository } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Product リポジトリ実装
 */
@Injectable()
export class ProductRepositoryImpl implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(data: {
    id: string;
    projectId: string;
    code: string | null;
    name: string;
    supplierId: string | null;
    supplierName: string | null;
    minLot: number | null;
    unitPrice: number | null;
    note: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): Product {
    return Product.reconstruct({
      id: data.id,
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      minLot: data.minLot,
      unitPrice: data.unitPrice,
      note: data.note,
      order: data.order,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<Product | null> {
    const data = await this.prisma.product.findUnique({ where: { id } });
    if (!data) return null;
    return this.toDomain(data);
  }

  async findByProjectId(projectId: string): Promise<Product[]> {
    const data = await this.prisma.product.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return data.map((p) => this.toDomain(p));
  }

  async save(product: Product): Promise<void> {
    const data = {
      projectId: product.projectId,
      code: product.code,
      name: product.name,
      supplierId: product.supplierId,
      supplierName: product.supplierName,
      minLot: product.minLot,
      unitPrice: product.unitPrice,
      note: product.note,
      order: product.order,
    };

    await this.prisma.product.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        ...data,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      update: {
        ...data,
        updatedAt: product.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
