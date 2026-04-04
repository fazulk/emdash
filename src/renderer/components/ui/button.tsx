import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export interface ButtonContentWithSpinnerProps {
  children: React.ReactNode;
  loading: boolean;
  className?: string;
  contentClassName?: string;
  spinner?: React.ReactNode;
  spinnerClassName?: string;
  spinnerSize?: React.ComponentProps<typeof Spinner>['size'];
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);

function ButtonContentWithSpinner({
  children,
  loading,
  className,
  contentClassName,
  spinner,
  spinnerClassName,
  spinnerSize = 'sm',
}: ButtonContentWithSpinnerProps) {
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      <span
        className={cn('inline-flex items-center justify-center', loading && 'invisible', contentClassName)}
      >
        {children}
      </span>
      {loading ? (
        <span aria-hidden="true" className="absolute inset-0 inline-flex items-center justify-center">
          {spinner ?? <Spinner size={spinnerSize} className={spinnerClassName} />}
        </span>
      ) : null}
    </span>
  );
}

Button.displayName = 'Button';

export { Button, ButtonContentWithSpinner, buttonVariants };
