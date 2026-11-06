/**
 * Dependency Injection Container following SOLID principles
 * Single Responsibility: Manages service dependencies
 * Open/Closed: Easy to extend with new services
 * Dependency Inversion: Depends on abstractions, not concretions
 */

import { customerService, invoiceService, businessProfileService, itemService, itemCategoryService, accountService, expenseService, expenseCategoryService } from "@/services/supabaseService";
import { paymentService } from "@/services/paymentService";

// Interfaces follow the typed Hono-backed service contracts.
export type ICustomerService = typeof customerService;
export type IInvoiceService = typeof invoiceService;
export type IBusinessProfileService = typeof businessProfileService;
export type IPaymentService = typeof paymentService;
export type IItemService = typeof itemService;
export type IItemCategoryService = typeof itemCategoryService;
export type IAccountService = typeof accountService;
export type IExpenseService = typeof expenseService;
export type IExpenseCategoryService = typeof expenseCategoryService;

// Service container class
class ServiceContainer {
  private static instance: ServiceContainer;
  private services: Map<string, unknown> = new Map();

  private constructor() {
    this.registerDefaultServices();
  }

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  private registerDefaultServices(): void {
    // Register all services with their interfaces
    this.register('customerService', customerService);
    this.register('invoiceService', invoiceService);
    this.register('businessProfileService', businessProfileService);
    this.register('itemService', itemService);
    this.register('itemCategoryService', itemCategoryService);
    this.register('accountService', accountService);
    this.register('expenseService', expenseService);
    this.register('expenseCategoryService', expenseCategoryService);
    this.register('paymentService', paymentService);
  }

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found in container`);
    }
    return service as T;
  }

  // Convenience getters for type safety
  get customerService(): ICustomerService {
    return this.get<ICustomerService>('customerService');
  }

  get invoiceService(): IInvoiceService {
    return this.get<IInvoiceService>('invoiceService');
  }

  get businessProfileService(): IBusinessProfileService {
    return this.get<IBusinessProfileService>('businessProfileService');
  }

  get paymentService(): IPaymentService {
    return this.get<IPaymentService>('paymentService');
  }

  get itemService(): IItemService {
    return this.get<IItemService>('itemService');
  }

  get itemCategoryService(): IItemCategoryService {
    return this.get<IItemCategoryService>('itemCategoryService');
  }

  get accountService(): IAccountService {
    return this.get<IAccountService>('accountService');
  }

  get expenseService(): IExpenseService {
    return this.get<IExpenseService>('expenseService');
  }

  get expenseCategoryService(): IExpenseCategoryService {
    return this.get<IExpenseCategoryService>('expenseCategoryService');
  }
}

export const serviceContainer = ServiceContainer.getInstance();
