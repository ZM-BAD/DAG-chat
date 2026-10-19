import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EnhancedMarkdown from '../src/components/EnhancedMarkdown';

describe('EnhancedMarkdown sanitization', () => {
  it('removes dangerous raw HTML while keeping safe content', () => {
    const content =
      '<img src=x onerror="alert(1)"><script>alert(2)</script>**safe**';
    const html = renderToStaticMarkup(
      React.createElement(EnhancedMarkdown, { content }),
    );

    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).toContain('safe');
  });
});
