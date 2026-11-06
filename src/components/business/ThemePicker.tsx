import React, { useState } from 'react';
import { BusinessTheme, DEFAULT_BUSINESS_THEME, PRESET_THEMES } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, Check, Edit3 } from 'lucide-react';

interface ThemePickerProps {
  currentTheme?: BusinessTheme;
  onThemeChange: (theme: BusinessTheme) => void;
}

const ThemePicker = ({ currentTheme = DEFAULT_BUSINESS_THEME, onThemeChange }: ThemePickerProps) => {
  const [customMode, setCustomMode] = useState(false);
  const [customTheme, setCustomTheme] = useState<BusinessTheme>(currentTheme);

  const handlePresetSelect = (presetKey: string) => {
    const theme = PRESET_THEMES[presetKey];
    onThemeChange(theme);
    setCustomMode(false);
  };

  const handleCustomColorChange = (colorKey: keyof BusinessTheme, value: string) => {
    const updatedTheme = { ...customTheme, [colorKey]: value };
    setCustomTheme(updatedTheme);
  };

  const applyCustomTheme = () => {
    onThemeChange(customTheme);
    setCustomMode(false);
  };

  const isCurrentTheme = (theme: BusinessTheme): boolean => {
    if (!currentTheme) return false;
    
    // Compare individual properties instead of JSON.stringify to avoid property order issues
    const isMatch = (
      theme.primary === currentTheme.primary &&
      theme.secondary === currentTheme.secondary &&
      theme.accent === currentTheme.accent &&
      theme.text === currentTheme.text &&
      theme.textLight === currentTheme.textLight &&
      theme.background === currentTheme.background &&
      theme.surface === currentTheme.surface
    );
    
    
    return isMatch;
  };

  const ThemePreview = ({ theme, name }: { theme: BusinessTheme; name: string }) => (
    <div className="relative">
      <div 
        className={`w-full h-20 rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:scale-105 ${
          isCurrentTheme(theme) ? 'ring-2 ring-offset-2' : ''
        }`}
        style={{ 
          borderColor: isCurrentTheme(theme) ? theme.primary : '#e5e7eb',
          boxShadow: isCurrentTheme(theme) ? `0 0 0 2px ${theme.primary}` : undefined
        }}
        onClick={() => handlePresetSelect(name)}
      >
        {/* Header */}
        <div 
          className="h-6" 
          style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}
        />
        {/* Content area */}
        <div className="flex h-14 p-2" style={{ backgroundColor: theme.surface }}>
          <div className="flex-1">
            <div className="w-16 h-2 rounded mb-1" style={{ backgroundColor: theme.text + '40' }} />
            <div className="w-12 h-1 rounded" style={{ backgroundColor: theme.textLight + '60' }} />
          </div>
          <div className="w-8 h-8 rounded" style={{ backgroundColor: theme.primary + '20' }} />
        </div>
      </div>
      {isCurrentTheme(theme) && (
        <div 
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-lg" 
          style={{ backgroundColor: theme.primary }}
        >
          <Check className="w-3 h-3 text-white font-bold" />
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Invoice Theme
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Customize the colors used in your invoice templates
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preset Themes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium">Preset Themes</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomMode(!customMode)}
              className="flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Custom Colors
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(PRESET_THEMES).map(([key, theme]) => (
              <div key={key} className="space-y-2">
                <ThemePreview theme={theme} name={key} />
                <div className="text-center">
                  <Badge variant="secondary" className="capitalize text-xs">
                    {key}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Theme Editor */}
        {customMode && (
          <div className="border-t pt-6">
            <h4 className="font-medium mb-4">Custom Theme Colors</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTheme.primary}
                    onChange={(e) => handleCustomColorChange('primary', e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customTheme.primary}
                    onChange={(e) => handleCustomColorChange('primary', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="#3B82F6"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTheme.secondary}
                    onChange={(e) => handleCustomColorChange('secondary', e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customTheme.secondary}
                    onChange={(e) => handleCustomColorChange('secondary', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="#06B6D4"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTheme.accent}
                    onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customTheme.accent}
                    onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="#10B981"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Text Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTheme.text}
                    onChange={(e) => handleCustomColorChange('text', e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customTheme.text}
                    onChange={(e) => handleCustomColorChange('text', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="#111827"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Light Text Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTheme.textLight}
                    onChange={(e) => handleCustomColorChange('textLight', e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customTheme.textLight}
                    onChange={(e) => handleCustomColorChange('textLight', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="#6B7280"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTheme.background}
                    onChange={(e) => handleCustomColorChange('background', e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customTheme.background}
                    onChange={(e) => handleCustomColorChange('background', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="#F9FAFB"
                  />
                </div>
              </div>
            </div>

            {/* Custom Theme Preview */}
            <div className="mt-6">
              <h5 className="font-medium mb-3">Preview</h5>
              <div className="max-w-xs">
                <ThemePreview theme={customTheme} name="custom" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={applyCustomTheme}>Apply Custom Theme</Button>
              <Button variant="outline" onClick={() => setCustomMode(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ThemePicker;