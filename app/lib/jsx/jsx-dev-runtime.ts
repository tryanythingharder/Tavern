import * as runtime from 'react/jsx-dev-runtime';
export type { JSX } from 'react/jsx-dev-runtime';
import { translateProps } from './translate-props';

export const Fragment = runtime.Fragment;
export function jsxDEV(type: any, props: any, key: any, isStatic: any, source: any, self: any) {
  return (runtime as any).jsxDEV(type, translateProps(type, props), key, isStatic, source, self);
}
