import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  Role,
  type RoleValue,
  type CreateCustomerRequest,
  type CustomerListQuery,
  type CustomerPurchaseHistoryQuery,
  type CustomerPurchaseHistoryResponse,
  type CustomerResponse,
  type PaginatedCustomersResponse,
  type UpdateCustomerRequest
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

type CustomerRecord = Prisma.CustomerGetPayload<object>;

export function normalizeCustomerPhone(value: string): string {
  return value.replace(/\D/g, "");
}

function mapCustomer(customer: CustomerRecord): CustomerResponse {
  return {
    id: customer.id,
    code: customer.code,
    firstName: customer.firstName,
    lastName: customer.lastName,
    age: customer.age,
    gender: customer.gender,
    address: customer.address,
    phone: customer.phone,
    joinedAt: customer.joinedAt.toISOString(),
    isActive: customer.isActive,
    archivedAt: customer.archivedAt?.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString()
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

@Injectable()
export class CustomersService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: CustomerListQuery): Promise<PaginatedCustomersResponse> {
    const normalizedSearch = query.search
      ? normalizeCustomerPhone(query.search)
      : "";
    const where: Prisma.CustomerWhereInput = {
      ...(query.status === "active"
        ? { isActive: true }
        : query.status === "archived"
          ? { isActive: false }
          : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { address: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              ...(normalizedSearch
                ? [{ phoneNormalized: { contains: normalizedSearch } }]
                : [])
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.database.client.customer.findMany({
        where,
        orderBy: [{ code: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.customer.count({ where })
    ]);

    return {
      items: items.map(mapCustomer),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async get(id: string): Promise<CustomerResponse> {
    const customer = await this.database.client.customer.findUnique({
      where: { id }
    });
    if (!customer) {
      throw this.notFound();
    }
    return mapCustomer(customer);
  }

  async create(input: CreateCustomerRequest): Promise<CustomerResponse> {
    try {
      const customer = await this.database.client.customer.create({
        data: {
          ...input,
          joinedAt: new Date(input.joinedAt),
          phoneNormalized: normalizeCustomerPhone(input.phone)
        }
      });
      return mapCustomer(customer);
    } catch (error) {
      this.rethrowMutationError(error);
    }
  }

  async update(
    id: string,
    input: UpdateCustomerRequest
  ): Promise<CustomerResponse> {
    try {
      const customer = await this.database.client.customer.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.firstName !== undefined
            ? { firstName: input.firstName }
            : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.age !== undefined ? { age: input.age } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.joinedAt ? { joinedAt: new Date(input.joinedAt) } : {}),
          ...(input.phone !== undefined
            ? { phoneNormalized: normalizeCustomerPhone(input.phone) }
            : {})
        }
      });
      return mapCustomer(customer);
    } catch (error) {
      this.rethrowMutationError(error);
    }
  }

  async archive(id: string): Promise<CustomerResponse> {
    const existing = await this.database.client.customer.findUnique({
      where: { id }
    });
    if (!existing) {
      throw this.notFound();
    }
    if (!existing.isActive) {
      return mapCustomer(existing);
    }

    const customer = await this.database.client.customer.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() }
    });
    return mapCustomer(customer);
  }

  async purchaseHistory(
    id: string,
    query: CustomerPurchaseHistoryQuery,
    context: { actorId: string; role: RoleValue }
  ): Promise<CustomerPurchaseHistoryResponse> {
    const customer = await this.get(id);
    const saleWhere: Prisma.SaleWhereInput = {
      customerId: id,
      ...(context.role === Role.SALES
        ? { createdById: context.actorId }
        : {})
    };
    const completedWhere: Prisma.SaleWhereInput = {
      ...saleWhere,
      status: "COMPLETED"
    };
    const [items, total, completedCount, totals] = await Promise.all([
      this.database.client.sale.findMany({
        where: saleWhere,
        select: {
          id: true,
          invoiceNumber: true,
          soldAt: true,
          status: true,
          totalSales: true,
          totalCost: true,
          grossProfit: true,
          _count: { select: { items: true } }
        },
        orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.sale.count({ where: saleWhere }),
      this.database.client.sale.count({ where: completedWhere }),
      this.database.client.sale.aggregate({
        where: completedWhere,
        _sum: {
          totalSales: true,
          totalCost: true,
          grossProfit: true
        }
      })
    ]);

    return {
      customer,
      summary: {
        orderCount: completedCount,
        totalSales: totals._sum.totalSales?.toFixed(2) ?? "0.00",
        totalCost: totals._sum.totalCost?.toFixed(2) ?? "0.00",
        grossProfit: totals._sum.grossProfit?.toFixed(2) ?? "0.00"
      },
      items: items.map((sale) => ({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        soldAt: sale.soldAt.toISOString(),
        status: sale.status,
        itemCount: sale._count.items,
        totalSales: sale.totalSales.toFixed(2),
        totalCost: sale.totalCost.toFixed(2),
        grossProfit: sale.grossProfit.toFixed(2)
      })),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  private rethrowMutationError(error: unknown): never {
    if (hasPrismaCode(error, "P2002")) {
      throw new ConflictException({
        code: "CUSTOMER_CODE_CONFLICT",
        message: "รหัสลูกค้านี้ถูกใช้งานแล้ว"
      });
    }
    if (hasPrismaCode(error, "P2025")) {
      throw this.notFound();
    }
    throw error;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "CUSTOMER_NOT_FOUND",
      message: "ไม่พบลูกค้า"
    });
  }
}
