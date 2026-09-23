/**
 * Reads widget settings from the embedding <script> tag's data-* attributes.
 * Kept as a pure function (no DOM access) so it is trivial to unit-test.
 */
export interface WidgetConfig {
  widgetKey: string;
  apiUrl: string;
  title: string;
  color: string;
}

const DEFAULTS = {
  apiUrl: 'http://localhost:4000',
  title: 'Chat with us',
  color: '#3f51b5',
};

export function parseWidgetConfig(dataset: Record<string, string | undefined>): WidgetConfig {
  const widgetKey = dataset['widgetKey']?.trim();
  if (!widgetKey) {
    throw new Error('ConvoDesk widget: missing data-widget-key on the <script> tag');
  }
  const color = dataset['color'];
  return {
    widgetKey,
    apiUrl: (dataset['apiUrl'] ?? DEFAULTS.apiUrl).replace(/\/+$/, ''),
    title: dataset['title'] ?? DEFAULTS.title,
    // Only accept a plain hex colour so a bad attribute can't inject CSS.
    color: color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : DEFAULTS.color,
  };
}
