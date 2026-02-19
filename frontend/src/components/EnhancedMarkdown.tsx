import React, {
  FC,
  useMemo,
  ReactNode,
  HTMLAttributes,
  InputHTMLAttributes,
  TableHTMLAttributes,
} from 'react';
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

// CodeBlock 组件的属性接口
interface CodeBlockProps extends HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

// 提取代码高亮组件以避免重复渲染
const CodeBlock: FC<CodeBlockProps> = ({
  inline,
  className,
  children,
  ...props
}) => {
  const match = /language-(\w+)/.exec(className || '');

  if (!inline && match) {
    return (
      <SyntaxHighlighter
        // @ts-expect-error - vscDarkPlus style type is incompatible with expected type
        style={vscDarkPlus}
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
        {typeof children === 'string' ? children.replace(/\n$/, '') : ''}
      </SyntaxHighlighter>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

// 标题组件的属性接口
interface HeadingWithAnchorProps extends HTMLAttributes<HTMLHeadingElement> {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
  id?: string;
}

// 通用标题组件，减少重复代码
const HeadingWithAnchor: FC<HeadingWithAnchorProps> = ({
  level,
  children,
  id,
  ...props
}) => {
  const tagName = `h${String(level)}` as
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6';

  return React.createElement(
    tagName,
    { id, ...props },
    <a
      href={`#${id ?? ''}`}
      className="anchor-link"
      aria-label="Link to this section"
    >
      {children}
    </a>,
  );
};

// 表格包装组件的属性接口
type TableWrapperProps = TableHTMLAttributes<HTMLTableElement>;

// 表格包装组件
const TableWrapper: FC<TableWrapperProps> = ({ children, ...props }) => (
  <div className="table-wrapper">
    <table {...props}>{children}</table>
  </div>
);

// 复选框组件的属性接口
interface TaskCheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
}

// 复选框组件
const TaskCheckbox: FC<TaskCheckboxProps> = ({ checked, ...props }) => (
  <input
    type="checkbox"
    checked={checked}
    readOnly
    style={{ marginRight: '0.5em' }}
    {...props}
  />
);

// h1-h6 组件的属性接口
type HeadingProps = Omit<HeadingWithAnchorProps, 'level'>;

// Input 组件处理函数的属性接口
interface InputComponentProps extends InputHTMLAttributes<HTMLInputElement> {
  type?: string;
}

const EnhancedMarkdown: FC<EnhancedMarkdownProps> = ({
  content,
  className = 'markdown-content',
}) => {
  // 配置组件，避免每次渲染都重新创建对象
  const components = useMemo(
    () => ({
      code: CodeBlock,
      table: TableWrapper,
      h1: (props: HeadingProps) => <HeadingWithAnchor level={1} {...props} />,
      h2: (props: HeadingProps) => <HeadingWithAnchor level={2} {...props} />,
      h3: (props: HeadingProps) => <HeadingWithAnchor level={3} {...props} />,
      h4: (props: HeadingProps) => <HeadingWithAnchor level={4} {...props} />,
      h5: (props: HeadingProps) => <HeadingWithAnchor level={5} {...props} />,
      h6: (props: HeadingProps) => <HeadingWithAnchor level={6} {...props} />,
      input: (props: InputComponentProps) =>
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
