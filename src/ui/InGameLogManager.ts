import { LogEntry, LogLevel } from './LogConsole.js';

interface LogConsoleSource {
  entries: LogEntry[];
  clear?: () => void;
}

/** Lightweight in-game log viewer with clipboard-friendly export controls. */
export class InGameLogManager {
  private root: HTMLElement;
  private list: HTMLElement;
  private search: HTMLInputElement;
  private source: LogConsoleSource;
  private refreshTimer: number | null = null;
  private visible = false;
  private lastRenderedCount = -1;

  constructor(source: LogConsoleSource) {
    this.source = source;
    this.root = document.createElement('section');
    this.root.id = 'in-game-log-manager';
    this.root.setAttribute('aria-label', 'Gerenciador de logs do jogo');
    this.root.style.cssText = [
      'position:fixed', 'z-index:100000', 'left:12px', 'right:12px', 'bottom:12px',
      'max-height:min(55vh,480px)', 'display:none', 'flex-direction:column',
      'background:rgba(5,13,25,.97)', 'color:#e8f4f0', 'border:1px solid #42d9c5',
      'border-radius:12px', 'box-shadow:0 12px 40px rgba(0,0,0,.55)',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'overflow:hidden', 'pointer-events:auto', 'padding-bottom:env(safe-area-inset-bottom)'
    ].join(';');

    const header = document.createElement('header');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px;background:#0d1f33;border-bottom:1px solid #1e3a4a';
    const title = document.createElement('strong');
    title.textContent = '📋 Logs do jogo';
    title.style.color = '#42d9c5';
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = 'Filtrar logs...';
    this.search.setAttribute('aria-label', 'Filtrar logs');
    this.search.style.cssText = 'flex:1;min-width:120px;padding:8px;border-radius:7px;border:1px solid #315066;background:#081426;color:#fff';
    this.search.addEventListener('input', () => this.render(true));

    const copyVisible = this.makeButton('Copiar exibidos', () => this.copy(this.filteredEntries()));
    const copyAll = this.makeButton('Copiar todos', () => this.copy(this.source.entries || []));
    const copyErrors = this.makeButton('Copiar erros', () => this.copy((this.source.entries || []).filter(entry => entry.level === LogLevel.Error)));
    const clear = this.makeButton('Limpar', () => {
      if (typeof this.source.clear === 'function') this.source.clear();
      else this.source.entries.length = 0;
      this.render(true);
    });
    const close = this.makeButton('Fechar', () => this.hide());
    close.setAttribute('aria-label', 'Fechar gerenciador de logs');
    header.append(title, this.search, copyVisible, copyAll, copyErrors, clear, close);

    this.list = document.createElement('div');
    this.list.setAttribute('role', 'log');
    this.list.setAttribute('aria-live', 'polite');
    this.list.style.cssText = 'overflow:auto;overscroll-behavior:contain;padding:8px;min-height:90px;white-space:pre-wrap;word-break:break-word;-webkit-overflow-scrolling:touch';
    this.root.append(header, this.list);
    document.body.appendChild(this.root);

    // F2 opens/closes the overlay; F3 is left available to the existing log console.
    document.addEventListener('keydown', event => {
      if (event.key === 'F2' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        this.toggle();
      }
    });
  }

  private makeButton(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'padding:8px 10px;border:1px solid #315066;border-radius:7px;background:#132b40;color:#e8f4f0;font-weight:600;cursor:pointer;min-height:36px';
    button.addEventListener('click', action);
    return button;
  }

  private filteredEntries(): LogEntry[] {
    const query = this.search.value.trim().toLowerCase();
    const entries = this.source.entries || [];
    return query ? entries.filter(entry => `${entry.level} ${entry.context || ''} ${entry.message} ${entry.stack || ''}`.toLowerCase().includes(query)) : entries;
  }

  private render(force = false): void {
    if (!this.visible) return;
    const entries = this.filteredEntries();
    if (!force && entries.length === this.lastRenderedCount) return;
    this.lastRenderedCount = entries.length;
    const fragment = document.createDocumentFragment();
    const visible = entries.slice(-200);
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.textContent = 'Nenhum log para exibir.';
      empty.style.color = '#94a3b8';
      fragment.appendChild(empty);
    } else {
      for (const entry of visible) {
        const row = document.createElement('div');
        const stamp = new Date(entry.timestamp).toLocaleTimeString();
        row.style.cssText = 'padding:5px 4px;border-bottom:1px solid rgba(49,80,102,.45)';
        const color = entry.level === LogLevel.Error ? '#f87171' : entry.level === LogLevel.Warn ? '#fbbf24' : entry.level === LogLevel.Debug ? '#94a3b8' : '#60a5fa';
        const meta = document.createElement('span');
        meta.textContent = `${stamp} [${entry.level.toUpperCase()}]${entry.context ? ` [${entry.context}]` : ''} `;
        meta.style.color = color;
        const message = document.createElement('span');
        message.textContent = entry.message + (entry.stack ? `\n${entry.stack}` : '');
        row.append(meta, message);
        fragment.appendChild(row);
      }
    }
    this.list.replaceChildren(fragment);
    if (this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 80) this.list.scrollTop = this.list.scrollHeight;
  }

  private async copy(entries: LogEntry[]): Promise<void> {
    const text = entries.map(entry => {
      const context = entry.context ? ` [${entry.context}]` : '';
      return `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}]${context} ${entry.message}${entry.stack ? `\n${entry.stack}` : ''}`;
    }).join('\n');
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;opacity:0;left:-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard indisponível neste navegador');
      }
      this.setStatus(`${entries.length} log(s) copiado(s).`);
    } catch (error) {
      this.setStatus(`Não foi possível copiar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setStatus(message: string): void {
    this.list.setAttribute('aria-label', message);
    const previous = this.root.querySelector('[data-copy-status]');
    previous?.remove();
    const status = document.createElement('div');
    status.dataset.copyStatus = 'true';
    status.textContent = message;
    status.style.cssText = 'padding:6px 10px;color:#42d9c5;background:#0d1f33';
    this.root.appendChild(status);
    window.setTimeout(() => status.remove(), 2500);
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'flex';
    this.lastRenderedCount = -1;
    this.render(true);
    if (this.refreshTimer === null) this.refreshTimer = window.setInterval(() => this.render(), 500);
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  toggle(): void {
    if (this.visible) this.hide(); else this.show();
  }

  destroy(): void {
    this.hide();
    this.root.remove();
  }
}
