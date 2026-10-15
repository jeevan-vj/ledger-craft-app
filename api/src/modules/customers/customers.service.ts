import {
  customerListResponseSchema,
  type CreateCustomerRequest,
  type CustomerDto,
  type CustomerListResponse,
  type UpdateCustomerRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as customersRepo from './customers.repository';

export async function listCustomersForUser(
  db: Database,
  userId: string,
): Promise<CustomerListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const customers = await customersRepo.listCustomers(tx, ctx.organisationId);
    return customerListResponseSchema.parse({ customers });
  });
}

export async function getCustomerForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<CustomerDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, id);
    if (!customer) {
      throw new HTTPException(404, { message: 'Customer not found' });
    }
    return customer;
  });
}

export async function createCustomerForUser(
  db: Database,
  userId: string,
  input: CreateCustomerRequest,
): Promise<CustomerDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    return customersRepo.insertCustomer(tx, ctx, input);
  });
}

export async function updateCustomerForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateCustomerRequest,
): Promise<CustomerDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const customer = await customersRepo.updateCustomer(tx, ctx.organisationId, id, input);
    if (!customer) {
      throw new HTTPException(404, { message: 'Customer not found' });
    }
    return customer;
  });
}

export async function deleteCustomerForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await customersRepo.deleteCustomer(tx, ctx.organisationId, id);
    if (!deleted) {
      throw new HTTPException(404, { message: 'Customer not found' });
    }
  });
}
