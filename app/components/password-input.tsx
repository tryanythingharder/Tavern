'use client';

import { useState, type InputHTMLAttributes } from 'react';

// 带「显示/隐藏」的密码框；表单仍按原生 name 提交，服务端 action 不受影响
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button type="button" className="pw-toggle" aria-label={shown ? '隐藏密码' : '显示密码'} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        {shown ? '隐藏' : '显示'}
      </button>
    </span>
  );
}
