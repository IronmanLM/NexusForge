import { Fragment, ReactNode } from 'react';

type DiscordMarkdownProps = {
  content: string;
  className?: string;
  inline?: boolean;
};

type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'underline'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; label: string; href: string };

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*)/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    if (match[2] && match[3]) {
      tokens.push({ type: 'link', label: match[2], href: match[3] });
    } else if (match[4]) {
      tokens.push({ type: 'strong', value: match[4] });
    } else if (match[5]) {
      tokens.push({ type: 'underline', value: match[5] });
    } else if (match[6]) {
      tokens.push({ type: 'strike', value: match[6] });
    } else if (match[7]) {
      tokens.push({ type: 'code', value: match[7] });
    } else if (match[8]) {
      tokens.push({ type: 'em', value: match[8] });
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return parseInline(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.type) {
      case 'strong':
        return <strong key={key}>{token.value}</strong>;
      case 'em':
        return <em key={key}>{token.value}</em>;
      case 'underline':
        return <u key={key}>{token.value}</u>;
      case 'strike':
        return <s key={key}>{token.value}</s>;
      case 'code':
        return <code key={key}>{token.value}</code>;
      case 'link':
        return (
          <a key={key} href={token.href} target="_blank" rel="noreferrer">
            {token.label}
          </a>
        );
      case 'text':
      default:
        return <Fragment key={key}>{token.value}</Fragment>;
    }
  });
}

function renderParagraph(text: string, key: string) {
  return (
    <p key={key}>
      {text.split('\n').map((line, lineIndex) => (
        <Fragment key={`${key}-line-${lineIndex}`}>
          {lineIndex > 0 ? <br /> : null}
          {renderInline(line, `${key}-inline-${lineIndex}`)}
        </Fragment>
      ))}
    </p>
  );
}

export default function DiscordMarkdown({ content, className, inline = false }: DiscordMarkdownProps) {
  if (inline) {
    return <span className={['discord-markdown', 'discord-markdown--inline', className].filter(Boolean).join(' ')}>{renderInline(String(content || ''), 'inline')}</span>;
  }

  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let quoteBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }
    const text = paragraphBuffer.join('\n').trim();
    if (text) {
      blocks.push(renderParagraph(text, `paragraph-${blocks.length}`));
    }
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }
    const Tag = listBuffer.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`list-${blocks.length}`}>
        {listBuffer.items.map((item, index) => (
          <li key={`list-item-${index}`}>{renderInline(item, `list-${blocks.length}-${index}`)}</li>
        ))}
      </Tag>
    );
    listBuffer = null;
  };

  const flushQuote = () => {
    if (quoteBuffer.length === 0) {
      return;
    }
    const text = quoteBuffer.join('\n').trim();
    if (text) {
      blocks.push(<blockquote key={`quote-${blocks.length}`}>{renderParagraph(text, `quote-paragraph-${blocks.length}`)}</blockquote>);
    }
    quoteBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    const quoteMatch = line.match(/^>\s?(.+)$/);

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      if (level === 1) {
        blocks.push(<h1 key={`heading-${blocks.length}`}>{renderInline(title, `heading-${blocks.length}`)}</h1>);
      } else if (level === 2) {
        blocks.push(<h2 key={`heading-${blocks.length}`}>{renderInline(title, `heading-${blocks.length}`)}</h2>);
      } else {
        blocks.push(<h3 key={`heading-${blocks.length}`}>{renderInline(title, `heading-${blocks.length}`)}</h3>);
      }
      continue;
    }

    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(orderedMatch);
      const item = unorderedMatch?.[1] || orderedMatch?.[1] || '';
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push(item);
      continue;
    }

    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteBuffer.push(quoteMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();

  return <div className={['discord-markdown', className].filter(Boolean).join(' ')}>{blocks}</div>;
}
