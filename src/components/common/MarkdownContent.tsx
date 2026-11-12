import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

interface MarkdownContentProps {
  content: string
  className?: string
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  className = ''
}) => {
  return (
    <div className={`text-base text-text/85 leading-relaxed font-sans ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // Safety: Disallow rendering of raw images as requested
          img: () => null,
          // Links open in new tab with security attributes
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-bright underline decoration-accent-bright/50 underline-offset-4 hover:decoration-accent-bright transition-colors font-normal"
              {...props}
            >
              {children}
            </a>
          ),
          // Headings in Syne 700 with distinct hierarchy
          h1: ({ children, ...props }) => (
            <h1
              className="font-syne font-bold text-2xl sm:text-3xl text-text mt-8 mb-4 tracking-tight first:mt-0"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="font-syne font-bold text-xl sm:text-2xl text-text mt-6 mb-3 tracking-tight first:mt-0"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="font-syne font-bold text-lg sm:text-xl text-text mt-5 mb-2.5 tracking-tight first:mt-0"
              {...props}
            >
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4
              className="font-syne font-bold text-base sm:text-lg text-text mt-4 mb-2 tracking-tight first:mt-0"
              {...props}
            >
              {children}
            </h4>
          ),
          h5: ({ children, ...props }) => (
            <h5
              className="font-syne font-bold text-sm sm:text-base text-text mt-3 mb-1.5 tracking-tight first:mt-0"
              {...props}
            >
              {children}
            </h5>
          ),
          h6: ({ children, ...props }) => (
            <h6
              className="font-syne font-bold text-xs sm:text-sm text-text uppercase tracking-wider mt-3 mb-1.5 first:mt-0"
              {...props}
            >
              {children}
            </h6>
          ),
          // Body paragraphs with DM Sans 300
          p: ({ children, ...props }) => (
            <p className="font-sans font-light mb-4 last:mb-0 leading-relaxed text-text/85" {...props}>
              {children}
            </p>
          ),
          // Lists with normal indent and spacing
          ul: ({ children, ...props }) => (
            <ul className="list-disc pl-6 mb-4 space-y-1.5 font-sans font-light text-text/85" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1.5 font-sans font-light text-text/85" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          // Blockquote with a thin left border
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-2 border-accent-bright/60 pl-4 py-1 my-4 italic text-muted font-sans font-light bg-surface-2/40 rounded-r-lg"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Code blocks and inline code in monospace
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName && typeof children === 'string' && !children.includes('\n')
            if (isInline) {
              return (
                <code
                  className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-2 border border-border text-accent-bright"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className="font-mono text-xs text-text block leading-normal" {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children, ...props }) => (
            <pre
              className="font-mono text-xs p-4 rounded-xl bg-surface-2 border border-border overflow-x-auto my-4 text-text"
              {...props}
            >
              {children}
            </pre>
          ),
          // Tables with thin borders and horizontal scroll on small screens
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-border">
              <table className="w-full text-left border-collapse text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-surface-2 border-b border-border text-xs font-mono uppercase tracking-wider text-muted" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-border text-text/85 font-sans font-light" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="hover:bg-surface-2/40 transition-colors" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th className="py-2.5 px-4 font-semibold text-text" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="py-2.5 px-4" {...props}>
              {children}
            </td>
          ),
          hr: ({ ...props }) => <hr className="border-border my-6" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
