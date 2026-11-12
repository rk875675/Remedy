import { Text, TextInput } from 'react-native';

/**
 * Ceiling for iOS Larger Text / Android font scale.
 * React Native uses the smaller of the phone's scale and this value.
 * Default text size (1.0) is unchanged. Anything above 1.15× is held there.
 */
const MAX_FONT_SIZE_MULTIPLIER = 1.15;

type JsxConfig = {
  maxFontSizeMultiplier?: number | null;
} | null;

type JsxFn = (type: unknown, config: JsxConfig, ...rest: unknown[]) => unknown;

type Runtime = {
  jsx?: JsxFn;
  jsxs?: JsxFn;
  jsxDEV?: JsxFn;
};

function wrap(type: unknown, config: JsxConfig): JsxConfig {
  if (type !== Text && type !== TextInput) return config;
  if (config != null && config.maxFontSizeMultiplier != null) return config;
  return { ...config, maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER };
}

const PATCHED = Symbol.for('remedy.fontScaleCap');

function install(mod: Runtime, key: 'jsx' | 'jsxs' | 'jsxDEV'): void {
  const orig = mod[key];
  if (orig == null || PATCHED in orig) return;
  const wrapped: JsxFn = (type, config, ...rest) => orig(type, wrap(type, config), ...rest);
  Object.defineProperty(wrapped, PATCHED, { value: true });
  mod[key] = wrapped;
}

// React 19 ignores defaultProps on Text and TextInput, so the cap is applied
// on the JSX runtime both components are created through.
const jsxRuntime = require('react/jsx-runtime') as Runtime;
const jsxDevRuntime = require('react/jsx-dev-runtime') as Runtime;

install(jsxRuntime, 'jsx');
install(jsxRuntime, 'jsxs');
install(jsxDevRuntime, 'jsxDEV');
