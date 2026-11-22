import { useEffect, useMemo, useRef, useState } from 'react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  suggestionBadge?: string;
  inputClassName?: string;
  dropdownPlacement?: 'bottom' | 'top';
  onFocusExtra?: () => void;
  required?: boolean;
  ariaLabel?: string;
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  suggestionBadge,
  inputClassName = 'w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-[#111315] focus:outline-none focus:border-slate-400',
  dropdownPlacement = 'bottom',
  onFocusExtra,
  required,
  ariaLabel,
}: AutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const lastTypedLengthRef = useRef(value.length);

  // Sync typed length tracker when value is updated externally
  useEffect(() => {
    if (!focused) {
      lastTypedLengthRef.current = value.length;
    }
  }, [value, focused]);

  const matchingSuggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 8);
    const prefixMatches = suggestions.filter((item) =>
      item.toLowerCase().startsWith(q)
    );
    const containsMatches = suggestions.filter(
      (item) =>
        !item.toLowerCase().startsWith(q) && item.toLowerCase().includes(q)
    );
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [value, suggestions]);

  const applyInlineAutocomplete = (rawValue: string, isDeleting: boolean) => {
    const trimmed = rawValue.trimStart();
    if (!trimmed || isDeleting || isComposingRef.current) {
      onChange(rawValue);
      lastTypedLengthRef.current = rawValue.length;
      return;
    }

    const q = trimmed.toLowerCase();
    const match = suggestions.find((item) => item.toLowerCase().startsWith(q));
    if (match && match.length > trimmed.length) {
      onChange(match);
      lastTypedLengthRef.current = trimmed.length;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el && document.activeElement === el) {
          el.setSelectionRange(trimmed.length, match.length);
        }
      });
    } else {
      onChange(rawValue);
      lastTypedLengthRef.current = rawValue.length;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    const inputType = (e.nativeEvent as InputEvent | undefined)?.inputType ?? '';
    const isDeleting =
      inputType.startsWith('delete') ||
      nextValue.length < lastTypedLengthRef.current;
    setActiveIdx(-1);
    applyInlineAutocomplete(nextValue, isDeleting);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && matchingSuggestions.length > 0) {
      e.preventDefault();
      setFocused(true);
      setActiveIdx((prev) =>
        prev < matchingSuggestions.length - 1 ? prev + 1 : 0
      );
      return;
    }
    if (e.key === 'ArrowUp' && matchingSuggestions.length > 0) {
      e.preventDefault();
      setFocused(true);
      setActiveIdx((prev) =>
        prev > 0 ? prev - 1 : matchingSuggestions.length - 1
      );
      return;
    }
    if (e.key === 'Enter' && focused && activeIdx >= 0) {
      e.preventDefault();
      const picked = matchingSuggestions[activeIdx];
      if (picked) {
        onChange(picked);
        lastTypedLengthRef.current = picked.length;
        setFocused(false);
        setActiveIdx(-1);
      }
      return;
    }
    if (e.key === 'Escape' && focused) {
      setFocused(false);
      setActiveIdx(-1);
      return;
    }
    if (e.key === 'Tab' && inputRef.current) {
      const el = inputRef.current;
      if (el.selectionStart !== el.selectionEnd) {
        el.setSelectionRange(el.value.length, el.value.length);
        lastTypedLengthRef.current = el.value.length;
      }
      setFocused(false);
    }
  };

  const dropdownPositionClass =
    dropdownPlacement === 'top'
      ? 'bottom-[calc(100%+4px)]'
      : 'top-[calc(100%+4px)]';

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        required={required}
        autoComplete="off"
        aria-label={ariaLabel}
        value={value}
        onFocus={() => {
          onFocusExtra?.();
          setFocused(true);
          setActiveIdx(-1);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setFocused(false);
            setActiveIdx(-1);
          }, 120);
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          applyInlineAutocomplete(e.currentTarget.value, false);
        }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
      />
      {focused && matchingSuggestions.length > 0 && (
        <div
          className={`absolute left-0 right-0 min-w-[160px] ${dropdownPositionClass} z-30 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden max-h-44 overflow-y-auto`}
        >
          {matchingSuggestions.map((item, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={item}
                type="button"
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onChange(item);
                  lastTypedLengthRef.current = item.length;
                  setFocused(false);
                  setActiveIdx(-1);
                }}
                className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#111315] text-white'
                    : 'text-[#111315] hover:bg-[#F7F8FA]'
                }`}
              >
                <span className="truncate">{item}</span>
                {suggestionBadge && (
                  <span
                    className={`text-[10px] shrink-0 ${
                      isActive ? 'text-white/70' : 'text-[#8A8F98]'
                    }`}
                  >
                    {suggestionBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
