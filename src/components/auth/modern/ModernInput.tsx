import React, { useState, forwardRef, useId, useEffect } from 'react';
import { Eye, EyeOff, LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ModernInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: LucideIcon;
  error?: string;
  success?: boolean;
  showPasswordToggle?: boolean;
  helpText?: string;
  placeholder?: string;
}

const ModernInput = forwardRef<HTMLInputElement, ModernInputProps>(
  ({ 
    label, 
    icon: Icon, 
    error, 
    success, 
    showPasswordToggle, 
    helpText, 
    type, 
    className,
    placeholder,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(false);
    const inputId = useId();

    const inputType = showPasswordToggle ? (showPassword ? 'text' : 'password') : type;
    const hasError = !!error;
    const hasSuccess = success && !hasError;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(e.target.value.length > 0);
      props.onChange?.(e);
    };

    // Check for initial value or value changes from props
    useEffect(() => {
      setHasValue((props.value?.toString() || props.defaultValue?.toString() || '').length > 0);
    }, [props.value, props.defaultValue]);

    return (
      <div className="space-y-2">
        <div className="relative">
          {/* Floating Label */}
          <label
            htmlFor={inputId}
            className={cn(
              "absolute left-3 transition-all duration-300 ease-out pointer-events-none",
              "transform-gpu", // Hardware acceleration
              (isFocused || hasValue) 
                ? "top-2 text-xs text-primary font-medium scale-90" 
                : "top-1/2 -translate-y-1/2 text-muted-foreground scale-100",
              Icon && !isFocused && !hasValue && "left-10"
            )}
          >
            {label}
          </label>

          {/* Left Icon */}
          {Icon && (
            <div className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
              "transform-gpu", // Hardware acceleration
              isFocused ? "text-primary scale-105" : "text-muted-foreground scale-100",
              (isFocused || hasValue) && "top-7"
            )}>
              <Icon className="h-4 w-4" />
            </div>
          )}

          {/* Input Field */}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            placeholder={placeholder}
            className={cn(
              "w-full px-3 pt-6 pb-2 border rounded-lg transition-all duration-300 ease-out",
              "bg-background text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "hover:border-primary/50 hover:shadow-sm",
              "transform-gpu", // Hardware acceleration
              isFocused && "shadow-md shadow-primary/10 scale-[1.01]",
              Icon && "pl-10",
              showPasswordToggle && "pr-10",
              hasError && "border-destructive focus:border-destructive focus:ring-destructive/20 animate-pulse",
              hasSuccess && "border-green-500 focus:border-green-500 focus:ring-green-500/20",
              // Dynamic placeholder styling based on focus state
              isFocused || hasValue 
                ? "placeholder:text-muted-foreground/40 placeholder:text-xs" 
                : "placeholder:text-muted-foreground/60 placeholder:text-sm",
              className
            )}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              setHasValue(e.target.value.length > 0);
              props.onBlur?.(e);
            }}
            onChange={handleInputChange}
            {...props}
          />

          {/* Password Toggle */}
          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={cn(
                "absolute right-3 transition-all duration-300 ease-out",
                "text-muted-foreground hover:text-foreground hover:scale-110",
                "transform-gpu active:scale-95", // Hardware acceleration + click animation
                (isFocused || hasValue) ? "top-6" : "top-1/2 -translate-y-1/2"
              )}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 transition-transform duration-200" />
              ) : (
                <Eye className="h-4 w-4 transition-transform duration-200" />
              )}
            </button>
          )}

          {/* Success Indicator */}
          {hasSuccess && (
            <div className={cn(
              "absolute right-3 transition-all duration-300 ease-out animate-in fade-in scale-in",
              "transform-gpu", // Hardware acceleration
              (isFocused || hasValue) ? "top-6" : "top-1/2 -translate-y-1/2",
              showPasswordToggle && "right-10"
            )}>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            </div>
          )}
        </div>

        {/* Help Text or Error */}
        {(error || helpText) && (
          <div
            role={hasError ? 'alert' : undefined}
            className={cn(
            "text-xs transition-all duration-300 ease-out animate-in slide-in-from-top-1",
            "transform-gpu", // Hardware acceleration
            hasError ? "text-destructive animate-pulse" : "text-muted-foreground"
          )}>
            {error || helpText}
          </div>
        )}
      </div>
    );
  }
);

ModernInput.displayName = "ModernInput";

export { ModernInput };