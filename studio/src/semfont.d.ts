declare module 'semfont' {
  import type { ComponentType, ReactNode } from 'react';
  export const SemanticText: ComponentType<{
    text?: string;
    children?: ReactNode;
    theme?: 'editorial' | 'loud' | 'monochrome' | 'technical' | object;
    lexicon?: Record<string, Record<string, number>>;
    sensitivity?: number;
    channels?: string[];
    as?: string;
    className?: string;
  }>;
}
