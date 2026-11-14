import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '@prisma/client';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

export { CreateProductDto, UpdateProductDto };

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
  async getProducts(
    organizationId: string,
    options?: { search?: string; categoryId?: string; lowStock?: boolean; includeArchived?: boolean },
  ) {
    const where: any = {
      organizationId,
    };

    if (!options?.includeArchived) {
      where.isArchived = false;
    }

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
    const existingSku = await this.prisma.product.findUnique({
      where: {
        organizationId_sku: { organizationId, sku: dto.sku },
      },
    });

    if (existingSku) {
      throw new BadRequestException(`Product with SKU "${dto.sku}" already exists in this workspace`);
    }

    // Check Barcode uniqueness within organization if provided
    if (dto.barcode && dto.barcode.trim()) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: { organizationId, barcode: dto.barcode.trim() },
      });
      if (existingBarcode) {
        throw new BadRequestException(`Product with barcode "${dto.barcode}" already exists in this workspace`);
      }
    }

    // Atomic transaction: create product, inventory balance, and opening stock movement
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId,
          categoryId: dto.categoryId,
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode ? dto.barcode.trim() : null,
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
    const current = await this.getProductById(organizationId, id);

    // Validate SKU uniqueness if SKU is being changed
    if (dto.sku && dto.sku !== current.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: {
          organizationId,
          sku: dto.sku,
          id: { not: id },
        },
      });
      if (existingSku) {
        throw new BadRequestException(`Product with SKU "${dto.sku}" already exists in this workspace`);
      }
    }

    // Validate Barcode uniqueness if Barcode is being changed
    if (dto.barcode && dto.barcode.trim() && dto.barcode.trim() !== current.barcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: {
          organizationId,
          barcode: dto.barcode.trim(),
          id: { not: id },
        },
      });
      if (existingBarcode) {
        throw new BadRequestException(`Product with barcode "${dto.barcode}" already exists in this workspace`);
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode !== undefined ? (dto.barcode ? dto.barcode.trim() : null) : undefined,
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
      include: { category: true, inventory: true },
    });
  }

  async restoreProduct(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id },
      data: { isArchived: false },
      include: { category: true, inventory: true },
    });
  }

  async deleteProduct(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: {
            saleItems: true,
            purchaseItems: true,
            movements: true,
            returnItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (
      product._count.saleItems > 0 ||
      product._count.purchaseItems > 0 ||
      product._count.movements > 0 ||
      product._count.returnItems > 0
    ) {
      throw new BadRequestException(
        'Cannot permanently delete product with historical sales, purchases, or inventory movements. Archive the product instead.',
      );
    }

    return this.prisma.product.delete({ where: { id } });
  }
}
