import { useEffect } from 'react';

/**
 * Editors register here while they are on screen. The update coordinator
 * reads this instead of guessing from input values.
 */
export interface DocumentEditorRegistration {
  dirty: boolean;
}

const openEditors = new Set<DocumentEditorRegistration>();

export function registerDocumentEditor(editor: DocumentEditorRegistration): () => void {
  openEditors.add(editor);
  return () => {
    openEditors.delete(editor);
  };
}

export function documentEditorBlocksReload(): boolean {
  return openEditors.size > 0;
}

/** `active` is true while the editor is mounted (or a drawer is open). */
export function useDocumentEditor(active: boolean, dirty: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    return registerDocumentEditor({ dirty });
  }, [active, dirty]);
}
