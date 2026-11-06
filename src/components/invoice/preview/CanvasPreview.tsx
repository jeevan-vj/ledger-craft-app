
import React, { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { useIsMobile } from '@/hooks/use-mobile';

interface CanvasPreviewProps {
  contentRef: React.RefObject<HTMLDivElement>;
}

const CanvasPreview = ({ contentRef }: CanvasPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    const renderToCanvas = async () => {
      if (!contentRef.current || !canvasRef.current) return;
      
      setIsRendering(true);

      try {
        // Wait a moment to ensure content is properly rendered in the DOM
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = await html2canvas(contentRef.current, {
          scale: isMobile ? 1.5 : 2, // Lower scale on mobile for better performance
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#FFFFFF',
          logging: false,
          onclone: (clonedDoc) => {
            // Enhance text rendering for better quality
            const clonedElement = clonedDoc.body.querySelector('[data-invoice-template]');
            if (clonedElement) {
              const textElements = clonedElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, td, th');
              textElements.forEach(el => {
                if (el instanceof HTMLElement) {
                  // Ensure text is rendered with optimal settings
                  el.style.textRendering = 'optimizeLegibility';
                  // Use string indexing for vendor-specific CSS properties
                  el.style.setProperty('-webkit-font-smoothing', 'antialiased');
                  el.style.setProperty('-moz-osx-font-smoothing', 'grayscale');
                }
              });
            }
          }
        });

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Set canvas dimensions to match the rendered content
        canvasRef.current.width = canvas.width;
        canvasRef.current.height = canvas.height;

        // Draw the content onto our display canvas
        ctx.drawImage(canvas, 0, 0);
      } catch (error) {
        console.error('Error rendering to canvas:', error);
      } finally {
        setIsRendering(false);
      }
    };

    renderToCanvas();
  }, [contentRef, isMobile]);

  return (
    <div className="w-full">
      {isRendering && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
          <span className="ml-2 text-gray-600">Rendering preview...</span>
        </div>
      )}
      <canvas 
        ref={canvasRef}
        className={`w-full h-full ${isRendering ? 'opacity-0' : 'opacity-100'}`}
        style={{ 
          maxWidth: '100%', 
          transition: 'opacity 0.3s ease',
          transform: isMobile ? 'scale(0.98)' : 'none', // Slightly scale down on mobile
          transformOrigin: 'top center'
        }}
      />
    </div>
  );
};

export default CanvasPreview;
