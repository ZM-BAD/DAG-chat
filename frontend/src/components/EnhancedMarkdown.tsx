import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import 'katex/dist/katex.min.css';

interface EnhancedMarkdownProps {
  content: string;
  className?: string;
}

// 提取代码高亮组件以避免重复渲染
const CodeBlock: React.FC<any> = ({
  inline,
  className,
  children,
  ...props
}) => {
  const match = /language-(\w+)/.exec(className || '');

  if (!inline && match) {
    return (
      <SyntaxHighlighter
        style={vscDarkPlus as any}
        language={match[1]}
        PreTag="div"
        customStyle={{
          margin: '1em 0',
          borderRadius: '6px',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

// 通用标题组件，减少重复代码
const HeadingWithAnchor: React.FC<{
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  id?: string;
  [key: string]: any;
}> = ({ level, children, id, ...props }) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <Tag id={id} {...props}>
      <a
        href={`#${id}`}
        className="anchor-link"
        aria-label="Link to this section"
      >
        {children}
      </a>
    </Tag>
  );
};

// 表格包装组件
const TableWrapper: React.FC<any> = ({ children }) => (
  <div className="table-wrapper">
    <table>{children}</table>
  </div>
);

// 复选框组件
const TaskCheckbox: React.FC<{ checked?: boolean; [key: string]: any }> = ({
  checked,
  ...props
}) => (
  <input
    type="checkbox"
    checked={checked}
    readOnly
    style={{ marginRight: '0.5em' }}
    {...props}
  />
);

const EnhancedMarkdown: React.FC<EnhancedMarkdownProps> = ({
  content,
  className = 'markdown-content',
}) => {
  // 配置组件，避免每次渲染都重新创建对象
  const components = React.useMemo(
    () => ({
      code: CodeBlock,
      table: TableWrapper,
      h1: (props: any) => <HeadingWithAnchor level={1} {...props} />,
      h2: (props: any) => <HeadingWithAnchor level={2} {...props} />,
      h3: (props: any) => <HeadingWithAnchor level={3} {...props} />,
      h4: (props: any) => <HeadingWithAnchor level={4} {...props} />,
      h5: (props: any) => <HeadingWithAnchor level={5} {...props} />,
      h6: (props: any) => <HeadingWithAnchor level={6} {...props} />,
      input: (props: any) =>
        props.type === 'checkbox' ? (
          <TaskCheckbox {...props} />
        ) : (
          <input {...props} />
        ),
    }),
    [],
  );

  return (
    <div className={className}>
      <ReactMarkdown
        rehypePlugins={[
          rehypeRaw,
          rehypeKatex,
          [
            rehypeAutolinkHeadings,
            {
              behavior: 'wrap' as const,
              properties: {
                className: ['anchor-link'],
                ariaLabel: 'Link to this section',
              },
            },
          ],
        ]}
        remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default EnhancedMarkdown;
