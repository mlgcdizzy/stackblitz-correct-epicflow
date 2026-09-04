'use client';

import { useState } from 'react';
import type { Epic } from '@/lib/types';

interface Props {
  epic: Epic;
  field: keyof Epic;
  type?: 'text' | 'number';
  placeholder?: string;
  onSaved: () => Promise<void> | void;
  className?: string;
}

/** Click-to-edit cell/value used on the Epics list and Epic detail pages for the roadmap-enrichment fields. */
export function EditableField({ epic, field, type = 'text', placeholder = '— assign —', onSaved, className }: Props) {
  const currentValue = epic[field];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue == null ? '' : String(currentValue));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const parsed = type === 'number' ? (value.trim() === '' ? null : parseFloat(value)) : value.trim() || null;
      await fetch(`/api/epics/${epic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parsed }),
      });
      await onSaved();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValue(currentValue == null ? '' : String(currentValue));
            setEditing(false);
          }
        }}
        className={className ?? 'w-full rounded border border-accent-500 px-1.5 py-0.5 text-sm focus:outline-none'}
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="text-left hover:text-accent-600" title="Click to edit">
      {currentValue != null && currentValue !== '' ? String(currentValue) : <span className="text-muted">{placeholder}</span>}
    </button>
  );
}
