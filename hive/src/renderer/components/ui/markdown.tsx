import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  // Ensure children is always a string to prevent React rendering errors
  const content = typeof children === 'string'
    ? children
    : (children && typeof children === 'object')
      ? JSON.stringify(children)
      : String(children ?? '');

  if (!content) return null;

  return (
    <div className={cn('text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Headers
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold mt-3 mb-2 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-medium mt-2 mb-1 text-[var(--foreground-muted)] first:mt-0">{children}</h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="my-1.5 leading-relaxed">{children}</p>
        ),
        // Strong/bold
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        // Code
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)] font-mono text-xs">
                {children}
              </code>
            );
          }
          return (
            <code className={cn('block p-3 rounded bg-[var(--secondary)] font-mono text-xs overflow-auto', className)} {...props}>
              {children}
            </code>
          );
        },
        // Pre (code blocks)
        pre: ({ children }) => (
          <pre className="my-2 rounded bg-[var(--secondary)] overflow-auto">
            {children}
          </pre>
        ),
        // Tables
        table: ({ children }) => (
          <table className="w-full my-2 text-sm border-collapse">
            {children}
          </table>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-[var(--border)]">
            {children}
          </thead>
        ),
        tbody: ({ children }) => (
          <tbody>{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="border-b border-[var(--border)] last:border-0">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="text-left py-1.5 pr-4 font-medium text-[var(--foreground-muted)]">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="py-1.5 pr-4">{children}</td>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-[var(--primary)] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="my-2 pl-3 border-l-2 border-[var(--border)] text-[var(--foreground-muted)] italic">
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => (
          <hr className="my-3 border-[var(--border)]" />
        ),
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
