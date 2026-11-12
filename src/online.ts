export interface RoomClientInfo {
  name: string;
  connected: boolean;
}

export interface RoomState {
  code: string;
  you: 0 | 1;
  clients: (RoomClientInfo | null)[];
  started: boolean;
}

export interface OnlineStart {
  seed: number;
  you: 0 | 1;
  names: [string, string];
  code: string;
}

export class OnlineClient {
  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private closedByUser = false;

  onRoom: ((room: RoomState) => void) | null = null;
  onStart: ((start: OnlineStart) => void) | null = null;
  onRelay: ((payload: unknown) => void) | null = null;
  onPeerLeft: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onStatus: ((status: string) => void) | null = null;

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.closedByUser = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    const url = `${protocol}//${host}/ws`;
    this.onStatus?.('正在连接联机服务…');

    this.connecting = new Promise<void>((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (error) {
        reject(error);
        return;
      }
      this.ws = ws;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // Ignore.
        }
        reject(new Error('连接超时'));
      }, 6000);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.onStatus?.('已连接');
        resolve();
      };
      ws.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (message.type === 'room') {
          this.onRoom?.(message as unknown as RoomState);
        } else if (message.type === 'start') {
          this.onStart?.(message as unknown as OnlineStart);
        } else if (message.type === 'relay') {
          this.onRelay?.(message.payload);
        } else if (message.type === 'peer-left') {
          this.onPeerLeft?.();
        } else if (message.type === 'error') {
          this.onError?.(String(message.message || '联机服务返回了一个错误'));
        }
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('无法连接联机服务'));
      };
      ws.onclose = () => {
        this.ws = null;
        this.connecting = null;
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('连接已关闭'));
        }
        if (!this.closedByUser) {
          this.onStatus?.('连接已断开');
          this.onClose?.();
        }
      };
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  createRoom(name: string): void {
    this.send({ type: 'create', name });
  }

  joinRoom(code: string, name: string): void {
    this.send({ type: 'join', code, name });
  }

  startMatch(): void {
    this.send({ type: 'start' });
  }

  sendPayload(payload: unknown): void {
    this.send({ type: 'relay', payload });
  }

  leave(): void {
    this.send({ type: 'leave' });
    this.close();
  }

  close(): void {
    this.closedByUser = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore.
      }
    }
    this.ws = null;
    this.connecting = null;
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.onError?.('还没有连上联机服务，请稍后再试。');
    }
  }
}
