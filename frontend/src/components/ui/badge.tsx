/**
 * badge.tsx — shadcn/ui Badge component.
 *
 * Provides semantic, color-coded inline label chips for status, severity,
 * and categorical indicators. Uses CVA for variant management so variants
 * can be extended or overridden via className.
 *
 * Variants:
 *   default    — primary solid (dark bg)
 *   secondary  — muted / neutral
 *   outline    — border only, transparent bg
 *   destructive — red family (errors, violations)
 *   success    — emerald / green (healthy, compliant, tagged)
 *   warning    — amber / yellow (at-risk, medium priority)
 *   critical   — red / rose (high-impact, unhealthy)
 *   info       — blue (informational, low priority)
 *
 * Usage:
 *   <Badge variant="success">Tagged</Badge>
 *   <Badge variant="critical">High</Badge>
 *   <Badge variant="warning">Medium</Badge>
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        outline:
          'border-border text-foreground bg-transparent',
        destructive:
          'border-transparent bg-destructive/15 text-destructive dark:bg-destructive/20',
        success:
          'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/20',
        warning:
          'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400 dark:bg-amber-500/20',
        critical:
          'border-transparent bg-red-500/15 text-red-700 dark:text-red-400 dark:bg-red-500/20',
        info:
          'border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400 dark:bg-blue-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
