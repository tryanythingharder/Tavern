import * as runtime from 'react/jsx-runtime';
export type { JSX } from 'react/jsx-runtime';
import { translateProps } from './translate-props';

export const Fragment = runtime.Fragment;
export function jsx(type: any, props: any, key?: any) {
  return (runtime as any).jsx(type, translateProps(type, props), key);
}
export function jsxs(type: any, props: any, key?: any) {
  return (runtime as any).jsxs(type, translateProps(type, props), key);
}
