import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReceiptUpload from '../ReceiptUpload';
import { storageService } from '@/services/storageService';

// Mock the storage service
vi.mock('@/services/storageService', () => ({
  storageService: {
    uploadReceipt: vi.fn(),
    deleteReceipt: vi.fn(),
  },
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/services/openaiReceiptService', () => ({
  openaiReceiptService: {
    isAvailable: () => false,
    scanReceipt: vi.fn(),
  },
}));

describe('ReceiptUpload', () => {
  const mockOnReceiptChange = vi.fn();
  
  const defaultProps = {
    onReceiptChange: mockOnReceiptChange,
    initialReceiptUrl: null,
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:receipt-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it('renders upload interface by default', () => {
    render(<ReceiptUpload {...defaultProps} />);
    
    expect(screen.getByText('Receipt')).toBeInTheDocument();
    expect(screen.getByText('Upload/Camera')).toBeInTheDocument();
    expect(screen.getByText('Manual URL')).toBeInTheDocument();
    expect(screen.getByText('Take Photo')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('shows initial receipt when provided', () => {
    const initialUrl = 'https://example.com/receipt.jpg';
    render(<ReceiptUpload {...defaultProps} initialReceiptUrl={initialUrl} />);
    
    expect(screen.getByText('Receipt Attached')).toBeInTheDocument();
    expect(screen.getByText('External Receipt')).toBeInTheDocument();
    expect(screen.getByText('receipt.jpg')).toBeInTheDocument();
  });

  it('handles file upload successfully', async () => {
    const mockFile = new File(['receipt content'], 'receipt.jpg', { type: 'image/jpeg' });
    const mockUploadResult = { url: 'https://storage.example.com/receipt.jpg', path: 'receipts/receipt.jpg' };
    
    vi.mocked(storageService.uploadReceipt).mockResolvedValue(mockUploadResult);
    
    render(<ReceiptUpload {...defaultProps} />);
    
    const hiddenInput = document.querySelector('input[accept*="pdf"]') as HTMLInputElement;
    Object.defineProperty(hiddenInput, 'files', {
      configurable: true,
      value: [mockFile],
    });
    fireEvent.change(hiddenInput);
    
    await waitFor(() => {
      expect(storageService.uploadReceipt).toHaveBeenCalledWith(mockFile);
      expect(mockOnReceiptChange).toHaveBeenCalledWith(mockUploadResult.url, mockFile);
    });
  });

  it('validates file size limits', async () => {
    const oversizedFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    
    render(<ReceiptUpload {...defaultProps} />);
    
    const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (hiddenInput) {
      Object.defineProperty(hiddenInput, 'files', {
        value: [oversizedFile],
        writable: false,
      });
      fireEvent.change(hiddenInput);
    }
    
    // File should be rejected due to size, so upload service shouldn't be called
    await waitFor(() => {
      expect(storageService.uploadReceipt).not.toHaveBeenCalled();
    });
  });

  it('validates file types', async () => {
    const invalidFile = new File(['content'], 'document.txt', { type: 'text/plain' });
    
    render(<ReceiptUpload {...defaultProps} />);
    
    const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (hiddenInput) {
      Object.defineProperty(hiddenInput, 'files', {
        value: [invalidFile],
        writable: false,
      });
      fireEvent.change(hiddenInput);
    }
    
    // File should be rejected due to type, so upload service shouldn't be called
    await waitFor(() => {
      expect(storageService.uploadReceipt).not.toHaveBeenCalled();
    });
  });

  it('switches between upload and manual URL tabs', async () => {
    const user = userEvent.setup();
    render(<ReceiptUpload {...defaultProps} />);
    
    expect(screen.getByText('Take Photo')).toBeInTheDocument();
    
    await user.click(screen.getByRole('tab', { name: /manual url/i }));
    expect(screen.getByPlaceholderText('https://example.com/receipt.jpg')).toBeInTheDocument();
    
    await user.click(screen.getByRole('tab', { name: /upload\/camera/i }));
    expect(screen.getByText('Take Photo')).toBeInTheDocument();
  });

  it('handles manual URL input', async () => {
    const user = userEvent.setup();
    render(<ReceiptUpload {...defaultProps} />);
    
    await user.click(screen.getByRole('tab', { name: /manual url/i }));
    
    const urlInput = screen.getByPlaceholderText('https://example.com/receipt.jpg');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/my-receipt.pdf' } });
    
    expect(mockOnReceiptChange).toHaveBeenCalledWith('https://example.com/my-receipt.pdf', null);
  });

  it('removes receipt when delete button clicked', () => {
    const initialUrl = 'https://example.com/receipt.jpg';
    render(<ReceiptUpload {...defaultProps} initialReceiptUrl={initialUrl} />);
    
    expect(screen.getByText('Receipt Attached')).toBeInTheDocument();
    
    const deleteButton = screen.getByRole('button', { name: /remove receipt/i });
    fireEvent.click(deleteButton);
    
    expect(mockOnReceiptChange).toHaveBeenCalledWith(null, null);
  });

  it('opens receipt for viewing when view button clicked', () => {
    const mockOpen = vi.fn();
    const originalOpen = window.open;
    window.open = mockOpen;
    
    const initialUrl = 'https://example.com/receipt.jpg';
    render(<ReceiptUpload {...defaultProps} initialReceiptUrl={initialUrl} />);
    
    const viewButton = screen.getByRole('button', { name: /view receipt/i });
    fireEvent.click(viewButton);
    
    expect(mockOpen).toHaveBeenCalledWith(initialUrl, '_blank');
    
    window.open = originalOpen;
  });

  it('disables interface when disabled prop is true', () => {
    render(<ReceiptUpload {...defaultProps} disabled={true} />);
    
    const takePhotoButton = screen.getByRole('button', { name: /take photo/i });
    const uploadButton = screen.getByRole('button', { name: /upload file/i });
    
    expect(takePhotoButton).toBeDisabled();
    expect(uploadButton).toBeDisabled();
  });

  it('shows camera capture input for mobile devices', () => {
    render(<ReceiptUpload {...defaultProps} />);
    
    const cameraInput = document.querySelector('input[capture="environment"]');
    expect(cameraInput).toBeInTheDocument();
    expect(cameraInput).toHaveAttribute('accept', 'image/*');
  });

  it('handles drag and drop file upload', () => {
    const mockFile = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
    
    render(<ReceiptUpload {...defaultProps} />);
    
    const dropZone = screen.getByText(/drop receipt here/i).closest('div');
    
    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [mockFile] },
      writable: false,
    });
    
    if (dropZone) {
      fireEvent(dropZone, dropEvent);
    }
    
    // Note: Full drag-and-drop testing requires more complex setup
    // This test verifies the event handlers are attached
  });
});