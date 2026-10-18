import { Children, createElement, isValidElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { CodeBlock } from '../components/CodeBlock';
import { FileRef } from '../components/FileRef';
import { linkifyCode, parseFileRef, type LinkContextValue } from './links';

export function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

// How code looks wherever markdown is shown: file references as chips, fenced blocks as cards.
export function codeComponents(ctx: LinkContextValue): Pick<Components, 'code' | 'pre'> {
  return {
    code: ({ className, children }) => {
      // Inline code only: a fenced block carries a language or ends with a newline.
      const text = typeof children === 'string' && !className && !children.includes('\n') ? children : '';
      if (text && parseFileRef(text)) return <FileRef text={text} href={linkifyCode(text, ctx)} />;
      const url = text ? linkifyCode(text, ctx) : null;
      const code = createElement('code', { className }, children);
      return url ? <a href={url} target="_blank" rel="noreferrer" className="no-underline hover:underline">{code}</a> : code;
    },
    pre: ({ children }) => {
      const first = Children.toArray(children)[0];
      const className = isValidElement<{ className?: string }>(first) ? first.props.className ?? '' : '';
      return <CodeBlock lang={className.match(/language-([\w+-]+)/)?.[1] ?? null} text={textOf(children).replace(/\n$/, '')}>{children}</CodeBlock>;
    },
  };
}
