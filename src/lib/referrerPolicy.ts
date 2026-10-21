/** Stop the browser sending the public document URL, including its share token, as Referer. */
export function applyNoReferrerPolicy(): () => void {
  const existing = document.querySelector('meta[name="referrer"]');
  const meta = existing ?? document.createElement('meta');
  const created = existing == null;
  const previous = meta.getAttribute('content');
  meta.setAttribute('name', 'referrer');
  meta.setAttribute('content', 'no-referrer');
  if (created) document.head.appendChild(meta);
  return () => {
    if (created) {
      meta.remove();
      return;
    }
    if (previous == null) meta.removeAttribute('content');
    else meta.setAttribute('content', previous);
  };
}
