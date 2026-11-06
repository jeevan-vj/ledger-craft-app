import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import { expenseCategoryService } from '../supabaseService'
import {
  mockUser,
  mockSupabaseExpenseCategory,
  mockExpenseCategory,
  mockCreateExpenseCategoryData,
  mockSupabaseError,
  mockNotFoundError,
} from '@/test/fixtures/expenseFixtures'

vi.mock('@/integrations/supabase/client')

const mockSupabase = vi.mocked(supabase, true)

describe('expenseCategoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock setup
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  describe('getExpenseCategories', () => {
    it('should fetch expense categories successfully', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ data: [mockSupabaseExpenseCategory], error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ReturnType<typeof supabase.from>)

      const result = await expenseCategoryService.getExpenseCategories()

      expect(mockSupabase.from).toHaveBeenCalledWith('expense_categories')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(mockQuery.order).toHaveBeenCalledWith('name')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(mockExpenseCategory)
    })

    it('should return empty array when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      const result = await expenseCategoryService.getExpenseCategories()
      expect(result).toEqual([])
    })

    it('should handle database errors', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ReturnType<typeof supabase.from>)

      await expect(expenseCategoryService.getExpenseCategories()).rejects.toThrow()
    })
  })

  describe('getExpenseCategory', () => {
    it('should fetch a single expense category successfully', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: mockSupabaseExpenseCategory, error: null }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ReturnType<typeof supabase.from>)

      const result = await expenseCategoryService.getExpenseCategory('cat-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('expense_categories')
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'cat-1')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(result).toEqual(mockExpenseCategory)
    })

    it('should return null when category not found', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockNotFoundError }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ReturnType<typeof supabase.from>)

      const result = await expenseCategoryService.getExpenseCategory('non-existent')
      expect(result).toBeNull()
    })

    it('should handle database errors', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ReturnType<typeof supabase.from>)

      await expect(expenseCategoryService.getExpenseCategory('cat-1')).rejects.toThrow()
    })

    it('should return null when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      const result = await expenseCategoryService.getExpenseCategory('cat-1')
      expect(result).toBeNull()
    })
  })

  describe('createExpenseCategory', () => {
    it('should create an expense category successfully', async () => {
      const newCategory = {
        ...mockSupabaseExpenseCategory,
        name: mockCreateExpenseCategoryData.name,
        description: mockCreateExpenseCategoryData.description,
        color: mockCreateExpenseCategoryData.color,
      }
      
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: newCategory, error: null }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      const result = await expenseCategoryService.createExpenseCategory(mockCreateExpenseCategoryData)

      expect(mockSupabase.from).toHaveBeenCalledWith('expense_categories')
      expect(mockQuery.insert).toHaveBeenCalledWith([expect.objectContaining({
        name: mockCreateExpenseCategoryData.name,
        description: mockCreateExpenseCategoryData.description,
        color: mockCreateExpenseCategoryData.color,
        user_id: mockUser.id,
      })])
      expect(result).toEqual(expect.objectContaining({
        name: mockCreateExpenseCategoryData.name,
        description: mockCreateExpenseCategoryData.description,
      }))
    })

    it('should handle database errors during creation', async () => {
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      await expect(expenseCategoryService.createExpenseCategory(mockCreateExpenseCategoryData))
        .rejects.toThrow()
    })
  })

  describe('updateExpenseCategory', () => {
    it('should update an expense category successfully', async () => {
      const updateData = { name: 'Updated Category', description: 'Updated description' }
      const updatedCategory = { ...mockSupabaseExpenseCategory, ...updateData }
      
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: updatedCategory, error: null }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      const result = await expenseCategoryService.updateExpenseCategory('cat-1', updateData)

      expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        name: updateData.name,
        description: updateData.description,
      }))
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'cat-1')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUser.id)
      expect(result.name).toBe(updateData.name)
    })

    it('should handle undefined fields correctly', async () => {
      const updateData = { name: 'Updated Category', description: undefined, color: null }
      
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: mockSupabaseExpenseCategory, error: null }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      await expenseCategoryService.updateExpenseCategory('cat-1', updateData)

      expect(mockQuery.update).toHaveBeenCalledWith({
        name: updateData.name,
        color: null,
      })
    })

    it('should handle database errors during update', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      await expect(expenseCategoryService.updateExpenseCategory('cat-1', { name: 'Updated' }))
        .rejects.toThrow()
    })

    it('should throw error when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      await expect(expenseCategoryService.updateExpenseCategory('cat-1', { name: 'Updated' }))
        .rejects.toThrow('No authenticated user found')
    })
  })

  describe('deleteExpenseCategory', () => {
    it('should delete an expense category successfully', async () => {
      const mockDelete = vi.fn().mockReturnThis()
      const mockEq1 = vi.fn().mockReturnThis()
      const mockEq2 = vi.fn().mockReturnValue({ error: null })
      
      mockSupabase.from.mockReturnValue({
        delete: mockDelete,
      } as unknown as ReturnType<typeof supabase.from>)
      
      mockDelete.mockReturnValue({
        eq: mockEq1,
      })
      
      mockEq1.mockReturnValue({
        eq: mockEq2,
      })

      await expenseCategoryService.deleteExpenseCategory('cat-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('expense_categories')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq1).toHaveBeenCalledWith('id', 'cat-1')
      expect(mockEq2).toHaveBeenCalledWith('user_id', mockUser.id)
    })

    it('should handle database errors during deletion', async () => {
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ error: mockSupabaseError }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      await expect(expenseCategoryService.deleteExpenseCategory('cat-1')).rejects.toThrow()
    })

    it('should throw error when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      await expect(expenseCategoryService.deleteExpenseCategory('cat-1'))
        .rejects.toThrow('No authenticated user found')
    })
  })
})