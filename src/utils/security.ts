/** All pass views encode only this opaque, non-authoritative reference. */
export function badgeReference(visitor: {badgeId: string}): string {
  return `SECUREPASS-REFERENCE:${visitor.badgeId}`;
}

/** Quote every cell and prevent formula interpretation, including prefixed controls. */
export function csvCell(value: unknown): string {
  let text=String(value??'');
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
