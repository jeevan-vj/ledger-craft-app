import React from 'react';
import { Loader2, LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ModernButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const ModernButton = React.forwardRef<HTMLButtonElement, ModernButtonProps>(
  ({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconPosition = 'left',
    fullWidth = false,
    className,
    disabled,
    ...props
  }, ref) => {
    const isDisabled = disabled || loading;

    const baseClasses = cn(
      "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
      "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-[0.45] active:scale-[0.98]",
      fullWidth && "w-full"
    );

    const variantClasses = {
      primary: cn(
        "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md"
      ),
      secondary: cn(
        "bg-secondary text-secondary-foreground hover:bg-muted"
      ),
      outline: cn(
        "border border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
      ),
      ghost: cn(
        "text-foreground hover:bg-muted"
      )
    };

    const sizeClasses = {
      sm: "h-9 px-4 text-sm",
      md: "h-10 px-5 text-sm",
      lg: "h-11 px-8 text-base"
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {/* Left Icon or Loading Spinner */}
        {(Icon && iconPosition === 'left' && !loading) && (
          <Icon aria-hidden="true" className={cn(
            "flex-shrink-0",
            size === 'sm' ? "h-3 w-3" : "h-4 w-4",
          )} />
        )}
        
        {loading && (
          <Loader2 aria-hidden="true" className={cn(
            "animate-spin flex-shrink-0",
            size === 'sm' ? "h-3 w-3" : "h-4 w-4",
          )} />
        )}

        {/* Button Text */}
        {children && (
          <span>
            {children}
          </span>
        )}

        {/* Right Icon */}
        {(Icon && iconPosition === 'right' && !loading) && (
          <Icon aria-hidden="true" className={cn(
            "flex-shrink-0",
            size === 'sm' ? "h-3 w-3" : "h-4 w-4",
          )} />
        )}
      </button>
    );
  }
);

ModernButton.displayName = "ModernButton";

export { ModernButton };
