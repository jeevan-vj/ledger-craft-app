import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { 
  Upload, 
  Camera, 
  X, 
  Eye, 
  FileImage,
  AlertCircle,
  Check,
  CheckCircle,
  FileText,
  Scan,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { storageService } from '@/services/storageService';
import { useToast } from '@/hooks/use-toast';
import { ReceiptScanner } from './ReceiptScanner';
import { ReceiptScanResult } from '@/types/receipt';
import { openaiReceiptService } from '@/services/openaiReceiptService';

interface ReceiptUploadProps {
  onReceiptChange: (url: string | null, file: File | null) => void;
  onScanComplete?: (scanResult: ReceiptScanResult) => void;
  initialReceiptUrl?: string | null;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

export const ReceiptUpload: React.FC<ReceiptUploadProps> = ({
  onReceiptChange,
  onScanComplete,
  initialReceiptUrl,
  disabled = false
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialReceiptUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [manualUrl, setManualUrl] = useState(initialReceiptUrl || '');
  const [activeTab, setActiveTab] = useState('upload'); // Initialize with safe default
  const [showScanner, setShowScanner] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [isScanningAvailable, setIsScanningAvailable] = useState(false);

  useEffect(() => {
    let current = true;
    void openaiReceiptService.isAvailable().then((available) => {
      if (current) setIsScanningAvailable(available);
    });
    return () => { current = false; };
  }, []);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB';
    }
    
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      return 'Only JPEG, PNG, WebP, and PDF files are supported';
    }
    
    return null;
  };

  const generateFileName = (file: File): string => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = file.name.split('.').pop() || 'jpg';
    return `receipt-${timestamp}.${extension}`;
  };

  const handleFileUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast({
        title: "Invalid File",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Create preview
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);
      setSelectedFile(file);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Upload to Supabase Storage using receipt-specific method
      const uploadResult = await storageService.uploadReceipt(file);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (uploadResult?.url) {
        onReceiptChange(uploadResult.url, file);
        toast({
          title: "Success",
          description: "Receipt uploaded successfully",
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload receipt. Please try again.",
        variant: "destructive",
      });
      setPreviewUrl(null);
      setSelectedFile(null);
      onReceiptChange(null, null);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [onReceiptChange, toast]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const removeReceipt = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setManualUrl('');
    onReceiptChange(null, null);
    
    // Clear file inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleManualUrlChange = (url: string) => {
    setManualUrl(url);
    if (url) {
      setPreviewUrl(url);
      onReceiptChange(url, null);
    } else {
      setPreviewUrl(null);
      onReceiptChange(null, null);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const viewReceipt = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const handleScanComplete = (scanResult: ReceiptScanResult, receiptUrl?: string) => {
    console.log('Scan completed with:', { scanResult, receiptUrl });
    
    setShowScanner(false);
    if (onScanComplete) {
      onScanComplete(scanResult);
    }
    
    // If a receipt URL was provided, set it as the receipt attachment
    if (receiptUrl) {
      console.log('Setting receipt URL:', receiptUrl);
      setReceiptUrl(receiptUrl);
      onReceiptChange(receiptUrl, null);
    } else {
      console.warn('No receipt URL provided from scan');
    }
    
    toast({
      title: receiptUrl ? "Receipt Scanned & Attached" : "Receipt Scanned",
      description: receiptUrl 
        ? "AI has extracted data from your receipt and attached the image."
        : "AI has extracted data from your receipt. Image attachment may have failed.",
    });
  };

  const openScanner = () => {
    setShowScanner(true);
  };

  return (
    <div className="space-y-4">
      <Label>Receipt</Label>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn('grid w-full', isScanningAvailable ? 'grid-cols-3' : 'grid-cols-2')}>
          <TabsTrigger value="upload">Upload/Camera</TabsTrigger>
          {isScanningAvailable && <TabsTrigger value="scan" className="text-xs relative">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Scan
          </TabsTrigger>}
          <TabsTrigger value="url">Manual URL</TabsTrigger>
        </TabsList>
        {!isScanningAvailable && (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            Receipt scanning isn't set up on this server yet. Upload the receipt and enter the details manually.
          </p>
        )}
        
        <TabsContent value="upload" className="space-y-4">
          {!previewUrl ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Upload Receipt</CardTitle>
                <CardDescription className="text-xs">
                  Take a photo or upload an image/PDF (max 10MB)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCamera}
                    disabled={disabled || isUploading}
                    className="h-20 flex-col gap-2"
                  >
                    <Camera className="h-6 w-6" />
                    <span className="text-xs">Take Photo</span>
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openFileDialog}
                    disabled={disabled || isUploading}
                    className="h-20 flex-col gap-2"
                  >
                    <Upload className="h-6 w-6" />
                    <span className="text-xs">Upload File</span>
                  </Button>
                </div>
                
                <div
                  className={cn(
                    "border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors",
                    "hover:border-gray-400 cursor-pointer",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={!disabled ? openFileDialog : undefined}
                >
                  <FileImage className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600 mb-1">
                    Drop receipt here or click to upload
                  </p>
                  <p className="text-xs text-gray-500">
                    PNG, JPG, WebP, PDF up to 10MB
                  </p>
                </div>
                
                {isUploading && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Uploading...</span>
                      <span className="text-sm text-gray-600">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Receipt Attached
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeReceipt}
                    disabled={disabled}
                    aria-label="Remove receipt"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    {selectedFile ? (
                      <>
                        <FileImage className="h-5 w-5 text-green-600" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Just uploaded
                          </span>
                        </div>
                        <Check className="h-4 w-4 text-green-600" />
                      </>
                    ) : (
                      <>
                        {previewUrl && previewUrl.toLowerCase().includes('.pdf') ? (
                          <FileText className="h-5 w-5 text-red-600" />
                        ) : (
                          <FileImage className="h-5 w-5 text-blue-600" />
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium truncate">
                            {previewUrl && previewUrl.includes('/storage/v1/object/public/business-assets/receipts/') 
                              ? 'Uploaded Receipt' 
                              : 'External Receipt'
                            }
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {previewUrl ? new URL(previewUrl).pathname.split('/').pop() : 'External URL'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={viewReceipt}
                      className="h-8 px-2"
                      title="View Receipt"
                      aria-label="View receipt"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {previewUrl && !previewUrl.startsWith('blob:') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = previewUrl;
                          link.download = previewUrl.split('/').pop() || 'receipt';
                          link.click();
                        }}
                        className="h-8 px-2"
                        title="Download Receipt"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Enhanced preview for different file types */}
                {previewUrl && (
                  <div className="mt-3 border rounded-lg overflow-hidden">
                    {previewUrl.startsWith('blob:') || previewUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                      <div className="relative group">
                        <img
                          src={previewUrl}
                          alt="Receipt preview"
                          className="w-full h-40 object-cover"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={viewReceipt}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Full Size
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-muted/50 text-center">
                        <FileText className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium">PDF Receipt</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Click to view in new tab
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={viewReceipt}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Open PDF
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isScanningAvailable && <TabsContent value="scan" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center">
                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                AI Receipt Scanner
              </CardTitle>
              <CardDescription className="text-xs">
                Scan receipt with AI to automatically extract expense data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isScanningAvailable ? (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    {/* Prominent Header */}
                    <div className="rounded-2xl bg-accent p-6 mb-4">
                      <div className="bg-primary rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center shadow-surface">
                        <Scan className="h-10 w-10 text-primary-foreground" />
                      </div>
                      <div className="flex items-center justify-center mb-2">
                        <h3 className="font-bold text-lg">Smart Receipt Scanning</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Take a photo and review the extracted expense details before saving.
                      </p>
                      
                      {/* Large prominent button */}
                      <Dialog open={showScanner} onOpenChange={setShowScanner}>
                        <DialogTrigger asChild>
                          <Button 
                            onClick={openScanner}
                            disabled={disabled}
                            size="lg"
                            className="text-lg py-6 px-8 rounded-xl"
                          >
                            <Scan className="h-5 w-5 mr-3" />
                            Scan Receipt with AI
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md p-0">
                          <ReceiptScanner
                            onScanComplete={handleScanComplete}
                            onClose={() => setShowScanner(false)}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    {/* Features list */}
                    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold mb-3 flex items-center text-green-700">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        What AI will extract automatically:
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" />
                          Merchant name
                        </div>
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2" />
                          Transaction date
                        </div>
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2" />
                          Total amount
                        </div>
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-2" />
                          Tax amount
                        </div>
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mr-2" />
                          Item details
                        </div>
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-pink-500 rounded-full mr-2" />
                          Category suggestion
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      <span>Powered by OpenAI Vision</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-6">
                    <div className="bg-gradient-to-br from-red-100 to-orange-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-red-600" />
                    </div>
                    <h3 className="font-medium mb-2 text-red-600">API Key Required</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                      To use AI receipt scanning, you need to configure your OpenAI API key.
                    </p>
                    
                    <div className="bg-muted/50 rounded-lg p-4 text-left mb-4">
                      <h4 className="text-sm font-medium mb-2">Setup Instructions:</h4>
                      <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" className="text-blue-600 hover:underline">OpenAI Platform</a></li>
                        <li>Create or edit <code className="bg-muted px-1 rounded">.env.local</code> file in project root</li>
                        <li>Add: <code className="bg-muted px-1 rounded">VITE_OPENAI_API_KEY=your_key_here</code></li>
                        <li>Restart the development server</li>
                      </ol>
                    </div>

                    <div className="text-xs text-muted-foreground mb-4">
                      <strong>What AI scanning provides:</strong>
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        <div>• Merchant name</div>
                        <div>• Transaction date</div>
                        <div>• Total amount</div>
                        <div>• Tax amount</div>
                        <div>• Item details</div>
                        <div>• Category suggestions</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-center text-xs text-muted-foreground">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      <span>Powered by OpenAI Vision API</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>}
        
        <TabsContent value="url" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Manual URL</CardTitle>
              <CardDescription className="text-xs">
                Enter a direct link to your receipt image or PDF
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Input
                  placeholder="https://example.com/receipt.jpg"
                  value={manualUrl}
                  onChange={(e) => handleManualUrlChange(e.target.value)}
                  disabled={disabled}
                />
                
                {previewUrl && !previewUrl.startsWith('blob:') && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    <span>URL set successfully</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={viewReceipt}
                      className="h-6 px-2 ml-auto"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FORMATS.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
};

export default ReceiptUpload;
