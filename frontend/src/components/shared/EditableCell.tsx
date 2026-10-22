/**
 * EditableCell — inline editable table cell for portfolio and initiative editing.
 */

import React, { useState, useRef, useEffect } from 'react';

interface EditableCellProps {
  value: string;
  onSave: (value: string) => void;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  placeholder?: string;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onSave,
  type = 'text',
  options,
  placeholder,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setEditValue(value);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <span
        className="editable-cell"
        onClick={() => {
          setEditValue(value);
          setEditing(true);
        }}
        title="Click to edit"
      >
        {value || <span className="editable-placeholder">{placeholder || '—'}</span>}
      </span>
    );
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        className="editable-input"
        title="Select a value"
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className="editable-input"
      placeholder={placeholder}
    />
  );
};
