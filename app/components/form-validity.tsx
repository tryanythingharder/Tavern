'use client';

import { useEffect } from 'react';
import { tr } from '@/lib/i18n/runtime';

// 全站表单校验提示：拦下浏览器自带的气泡（invalid 事件 preventDefault），
// 在字段下方显示站内样式的提示，并聚焦第一个没填好的字段。表单仍然走原生 required/minLength 等约束。

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function message(el: Field): string {
  const v = el.validity;
  const isCheck = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
  if (v.valueMissing) return isCheck ? tr('请先勾选此项') : tr('请填写此项');
  if (v.typeMismatch && el instanceof HTMLInputElement && el.type === 'email') return tr('邮箱格式不对');
  if (v.typeMismatch && el instanceof HTMLInputElement && el.type === 'url') return tr('链接格式不对');
  if (v.tooShort && 'minLength' in el) return tr('至少 {n} 个字符', { n: el.minLength });
  if (v.tooLong && 'maxLength' in el) return tr('最多 {n} 个字符', { n: el.maxLength });
  if (v.rangeUnderflow && 'min' in el) return tr('不能小于 {n}', { n: el.min });
  if (v.rangeOverflow && 'max' in el) return tr('不能大于 {n}', { n: el.max });
  if (v.patternMismatch) return el.title || tr('格式不对');
  return el.validationMessage || tr('请检查此项');
}

// 提示放在字段所在的那一块后面（输入框外层、勾选框标签），没有外层就放在字段后面
function anchor(el: Field): Element {
  return el.closest('.p-auth-field, .p-field, .p-check, .ui-field, label') ?? el;
}

function clear(el: Field) {
  el.removeAttribute('aria-invalid');
  const id = el.getAttribute('data-invalid-msg');
  if (id) {
    document.getElementById(id)?.remove();
    const rest = (el.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x && x !== id).join(' ');
    if (rest) el.setAttribute('aria-describedby', rest); else el.removeAttribute('aria-describedby');
  }
  el.removeAttribute('data-invalid-msg');
}

let seq = 0;
let lastFocus = 0;

export function FormValidity() {
  useEffect(() => {
    const onInvalid = (e: Event) => {
      const el = e.target as Field;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
      e.preventDefault();
      clear(el);
      const id = `fv-${++seq}`;
      const p = document.createElement('p');
      p.id = id;
      p.className = 'ui-invalid-msg';
      p.setAttribute('role', 'alert');
      p.textContent = message(el);
      anchor(el).insertAdjacentElement('afterend', p);
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('data-invalid-msg', id);
      const prev = el.getAttribute('aria-describedby');
      if (!prev?.includes(id)) el.setAttribute('aria-describedby', [prev, id].filter(Boolean).join(' '));
      // 一次提交会对每个没填好的字段各触发一次：只聚焦第一个
      const now = Date.now();
      if (now - lastFocus > 300) { lastFocus = now; el.focus({ preventScroll: false }); }
    };
    const onEdit = (e: Event) => {
      const el = e.target as Field;
      if (el?.getAttribute?.('data-invalid-msg') && el.validity?.valid) clear(el);
    };
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
    };
  }, []);
  return null;
}
