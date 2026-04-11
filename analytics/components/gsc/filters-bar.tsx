'use client';

import { useState } from 'react';
import { X, Plus, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GscFilter } from './types';

/**
 * Barre de filtres facon GSC : liste de filtres actifs avec chip,
 * bouton "+ Nouveau filtre" qui ouvre un mini-form.
 */
export function FiltersBar({
  filters,
  onChange,
}: {
  filters: GscFilter[];
  onChange: (filters: GscFilter[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<GscFilter>({
    dimension: 'query',
    operator: 'contains',
    expression: '',
  });

  // Validation du draft — factorise pour pouvoir binder au clic OK
  // comme a la touche Enter dans l'input.
  const commitDraft = () => {
    const value = draft.expression.trim();
    if (!value) return;
    onChange([...filters, { ...draft, expression: value }]);
    setDraft({ ...draft, expression: '' });
    setAdding(false);
  };

  const operatorLabel: Record<GscFilter['operator'], string> = {
    equals: 'est',
    notEquals: "n'est pas",
    contains: 'contient',
    notContains: 'ne contient pas',
    includingRegex: 'regex',
    excludingRegex: 'sauf regex',
  };

  const dimensionLabel: Record<GscFilter['dimension'], string> = {
    query: 'Requête',
    page: 'Page',
    country: 'Pays',
    device: 'Appareil',
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />
      {filters.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
          data-testid={`active-filter-${i}`}
        >
          <span className="font-medium">{dimensionLabel[f.dimension]}</span>
          <span className="text-muted-foreground">
            {operatorLabel[f.operator]}
          </span>
          <span className="font-mono">&quot;{f.expression}&quot;</span>
          <button
            type="button"
            onClick={() => onChange(filters.filter((_, j) => j !== i))}
            className="ml-1 rounded p-0.5 hover:bg-muted"
            aria-label="Retirer le filtre"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-1 rounded-md border border-primary/40 bg-muted/40 p-1 text-xs">
          <select
            value={draft.dimension}
            onChange={(e) =>
              setDraft({
                ...draft,
                dimension: e.target.value as GscFilter['dimension'],
              })
            }
            className="h-7 rounded border border-input bg-transparent px-2"
          >
            <option value="query">Requête</option>
            <option value="page">Page</option>
            <option value="country">Pays</option>
            <option value="device">Appareil</option>
          </select>
          <select
            value={draft.operator}
            onChange={(e) =>
              setDraft({
                ...draft,
                operator: e.target.value as GscFilter['operator'],
              })
            }
            className="h-7 rounded border border-input bg-transparent px-2"
          >
            <option value="contains">contient</option>
            <option value="notContains">ne contient pas</option>
            <option value="equals">est</option>
            <option value="notEquals">n&apos;est pas</option>
            <option value="includingRegex">regex</option>
            <option value="excludingRegex">sauf regex</option>
          </select>
          <input
            value={draft.expression}
            onChange={(e) =>
              setDraft({ ...draft, expression: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setAdding(false);
              }
            }}
            placeholder="valeur"
            data-testid="filter-value-input"
            autoFocus
            className="h-7 w-40 rounded border border-input bg-transparent px-2"
          />
          <button
            type="button"
            onClick={commitDraft}
            data-testid="filter-commit"
            className="h-7 rounded bg-primary px-3 text-primary-foreground"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-7 rounded px-2 text-muted-foreground hover:bg-muted"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          data-testid="add-filter"
          className={cn(
            'flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <Plus className="h-3 w-3" />
          Ajouter un filtre
        </button>
      )}
    </div>
  );
}
