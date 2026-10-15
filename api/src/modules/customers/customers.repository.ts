import {
  customerSchema,
  type CreateCustomerRequest,
  type CustomerDto,
  type UpdateCustomerRequest,
} from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';

function toDto(row: typeof customers.$inferSelect): CustomerDto {
  return customerSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? null,
    country: row.country,
    phone: row.phone ?? null,
    isVip: row.isVip ?? null,
    tags: row.tags ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listCustomers(tx: Database, organisationId: string): Promise<CustomerDto[]> {
  const rows = await tx
    .select()
    .from(customers)
    .where(eq(customers.organisationId, organisationId))
    .orderBy(customers.name);
  return rows.map(toDto);
}

export async function getCustomer(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<CustomerDto | undefined> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organisationId, organisationId)));
  return row ? toDto(row) : undefined;
}

export async function insertCustomer(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateCustomerRequest,
): Promise<CustomerDto> {
  const [row] = await tx
    .insert(customers)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: input.name,
      email: input.email,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      country: input.country ?? 'NZ',
      phone: input.phone ?? null,
      isVip: input.isVip ?? false,
      tags: input.tags ?? [],
    })
    .returning();
  if (!row) {
    throw new Error('Failed to insert customer');
  }
  return toDto(row);
}

export async function updateCustomer(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateCustomerRequest,
): Promise<CustomerDto | undefined> {
  const patch: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.address !== undefined) patch.address = input.address;
  if (input.city !== undefined) patch.city = input.city;
  if (input.state !== undefined) patch.state = input.state;
  if (input.zip !== undefined) patch.zip = input.zip;
  if (input.country !== undefined) patch.country = input.country;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.isVip !== undefined) patch.isVip = input.isVip;
  if (input.tags !== undefined) patch.tags = input.tags;

  const [row] = await tx
    .update(customers)
    .set(patch)
    .where(and(eq(customers.id, id), eq(customers.organisationId, organisationId)))
    .returning();
  return row ? toDto(row) : undefined;
}

export async function deleteCustomer(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<boolean> {
  const deleted = await tx
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.organisationId, organisationId)))
    .returning({ id: customers.id });
  return deleted.length > 0;
}
