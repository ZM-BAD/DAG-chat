import { describe, expect, it } from 'vitest';
import { SSEParser } from '../src/utils/sseParser';

describe('SSEParser', () => {
  it('parses a complete event', () => {
    const parser = new SSEParser();
    expect(parser.push('data: {"content":"hello"}\n\n')).toEqual([
      { data: '{"content":"hello"}' },
    ]);
  });

  it('buffers an event split across chunks', () => {
    const parser = new SSEParser();
    expect(parser.push('data: {"content":"hel')).toEqual([]);
    expect(parser.push('lo"}\n\n')).toEqual([{ data: '{"content":"hello"}' }]);
  });

  it('parses multiple events from one chunk', () => {
    const parser = new SSEParser();
    expect(
      parser.push('data: {"content":"a"}\n\ndata: {"content":"b"}\n\n'),
    ).toEqual([{ data: '{"content":"a"}' }, { data: '{"content":"b"}' }]);
  });

  it('supports CRLF boundaries', () => {
    const parser = new SSEParser();
    expect(parser.push('data: first\r\n\r\ndata: second\r\n\r\n')).toEqual([
      { data: 'first' },
      { data: 'second' },
    ]);
  });

  it('joins multiple data lines', () => {
    const parser = new SSEParser();
    expect(parser.push('data: one\ndata: two\n\n')).toEqual([
      { data: 'one\ntwo' },
    ]);
  });

  it('flushes a final frame without a blank line', () => {
    const parser = new SSEParser();
    expect(parser.push('data: final')).toEqual([]);
    expect(parser.flush()).toEqual([{ data: 'final' }]);
  });

  it('ignores comments and empty frames', () => {
    const parser = new SSEParser();
    expect(parser.push(': keepalive\n\ndata: value\n\n')).toEqual([
      { data: 'value' },
    ]);
  });
});
