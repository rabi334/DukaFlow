import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '@prisma/client';

export interface CreateProductDto {
  name: string;
  sku: string;
  barcode?: string;
  categoryId?: string;
  description?: string;
  unit?: string;
  costPrice: number;
  sellingPrice: number;
  minStockThreshold?: number;
  initialStock?: number;
}

export interface UpdateProductDto {
  name?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  description?: string;
  unit?: string;
  costPrice?: number;
  sellingPrice?: number;
  minStockThreshold?: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Categories
  async getCategories(organizationId: string) {
    return this.prisma.category.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(organizationId: string, name: string, description?: string) {
    const existing = await this.prisma.category.findUnique({
      where: {
        organizationId_name: { organizationId, name },
      },
    });

    if (existing) {
      throw new BadRequestException(`Category "${name}" already exists`);
    }

    return this.prisma.category.create({
      data: {
        organizationId,
        name,
        description,
      },
    });
  }

  // Products
  async getProducts(organizationId: string, options?: { search?: string; categoryId?: string; lowStock?: boolean }) {
    const where: any = {
      organizationId,
      isArchived: false,
    };

    if (options?.categoryId) {
      where.categoryId = options.categoryId;
    }

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { sku: { contains: options.search, mode: 'insensitive' } },
        { barcode: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        inventory: true,
      },
      orderBy: { name: 'asc' },
    });

    if (options?.lowStock) {
      return products.filter((p) => {
        const onHand = Number(p.inventory?.quantityOnHand || 0);
        const threshold = Number(p.minStockThreshold);
        return onHand <= threshold;
      });
    }

    return products;
  }

  async getProductById(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: {
        category: true,
        inventory: true,
        movements: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findByBarcodeOrSku(organizationId: string, query: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        organizationId,
        isArchived: false,
        OR: [{ barcode: query }, { sku: query }],
      },
      include: {
        category: true,
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`No product found with barcode or SKU: ${query}`);
    }

    return product;
  }

  async createProduct(organizationId: string, userId: string, dto: CreateProductDto) {
    // Check SKU uniqueness within organization
    const existing = await this.prisma.product.findUnique({
      where: {
        organizationId_sku: { organizationId, sku: dto.sku },
      },
    });

    if (existing) {
      throw new BadRequestException(`Product with SKU "${dto.sku}" already exists in this workspace`);
    }

    // Atomic transaction: create product, inventory balance, and opening stock movement
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId,
          categoryId: dto.categoryId,
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode,
          description: dto.description,
          unit: dto.unit || 'pcs',
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          minStockThreshold: dto.minStockThreshold ?? 5,
        },
      });

      const initialQty = dto.initialStock ?? 0;

      await tx.inventory.create({
        data: {
          productId: product.id,
          quantityOnHand: initialQty,
        },
      });

      if (initialQty > 0) {
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            productId: product.id,
            actorUserId: userId,
            type: StockMovementType.OPENING_STOCK,
            quantity: initialQty,
            reason: 'Initial stock on product creation',
          },
        });
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: { inventory: true, category: true },
      });
    });
  }

  async updateProduct(organizationId: string, id: string, dto: UpdateProductDto) {
    await this.getProductById(organizationId, id);

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        categoryId: dto.categoryId,
        description: dto.description,
        unit: dto.unit,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        minStockThreshold: dto.minStockThreshold,
      },
      include: {
        category: true,
        inventory: true,
      },
    });
  }

  async archiveProduct(organizationId: string, id: string) {
    await this.getProductById(organizationId, id);

    return this.prisma.product.update({
      where: { id },
      data: { isArchived: true },
    });
  }
}
