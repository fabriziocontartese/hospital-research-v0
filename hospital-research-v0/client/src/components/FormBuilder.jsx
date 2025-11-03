import { useEffect, useMemo, useState } from 'react';
import styles from './FormBuilder.module.css';

const DEFAULT_SCALE = { min: 1, max: 5, step: 1 };

const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 32);

const normaliseItem = (item, index) => {
  if (!item) {
    return {
      linkId: `question-${index + 1}`,
      text: '',
      type: 'text',
      required: false,
      options: [],
      scale: DEFAULT_SCALE,
    };
  }

  const mappedType =
    item.type === 'string'
      ? 'text'
      : item.type === 'choice'
        ? 'dropdown'
        : item.type === 'number'
          ? 'scale'
          : item.type === 'boolean'
            ? 'dropdown'
            : item.type;

  const options =
    item.options ||
    item.answerOption ||
    (item.type === 'choice' && Array.isArray(item.answerOption) ? item.answerOption : []);

  const scale = item.scale || (item.type === 'number' ? { min: 0, max: 10, step: 1 } : DEFAULT_SCALE);

  return {
    linkId: item.linkId || `question-${index + 1}`,
    text: item.text || '',
    type: mappedType,
    required: Boolean(item.required),
    options: options || [],
    scale,
  };
};

const FormBuilder = ({ initialSchema, onSave, onCancel, submitLabel }) => {
  const [metadata, setMetadata] = useState({
    id: '',
    title: '',
    version: '1.0',
  });

  const [items, setItems] = useState([normaliseItem(null, 0)]);

  useEffect(() => {
    if (!initialSchema) return;
    setMetadata({
      id: initialSchema.id || '',
      title: initialSchema.title || '',
      version: initialSchema.version || '1.0',
    });
    setItems((initialSchema.items || []).map((item, index) => normaliseItem(item, index)));
  }, [initialSchema]);

  const enrichedItems = useMemo(() => items.map((item, index) => ({ ...item, index })), [items]);

  const updateItem = (index, changes) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      let linkId = current.linkId;
      if (Object.prototype.hasOwnProperty.call(changes, 'text')) {
        const suggestion = slugify(changes.text || '') || `question-${index + 1}`;
        linkId = `${suggestion}-${index + 1}`;
      }
      next[index] = {
        ...current,
        ...changes,
        linkId,
      };
      if (changes.type && changes.type !== current.type) {
        if (changes.type === 'scale') {
          next[index].scale = current.scale || DEFAULT_SCALE;
        } else if (changes.type === 'dropdown' || changes.type === 'checkboxes') {
          next[index].options = current.options?.length ? current.options : ['Option 1'];
        } else {
          next[index].options = [];
        }
      }
      return next;
    });
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addItem = () => {
    setItems((prev) => [...prev, normaliseItem(null, prev.length)]);
  };

  const addOption = (index) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const existing = Array.isArray(current.options) ? current.options : [];
      const label = existing.length ? `Option ${existing.length + 1}` : 'Option 1';
      next[index] = {
        ...current,
        options: [...existing, label],
      };
      return next;
    });
  };

  const updateOptionValue = (index, optionIndex, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const options = [...(current.options || [])];
      options[optionIndex] = value;
      next[index] = {
        ...current,
        options,
      };
      return next;
    });
  };

  const removeOption = (index, optionIndex) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const options = [...(current.options || [])];
      if (options.length <= 1) {
        return prev;
      }
      options.splice(optionIndex, 1);
      next[index] = {
        ...current,
        options,
      };
      return next;
    });
  };

  const handleScaleChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const updatedScale = {
        ...current.scale,
        [field]: Number.isNaN(Number(value)) ? current.scale[field] : Number(value),
      };
      if (updatedScale.min >= updatedScale.max) {
        updatedScale.max = updatedScale.min + 1;
      }
      next[index] = {
        ...current,
        scale: updatedScale,
      };
      return next;
    });
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const schema = {
      id: metadata.id.trim() || 'form-id',
      title: metadata.title.trim() || 'Untitled form',
      version: metadata.version.trim() || '1.0',
      items: items.map((item, index) => ({
        linkId: item.linkId || `question-${index + 1}`,
        text: item.text.trim() || `Question ${index + 1}`,
        type: item.type,
        required: item.required,
        options: item.type === 'dropdown' || item.type === 'checkboxes' ? item.options : undefined,
        scale: item.type === 'scale' ? item.scale : undefined,
      })),
    };
    onSave(schema);
  };

  return (
    <form className={styles.formBuilder} onSubmit={onSubmit}>
      <div className={styles.metadata}>
        <label>
          Form ID
          <input
            value={metadata.id}
            onChange={(event) => setMetadata((prev) => ({ ...prev, id: event.target.value }))}
            required
          />
        </label>
        <label>
          Title
          <input
            value={metadata.title}
            onChange={(event) => setMetadata((prev) => ({ ...prev, title: event.target.value }))}
            required
            placeholder="Untitled form"
          />
        </label>
        <label>
          Version
          <input
            value={metadata.version}
            onChange={(event) => setMetadata((prev) => ({ ...prev, version: event.target.value }))}
            required
          />
        </label>
      </div>

      <div className={styles.items}>
        {enrichedItems.map((item) => (
          <div key={item.index} className={styles.itemCard}>
            <div className={styles.itemHeader}>
              <strong>Question {item.index + 1}</strong>
              {items.length > 1 ? (
                <button type="button" onClick={() => removeItem(item.index)}>
                  Remove
                </button>
              ) : null}
            </div>

            <label>
              Question text
              <input
                value={item.text}
                onChange={(event) => updateItem(item.index, { text: event.target.value })}
                required
                placeholder="Ask a question"
              />
            </label>

            <div className={styles.inlineRow}>
              <label>
                Response type
                <select
                  value={item.type}
                  onChange={(event) => updateItem(item.index, { type: event.target.value })}
                >
                  <option value="text">Short answer</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="checkboxes">Checkboxes</option>
                  <option value="scale">Linear scale</option>
                </select>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(event) => updateItem(item.index, { required: event.target.checked })}
                />
                Required
              </label>
            </div>

            {(item.type === 'dropdown' || item.type === 'checkboxes') && (
              <div className={styles.choiceEditor}>
                <span className={styles.choiceLabel}>Choices</span>
                <div className={styles.choiceList}>
                  {(item.options || []).map((option, optionIndex) => (
                    <div key={optionIndex} className={styles.choiceRow}>
                      <input
                        value={option}
                        onChange={(event) => updateOptionValue(item.index, optionIndex, event.target.value)}
                        placeholder={`Option ${optionIndex + 1}`}
                      />
                      <button
                        type="button"
                        className={styles.choiceRemove}
                        onClick={() => removeOption(item.index, optionIndex)}
                        disabled={(item.options || []).length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.choiceAdd}
                    onClick={() => addOption(item.index)}
                  >
                    + Add option
                  </button>
                </div>
              </div>
            )}

            {item.type === 'scale' ? (
              <div className={styles.scaleRow}>
                <label>
                  Minimum
                  <input
                    type="number"
                    value={item.scale?.min ?? DEFAULT_SCALE.min}
                    onChange={(event) => handleScaleChange(item.index, 'min', event.target.value)}
                  />
                </label>
                <label>
                  Maximum
                  <input
                    type="number"
                    value={item.scale?.max ?? DEFAULT_SCALE.max}
                    onChange={(event) => handleScaleChange(item.index, 'max', event.target.value)}
                  />
                </label>
                <label>
                  Step
                  <input
                    type="number"
                    value={item.scale?.step ?? DEFAULT_SCALE.step}
                    min={1}
                    onChange={(event) => handleScaleChange(item.index, 'step', event.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={addItem} className={styles.addQuestion}>
          + Add question
        </button>
        <div className={styles.actionRight}>
          {onCancel ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          <button type="submit" className={styles.primary}>
            {submitLabel || 'Save form'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default FormBuilder;
