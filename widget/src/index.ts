import { parseWidgetConfig } from './config';

/**
 * Widget entry point. Phase 1 only resolves config and renders the launcher button;
 * the chat panel and Socket.IO connection are built in Phase 5.
 */
function boot(): void {
  // `currentScript` works for the classic <script> embed; module scripts (Vite dev) need the fallback.
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-widget-key]');
  if (!script) return;

  let config;
  try {
    config = parseWidgetConfig({ ...script.dataset });
  } catch (err) {
    console.error(err);
    return;
  }

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.textContent = config.title;
  launcher.setAttribute('aria-label', config.title);
  Object.assign(launcher.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    padding: '12px 18px',
    border: 'none',
    borderRadius: '24px',
    background: config.color,
    color: '#fff',
    font: '500 14px system-ui, sans-serif',
    cursor: 'pointer',
    zIndex: '2147483000',
  });
  document.body.appendChild(launcher);
}

boot();
