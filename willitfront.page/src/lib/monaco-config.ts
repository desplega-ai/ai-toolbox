import type { Monaco } from '@monaco-editor/react';
import type { SchemaResponse } from '@/types/api';
import type { editor, Position } from 'monaco-editor';

export function configureMonaco(monaco: Monaco, schema: SchemaResponse) {
  // Register SQL language completion provider
  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model: editor.ITextModel, position: Position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        // Keywords
        ...schema.keywords.map(keyword => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
        })),
        // Functions
        ...schema.functions.map(fn => ({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}()`,
          range,
        })),
        // Tables
        ...schema.tables.map(table => ({
          label: table.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: table.name,
          detail: 'Table',
          range,
        })),
        // Columns (from all tables)
        ...schema.tables.flatMap(table =>
          table.columns.map(col => ({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: col.name === 'by' ? '"by"' : col.name,
            detail: `${col.type}${col.nullable ? ' (nullable)' : ''} - ${col.description}`,
            range,
          }))
        ),
      ];

      return { suggestions };
    },
  });
}
