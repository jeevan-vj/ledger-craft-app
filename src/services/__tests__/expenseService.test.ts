import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import { expenseService } from '../supabaseService'
import {
  mockUser,
  mockSupabaseExpense,
  mockExpense,
  mockCreateExpenseData,
  mockSupabaseExpenseWithJoins,
  mockExpenseFilters,
  mockSupabaseError,
  mockNotFoundError,
} from '@/test/fixtures/expenseFixtures'

vi.mock('@/integrations/supabase/client')

const mockSupabase = vi.mocked(supabase)

describe('expenseService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock setup
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  describe('getExpenses', () => {
    it('should fetch expenses successfully without filters', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ data: [mockSupabaseExpenseWithJoins], error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      const result = await expenseService.getExpenses()

      expect(mockSupabase.from).toHaveBeenCalledWith('expenses')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(mockQuery.order).toHaveBeenCalledWith('expense_date', { ascending: false })
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(expect.objectContaining({
        id: mockExpense.id,
        description: mockExpense.description,
        amount: mockExpense.amount,
      }))
    })

    it('should apply filters correctly', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ data: [], error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      await expenseService.getExpenses(mockExpenseFilters)

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(mockQuery.eq).toHaveBeenCalledWith('category_id', mockExpenseFilters.categoryId)
      expect(mockQuery.eq).toHaveBeenCalledWith('account_id', mockExpenseFilters.accountId)
      expect(mockQuery.eq).toHaveBeenCalledWith('customer_id', mockExpenseFilters.customerId)
      expect(mockQuery.eq).toHaveBeenCalledWith('status', mockExpenseFilters.status)
      expect(mockQuery.gte).toHaveBeenCalledWith('expense_date', mockExpenseFilters.dateFrom)
      expect(mockQuery.lte).toHaveBeenCalledWith('expense_date', mockExpenseFilters.dateTo)
    })

    it('should handle database errors', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      await expect(expenseService.getExpenses()).rejects.toThrow()
    })

    it('should return empty array when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      const result = await expenseService.getExpenses()
      expect(result).toEqual([])
    })
  })

  describe('getExpense', () => {
    it('should fetch a single expense successfully', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: mockSupabaseExpenseWithJoins, error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      const result = await expenseService.getExpense('exp-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('expenses')
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'exp-1')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(result).toEqual(expect.objectContaining({
        id: mockExpense.id,
        description: mockExpense.description,
      }))
    })

    it('should return null when expense not found', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockNotFoundError }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      const result = await expenseService.getExpense('non-existent')
      expect(result).toBeNull()
    })

    it('should handle database errors', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      await expect(expenseService.getExpense('exp-1')).rejects.toThrow()
    })
  })

  describe('createExpense', () => {
    it('should create an expense successfully', async () => {
      const newExpenseData = {
        ...mockSupabaseExpenseWithJoins,
        description: mockCreateExpenseData.description,
        amount: mockCreateExpenseData.amount,
      }
      
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: newExpenseData, error: null }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as any)

      const result = await expenseService.createExpense(mockCreateExpenseData)

      expect(mockSupabase.from).toHaveBeenCalledWith('expenses')
      expect(mockQuery.insert).toHaveBeenCalledWith([expect.objectContaining({
        description: mockCreateExpenseData.description,
        amount: mockCreateExpenseData.amount,
        user_id: mockUser.id,
      })])
      expect(result).toEqual(expect.objectContaining({
        description: mockCreateExpenseData.description,
        amount: mockCreateExpenseData.amount,
      }))
    })

    it('should handle database errors during creation', async () => {
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as any)

      await expect(expenseService.createExpense(mockCreateExpenseData)).rejects.toThrow()
    })
  })

  describe('updateExpense', () => {
    it('should update an expense successfully', async () => {
      const updateData = { description: 'Updated description', amount: 200 }
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ 
          data: { ...mockSupabaseExpenseWithJoins, ...updateData }, 
          error: null 
        }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as any)

      const result = await expenseService.updateExpense('exp-1', updateData)

      expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        description: updateData.description,
        amount: updateData.amount,
      }))
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'exp-1')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(result.description).toBe(updateData.description)
    })

    it('should handle database errors during update', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as any)

      await expect(expenseService.updateExpense('exp-1', { amount: 200 })).rejects.toThrow()
    })

    it('should throw error when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      await expect(expenseService.updateExpense('exp-1', { amount: 200 }))
        .rejects.toThrow('No authenticated user found')
    })
  })

  describe('deleteExpense', () => {
    it('should delete an expense successfully', async () => {
      const mockDelete = vi.fn().mockReturnThis()
      const mockEq1 = vi.fn().mockReturnThis()
      const mockEq2 = vi.fn().mockReturnValue({ error: null })
      const existingExpense = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockSupabaseExpense, receipt_url: null },
                error: null,
              }),
            }),
          }),
        }),
      }
      
      mockSupabase.from.mockReturnValue({
        ...existingExpense,
        delete: mockDelete,
      } as any)
      
      mockDelete.mockReturnValue({
        eq: mockEq1,
      })
      
      mockEq1.mockReturnValue({
        eq: mockEq2,
      })

      await expenseService.deleteExpense('exp-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('expenses')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq1).toHaveBeenCalledWith('id', 'exp-1')
      expect(mockEq2).toHaveBeenCalledWith('user_id', mockUser.id)
    })

    it('should handle database errors during deletion', async () => {
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as any)

      await expect(expenseService.deleteExpense('exp-1')).rejects.toThrow()
    })
  })

  describe('getExpensesByCategory', () => {
    it('should fetch expenses grouped by category', async () => {
      const mockData = [
        { amount: 100, expense_categories: { name: 'Office Supplies' } },
        { amount: 50, expense_categories: { name: 'Office Supplies' } },
        { amount: 75, expense_categories: { name: 'Travel' } },
        { amount: 25, expense_categories: null },
      ]

      const mockQuery = {
        eq: vi.fn().mockReturnValue({ data: mockData, error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      const result = await expenseService.getExpensesByCategory()

      expect(result).toEqual([
        { category: 'Office Supplies', amount: 150, count: 2 },
        { category: 'Travel', amount: 75, count: 1 },
        { category: 'Uncategorized', amount: 25, count: 1 },
      ])
    })
  })

  describe('getMonthlyExpenseTotals', () => {
    it('should fetch monthly expense totals for a year', async () => {
      const mockData = [
        { amount: 100, expense_date: '2024-01-15' },
        { amount: 50, expense_date: '2024-01-20' },
        { amount: 75, expense_date: '2024-02-10' },
      ]

      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnValue({ data: mockData, error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as any)

      const result = await expenseService.getMonthlyExpenseTotals(2024)

      expect(mockQuery.gte).toHaveBeenCalledWith('expense_date', '2024-01-01')
      expect(mockQuery.lte).toHaveBeenCalledWith('expense_date', '2024-12-31')
      expect(result).toHaveLength(12)
      expect(result[0]).toEqual({ month: 1, amount: 150 }) // January
      expect(result[1]).toEqual({ month: 2, amount: 75 })  // February
      expect(result[2]).toEqual({ month: 3, amount: 0 })   // March (no data)
    })
  })
})