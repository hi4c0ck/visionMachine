// Minimal dependency-free toast for validation/operation feedback.
// Renders a fixed bottom-right toast; auto-dismisses after 3.5s.

type ToastKind = 'error' | 'info' | 'success';

const TOAST_STYLE = `
  position: fixed; right: 16px; bottom: 16px; z-index: 10000;
  max-width: 340px; padding: 10px 14px; border-radius: 8px;
  font: 13px/1.4 var(--font-family, system-ui, sans-serif);
  color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.4);
  transition: opacity .3s ease; opacity: 1;
`;

const KIND_STYLE: Record<ToastKind, string> = {
  error: 'background:#b91c1c; border:1px solid #ef4444;',
  info: 'background:#1f2937; border:1px solid #4b5563;',
  success: 'background:#166534; border:1px solid #22c55e;',
};

export function flashToast(message: string, kind: ToastKind = 'error'): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.style.cssText = `${TOAST_STYLE} ${KIND_STYLE[kind]}`;
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => {
    el.style.opacity = '0';
    window.setTimeout(() => el.remove(), 350);
  }, 3500);
}
