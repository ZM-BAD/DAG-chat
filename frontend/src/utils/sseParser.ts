export interface SSEFrame {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

/** Incremental parser for Server-Sent Events frames. */
export class SSEParser {
  private buffer = '';

  push(chunk: string): SSEFrame[] {
    this.buffer += chunk;
    const frames: SSEFrame[] = [];

    for (;;) {
      const boundary = this.buffer.match(/\r?\n\r?\n/);
      if (boundary === null || boundary.index === undefined) break;

      const rawFrame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const frame = this.parseFrame(rawFrame);
      if (frame) frames.push(frame);
    }

    return frames;
  }

  flush(): SSEFrame[] {
    if (this.buffer.length === 0) return [];
    const rawFrame = this.buffer;
    this.buffer = '';
    const frame = this.parseFrame(rawFrame);
    return frame ? [frame] : [];
  }

  private parseFrame(rawFrame: string): SSEFrame | null {
    const dataLines: string[] = [];
    let event: string | undefined;
    let id: string | undefined;
    let retry: number | undefined;

    for (const line of rawFrame.split(/\r?\n/)) {
      if (line === '' || line.startsWith(':')) continue;
      const separator = line.indexOf(':');
      const field = separator === -1 ? line : line.slice(0, separator);
      let value = separator === -1 ? '' : line.slice(separator + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'data') dataLines.push(value);
      else if (field === 'event') event = value;
      else if (field === 'id') id = value;
      else if (field === 'retry') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) retry = parsed;
      }
    }

    if (dataLines.length === 0) return null;
    return {
      data: dataLines.join('\n'),
      ...(event === undefined ? {} : { event }),
      ...(id === undefined ? {} : { id }),
      ...(retry === undefined ? {} : { retry }),
    };
  }
}
