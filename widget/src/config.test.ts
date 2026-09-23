import { describe, expect, it } from 'vitest';
import { parseWidgetConfig } from './config';

describe('parseWidgetConfig', () => {
  it('requires a widget key', () => {
    expect(() => parseWidgetConfig({})).toThrow(/data-widget-key/);
  });

  it('applies defaults and trims a trailing slash from the API url', () => {
    const cfg = parseWidgetConfig({ widgetKey: 'wk_123', apiUrl: 'https://api.example.com/' });
    expect(cfg).toMatchObject({
      widgetKey: 'wk_123',
      apiUrl: 'https://api.example.com',
      title: 'Chat with us',
    });
  });

  it('ignores a colour that is not a hex value (prevents CSS injection)', () => {
    const cfg = parseWidgetConfig({ widgetKey: 'wk_1', color: 'red;background:url(x)' });
    expect(cfg.color).toBe('#3f51b5');
  });
});
