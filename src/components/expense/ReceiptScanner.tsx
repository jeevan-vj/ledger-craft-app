import React, { useRef, useState, useCallback } from 'react';
import { Camera, Upload, Scan, X, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useReceiptScanning } from '@/hooks/useReceiptScanning';
import { ReceiptScanResult } from '@/types/receipt';
import { storageService } from '@/services/storageService';
import { useToast } from '@/hooks/use-toast';

interface ReceiptScannerProps {
  onScanComplete: (result: ReceiptScanResult, receiptUrl?: string) => void;
  onClose: () => void;
  className?: string;
}

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  onScanComplete,
  onClose,
  className
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { toast } = useToast();

  const {
    isScanning,
    scanResult,
    error,
    isAvailable,
    scanReceipt,
    clearResult,
    clearError
  } = useReceiptScanning();

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    
    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    // Clean up previous preview
    return () => URL.revokeObjectURL(url);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    
    clearError();
    
    try {
      // First, scan the receipt with AI
      await scanReceipt(selectedFile);
      
      // If scanning was successful, upload the receipt to storage
      if (!error) {
        console.log('Scanning successful, starting upload...');
        setIsUploading(true);
        try {
          console.log('Uploading file:', selectedFile.name, selectedFile.size);
          const uploadResult = await storageService.uploadReceipt(selectedFile);
          console.log('Upload result:', uploadResult);
          if (uploadResult?.url) {
            setUploadedReceiptUrl(uploadResult.url);
            console.log('Receipt uploaded successfully to:', uploadResult.url);
            toast({
              title: "Receipt Uploaded",
              description: "Receipt image has been saved and scanned successfully.",
            });
          } else {
            console.error('Upload result missing URL:', uploadResult);
          }
        } catch (uploadError) {
          console.error('Receipt upload failed:', uploadError);
          toast({
            title: "Upload Warning",
            description: "Receipt was scanned but image upload failed. You can manually attach it later.",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      } else {
        console.error('Scanning failed, skipping upload');
      }
    } catch (scanError) {
      console.error('Scanning failed:', scanError);
    }
  };

  const handleAcceptResult = () => {
    if (scanResult) {
      console.log('Accepting scan result:', scanResult);
      console.log('With receipt URL:', uploadedReceiptUrl);
      onScanComplete(scanResult, uploadedReceiptUrl || undefined);
      onClose();
    }
  };

  const handleRetry = () => {
    clearResult();
    clearError();
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadedReceiptUrl(null);
    setIsUploading(false);
  };

  // Camera capture (mobile-optimized)
  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  if (!isAvailable) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Receipt scanning is not available. Configure a server-side AI provider or enter the receipt manually.
            </AlertDescription>
          </Alert>
          <Button onClick={onClose} className="mt-4 w-full">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Scan Receipt</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <Alert className="mb-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!selectedFile && !scanResult && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <Scan className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Take a photo or upload an image of your receipt
              </p>
              
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  onClick={handleCameraCapture}
                  className="flex-1"
                  variant="outline"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
                
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                  variant="outline"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Image
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment" // Use rear camera on mobile
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
        )}

        {selectedFile && !scanResult && (
          <div className="space-y-4">
            {previewUrl && (
              <div className="relative overflow-hidden rounded-lg border">
                <img
                  src={previewUrl}
                  alt="Receipt preview"
                  className="w-full max-h-64 object-contain"
                />
                
                {/* Scanning Overlay */}
                {(isScanning || isUploading) && (
                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10">
                    {/* Animated scanning line */}
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="scanning-line absolute w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-80 animate-scan" />
                    </div>
                    
                    {/* Scanning grid overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/5 to-transparent animate-pulse" />
                    
                    {/* Corner indicators */}
                    <div className="absolute top-2 left-2 w-5 h-5 border-l-2 border-t-2 border-blue-500 corner-indicator" />
                    <div className="absolute top-2 right-2 w-5 h-5 border-r-2 border-t-2 border-blue-500 corner-indicator" />
                    <div className="absolute bottom-2 left-2 w-5 h-5 border-l-2 border-b-2 border-blue-500 corner-indicator" />
                    <div className="absolute bottom-2 right-2 w-5 h-5 border-r-2 border-b-2 border-blue-500 corner-indicator" />
                    
                    {/* Additional scanning elements */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-4 bg-blue-500 animate-pulse" />
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-4 bg-blue-500 animate-pulse" />
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-1 bg-blue-500 animate-pulse" />
                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-1 bg-blue-500 animate-pulse" />
                    
                    {/* Center AI indicator */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        <div className="bg-blue-600/90 backdrop-blur-sm rounded-full p-4 scan-glow">
                          <Scan className="h-6 w-6 text-white animate-spin" />
                        </div>
                        <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                      </div>
                    </div>
                  </div>
                )}
                
                {!isScanning && !isUploading && (
                  <div className="absolute inset-0 bg-black/5 rounded-lg" />
                )}
              </div>
            )}

            <div className="text-sm text-center text-muted-foreground">
              {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
            </div>

            {(isScanning || isUploading) && (
              <div className="space-y-3">
                <div className="flex items-center justify-center text-sm font-medium text-blue-600">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <span className="ml-3">
                    {isScanning && !isUploading && "AI is analyzing your receipt..."}
                    {isUploading && "Uploading receipt image..."}
                    {!isScanning && !isUploading && "Processing complete!"}
                  </span>
                </div>
                <div className="text-xs text-center text-muted-foreground">
                  {isScanning && !isUploading && "Extracting merchant, date, amount, and items..."}
                  {isUploading && "Saving receipt image to your account..."}
                </div>
                <Progress value={undefined} className="w-full" />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleRetry}
                variant="outline"
                className="flex-1"
                disabled={isScanning || isUploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleScan}
                className="flex-1"
                disabled={isScanning || isUploading}
              >
                {isScanning || isUploading ? (
                  <>
                    <Scan className="h-4 w-4 mr-2 animate-pulse" />
                    {isScanning ? 'Scanning...' : 'Uploading...'}
                  </>
                ) : (
                  'Scan Receipt'
                )}
              </Button>
            </div>
          </div>
        )}

        {scanResult && (
          <div className="space-y-4">
            {scanResult.provider === 'workers-ai' && (
              <Alert className="border-warning/40 bg-warning/10 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Scanned with Cloudflare Workers AI, check carefully</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center text-green-600 mb-4">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span className="font-medium">Receipt scanned successfully!</span>
            </div>

            <div className="space-y-3">
              {scanResult.merchantName && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Merchant:</span>
                  <span className="text-sm font-medium">{scanResult.merchantName}</span>
                </div>
              )}

              {scanResult.date && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Date:</span>
                  <span className="text-sm font-medium">{scanResult.date}</span>
                </div>
              )}

              {scanResult.total && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total:</span>
                  <span className="text-sm font-medium">${scanResult.total.toFixed(2)}</span>
                </div>
              )}

              {scanResult.tax && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tax:</span>
                  <span className="text-sm font-medium">${scanResult.tax.toFixed(2)}</span>
                </div>
              )}

              {scanResult.suggestedCategory && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Category:</span>
                  <span className="text-sm font-medium">{scanResult.suggestedCategory}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Confidence:</span>
                <span className="text-sm font-medium">{scanResult.confidence}%</span>
              </div>
            </div>

            {scanResult.items && scanResult.items.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Items:</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {scanResult.items.map((item, index) => (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="truncate mr-2">
                        {item.quantity > 1 && `${item.quantity}x `}
                        {item.description}
                      </span>
                      <span className="text-muted-foreground">
                        ${item.price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleRetry}
                variant="outline"
                className="flex-1"
              >
                Scan Another
              </Button>
              <Button
                onClick={handleAcceptResult}
                className="flex-1"
              >
                Use This Data
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
